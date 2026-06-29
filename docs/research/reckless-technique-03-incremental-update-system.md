# Technique 3: Incremental Update System

**Source:** Reckless NNUE (`src/nnue/accumulator/psq.rs:105`, `src/nnue/accumulator/threats.rs:141`, `src/nnue/nnue.rs:169`)

## What It Replaces

A naive NNUE recomputes the entire accumulator from scratch on every evaluation call:
```
for each piece on the board:
    for each neuron in L1_SIZE:
        add weight to accumulator
```
This is 32 piece × 768 neurons = 24,576 operations per evaluation — prohibitively expensive at millions of nodes.

## The Reckless Innovation

Every move changes only a few features. Reckless tracks **exactly what changed** and applies only the deltas:

```
accumulator_new = accumulator_old
                - weights[removed_features]
                + weights[added_features]
```

This is done through a **stack-based system** where each ply stores its own accumulator state and the delta that led to it.

## Stack Architecture (`nnue.rs:132`)

```rust
struct Network {
    index: usize,                             // current ply depth
    pst_stack: Box<[PstAccumulator]>,         // per-ply PST state
    threat_stack: Box<[ThreatAccumulator]>,    // per-ply threat state
    cache: AccumulatorCache,                   // full-state cache for refreshes
    nnz_table: Box<[SparseEntry]>,             // LUT for NNZ discovery
}
```

### Push/Pop (`nnue.rs:169-186`)

```rust
fn push(&mut self, board: &Board, move: Move) {
    self.index += 1;
    let prev = &self.pst_stack[self.index - 1];
    let curr = &mut self.pst_stack[self.index];
    curr.copy_from(prev);                        // copy previous state
    curr.delta.record_move(board, move);         // record what changed
    curr.accurate = [false, false];              // mark as needing update
}

fn pop(&mut self) {
    self.index -= 1;                             // just decrement
}
```

### Lazy Evaluation (`nnue.rs:197`)

The accumulator is **not** updated during `push()`. It's updated lazily during `evaluate()`:

```rust
fn evaluate(&mut self, board: &Board, stm: Color) -> i32 {
    self.ensure_accurate(board, stm);
    self.ensure_accurate(board, !stm);
    // Now both perspectives are valid, run forward pass
    self.forward(stm)
}
```

## PST Incremental Update (`psq.rs:105`)

### Delta Structure

```rust
struct PstDelta {
    moving_piece: PieceType,
    from: Square,
    to: Square,
    captured: Option<PieceType>,    // piece that was captured
    capture_sq: Square,
    castling_rook_from: Option<Square>,
    castling_rook_to: Option<Square>,
}
```

### Update Logic

```rust
fn update(&mut self, board: &Board) {
    let prev = &self.delta;
    let curr = &mut self.values;

    // Remove piece from old square
    self.apply_delta(curr, prev.from, prev.moving_piece, false);

    // Add piece to new square
    self.apply_delta(curr, prev.to, prev.moving_piece, true);

    // Handle capture (remove captured piece)
    if let Some(captured) = prev.captured {
        self.apply_delta(curr, prev.capture_sq, captured, false);
    }

    // Handle castling (move rook)
    if let Some((r_from, r_to)) = prev.castling_rook {
        self.apply_delta(curr, r_from, ROOK, false);
        self.apply_delta(curr, r_to, ROOK, true);
    }
}
```

### `apply_delta` (`psq.rs:140`)

Walks `L1_SIZE` in SIMD lanes:
```rust
fn apply_delta(values: &mut [[i16; L1_SIZE]; 2], sq: Square, pt: PieceType, add: bool) {
    let feature_pov0 = pst_index(WHITE, pt, sq, WHITE);
    let feature_pov1 = pst_index(BLACK, pt, sq, BLACK);
    let sign: i16 = if add { 1 } else { -1 };

    // SIMD loop over L1_SIZE in I16_LANES chunks
    for i in (0..L1_SIZE).step_by(I16_LANES) {
        let w = load(&weights[feature_pov0][i..]);
        values[0][i..] += sign * w;
        let w = load(&weights[feature_pov1][i..]);
        values[1][i..] += sign * w;
    }
}
```

### Cache-Based Full Refresh (`psq.rs:33`)

```rust
fn refresh(&mut self, board: &Board, cache: &mut CacheEntry) {
    let mut adds = Vec::new();
    let mut subs = Vec::new();

    // Diff current board against cache's bitboards
    for pt in ALL_PIECES {
        let curr_bb = board.pieces(pt);
        let changed = curr_bb ^ cache.pieces[pt];
        for sq in changed {
            if curr_bb.has(sq) && !cache.pieces[pt].has(sq) {
                adds.push((pt, sq));    // piece appeared since cache
            } else {
                subs.push((pt, sq));    // piece disappeared since cache
            }
        }
    }

    // Apply only the changes
    self.apply_changes(cache, &adds, &subs);
}
```

## Threat Incremental Update (`threats.rs:141`)

### Delta Structure

```rust
struct ThreatDelta(u32);
// bit 0-7:   attacker piece type
// bit 8-15:  from square (attacker position)
// bit 16-23: victim piece type
// bit 24-30: to square (victim position)
// bit 31:    add flag (1 = adding, 0 = removing)
```

### Update on Move

When a piece moves from `from` to `to`:

```rust
fn update(&mut self, board: &Board) {
    // 1. Old position: remove outgoing threats, remove incoming attacks
    push_threats_on_change(self, board, prev.piece, prev.from, false);

    // 2. New position: add outgoing threats, add incoming attacks
    push_threats_on_change(self, board, prev.piece, prev.to, true);

    // 3. X-ray discoveries: pieces that now attack through 'from' or 'to'
    for slider in [BISHOP, ROOK, QUEEN] {
        if let Some((attacker, attacked)) = xray_through(board, slider, prev.from, prev.to) {
            push_threat(self, attacker, prev.from, attacked, false);
            push_threat(self, attacker, prev.to, attacked, true);
        }
    }
}
```

### `push_threats_on_change` (`scalar.rs:25`)

```rust
fn push_threats_on_change(accum: &mut ThreatAccumulator, board: &Board,
                          piece: PieceType, sq: Square, add: bool) {
    // 1. Attacks by this piece from this square
    for attacked_sq in attacks_from(piece, sq, board.occupancy()) {
        let attacked = board.piece_at(attacked_sq);
        let delta = ThreatDelta::new(piece, sq, attacked, attacked_sq, add);
        accum.delta.push(delta);
    }

    // 2. Attacks to this square (enemy threats targeting this piece)
    for (enemy_type, enemy_sq) in attackers_to(board, sq, !piece.color()) {
        let delta = ThreatDelta::new(enemy_type, enemy_sq, piece, sq, add);
        accum.delta.push(delta);
    }

    // 3. X-ray attacks through this square
    for slider in [BISHOP, ROOK, QUEEN] {
        if let Some((attacker, attacked_sq, attacked)) = xray_though_square(board, slider, sq) {
            let delta = ThreatDelta::new(slider, attacker, attacked, attacked_sq, add);
            accum.delta.push(delta);
        }
    }
}
```

## Accuracy Tracking

Each perspective (stm, nstm) has an `accurate` flag:

```rust
fn can_update(&self, board: &Board, pov: Color) -> bool {
    let prev = &self.stack[self.index - 1];
    let curr = &mut self.stack[self.index];

    if !prev.accurate[pov] {
        return false;    // previous state also needs refresh
    }

    // Check if king moved to a different bucket
    let prev_king_sq = board.prev_king(pov);
    let curr_king_sq = board.king(pov);
    if bucket(prev_king_sq) != bucket(curr_king_sq) {
        return false;    // bucket changed, must full refresh
    }

    true
}
```

If `can_update` returns false, a full `refresh()` from cache is triggered.

## Applying to Vortex

### TypeScript

Your current `Accumulator.ts` already has a basic incremental update — `addFeature` and `removeFeature`. But it lacks:

1. **Stack-based history** — you need an array of accumulators indexed by ply
2. **Lazy evaluation** — only update when `evaluate()` is actually called
3. **Accuracy tracking** — track which perspectives are valid
4. **Cache system** — store bitboards for delta-based full refresh

```typescript
class IncrementalNetwork {
  stack: Accumulator[] = [];
  index: number = 0;

  push(move: Move) {
    this.index++;
    if (this.index >= this.stack.length) {
      this.stack.push(new Accumulator());
    }
    // Copy previous state
    this.stack[this.index].copyFrom(this.stack[this.index - 1]);
    // Record delta (don't apply yet)
    this.stack[this.index].recordDelta(move);
  }

  pop() {
    this.index--;
  }

  ensureAccuracy(board: Board) {
    const acc = this.stack[this.index];
    for (const pov of [WHITE, BLACK]) {
      if (!acc.accurate[pov]) {
        if (this.canUpdateIncrementally(board, pov)) {
          acc.applyDelta(board, pov);
        } else {
          acc.fullRefresh(board, pov);
        }
        acc.accurate[pov] = true;
      }
    }
  }

  evaluate(board: Board, stm: Color): number {
    this.ensureAccuracy(board);
    return this.forwardPass(stm);
  }
}
```

### Rust (vortex-core)

Your `nnue.rs` currently does a **full refresh every evaluation**:
```rust
pub fn evaluate(state: &GameState) -> i16 {
    let mut acc = Accumulator::new();
    refresh_accumulator(state, &mut acc);  // ← full rebuild every time
    evaluate_nnue(state, &acc)
}
```

To make this incremental:

1. **Store accumulator in GameState** (or Search stack) — don't recreate it
2. **Track deltas per move** — which piece moved, from where, to where, captured what
3. **Apply deltas** instead of full refresh
4. **Do a full refresh only** when the accumulator is invalidated (e.g., null move, hash probe)

```rust
struct SearchStack {
    acc: Accumulator,
    // ... other search state
}

fn search_move(state: &mut GameState, stack: &mut SearchStack, move: Move) {
    let delta = compute_feature_delta(&state.board, move);
    stack.acc.apply_delta(&delta);
    state.make_move(move);
    // ... recurse ...
    state.undo_move(move);
    stack.acc.apply_delta_inverse(&delta);
}
```

## Performance Characteristics

| Operation | Full Refresh | Incremental | Speedup |
|-----------|-------------|-------------|---------|
| PST update | ~24K ops | ~2K ops | ~12× |
| Threat update | ~200K ops | ~5K ops | ~40× |
| Cache-based refresh | ~24K ops | ~500 ops | ~48× |
| Memory per ply | 0 (fresh alloc) | 3KB (copy) | -3KB |

## Why It's Reckless

The threat accumulator delta system is particularly aggressive:
- **Up to 80 deltas per move** (potentially more than a full refresh in extreme cases!)
- **X-ray discovery tracking** requires scanning for all sliders that attack through the changed square
- **Packed 32-bit deltas** sacrifice readability for density

Most implementations stop at "sub old feature, add new feature." Reckless goes further: it tracks x-ray attacks, en passant edge cases, and castling rook moves all as first-class delta operations.
