# Technique 2: Dual Accumulator Architecture (PST + Threats)

**Source:** Reckless NNUE (`src/nnue/accumulator/psq.rs`, `src/nnue/accumulator/threats.rs`)

## What It Replaces

Standard NNUEs use a **single** feature accumulator — typically HalfKP (king + piece positions). All evaluation knowledge is compressed into one set of features and one set of weights:

```
accumulator = biases + Σ feature_weights[piece][square][king_bucket]
```

Threats, attacks, and tactical patterns must be **inferred** by the hidden layers from positional features alone.

## The Reckless Innovation

Reckless maintains **two separate accumulators**, each 768 elements wide:

```
pst_accumulator[i]     = biases[i] + Σ piece_weights[feature][i]
threat_accumulator[i]  = Σ threat_weights[feature][i]
```

At evaluation time, they are summed:
```
ft_input[i] = pst_accumulator[i] + threat_accumulator[i]
```

### Why Two Accumulators?

1. **Different update rates**: PST features change on every move (a piece moves). Threat features can change more or less frequently depending on the tactical situation. Separate accumulators mean each can have its own optimal update strategy.

2. **Different weight types**: PST weights are `i16` (more precision for positional knowledge). Threat weights are `i8` (compressed — tactical patterns tolerate more quantization). This saves memory while keeping high precision where it matters.

3. **Different feature counts**: PST has `10 buckets × 768 = 7,680` features. Threats have `66,864` features — nearly **9× more** features, compressed into `i8` weights.

4. **Independent accuracy tracking**: Each accumulator tracks its own `accurate` flag per perspective. A null-move might invalidate the threat accumulator (tactics changed) but not the PST accumulator (pieces didn't move).

## PST Accumulator (`accumulator/psq.rs`)

### Features: HalfKP (King + Piece)

Each non-king piece relative to its own king:
```
pst_index = INPUT_BUCKETS_LAYOUT[king_sq] * 768
          + 384 * (color != perspective)
          + 64 * piece_type
          + square
```

The board is mirrored so the king is always on the same side:
```
flip = 7 * kingside  XOR  56 * perspective
```

### Data Structure

```rust
struct PstAccumulator {
    values: [[i16; L1_SIZE]; 2],    // [perspective (stm/nstm)][neuron]
    delta: PstDelta,                 // last move info for incremental update
    accurate: [bool; 2],             // is each perspective valid?
}

struct PstDelta {
    moving_piece: PieceType,
    from: Square,
    to: Square,
    captured: Option<PieceType>,
    capture_sq: Square,
    castling_rook: Option<(Square, Square)>,  // rook from/to for castling
}
```

### Refresh Strategy

During `full_refresh()`, the PST accumulator diffs the current board against a **cache entry** (`AccumulatorCache`) to compute adds/subs. The cache stores:
- `values: [i16; 768]` — the last known accumulator state
- `pieces: [Bitboard; 6]` — bitboards per piece type at cache time
- `colors: [Bitboard; 2]` — bitboards per color at cache time

Diffing against cache turns a "full" refresh into a **near-incremental** operation — only changed pieces are recomputed.

## Threat Accumulator (`accumulator/threats.rs`)

### Features: Attacker × Victim × Square × Square

Every possible attack relationship on the board:
```
threat_index = pair_base(attacker_type, victim_type)
             + piece_offset[attacker_type][attacker_sq]
             + attack_index[attacker_type][attacker_sq][victim_sq]
```

Total features: **66,864** distinct threat features.

### Data Structure

```rust
struct ThreatAccumulator {
    values: [[i16; L1_SIZE]; 2],
    delta: ArrayVec<ThreatDelta, 80>,    // packed deltas (up to 80 per move)
    accurate: [bool; 2],
}

struct ThreatDelta(u32);  // packed 32-bit:
// bits 0-7:   attacker piece type
// bits 8-15:  from square (attacker position)
// bits 16-23: victim piece type
// bits 24-30: to square (victim position)
// bit 31:     add flag (true=adding, false=removing)
```

### Update on Piece Move

When a piece moves from `from` to `to`:

1. **Remove threats from the old position**: All attacks the piece was making from `from` are subtracted
2. **Remove threats to the old position**: All enemy attacks targeting `from` are recalculated (the piece is no longer there)
3. **Add threats from the new position**: All attacks the piece now makes from `to` are added
4. **Add threats to the new position**: All enemy attacks targeting `to` are recalculated
5. **Handle x-ray discoveries/screens**: Sliding pieces that attack through `from` or `to` change their victim

### Refresh Strategy

`refresh()` iterates all occupied squares, computes attacks for each piece, and generates threat indices. For AVX-512, it uses `L1_SIZE / I16_LANES` registers (24×32-lane vectors cover the full 768). For others, it uses 8 registers in a loop.

## Combined Forward Pass

At evaluation, both accumulators are summed element-wise before activation:

```rust
fn activate_ft(pst: &Accum, threat: &Accum, stm: Color) -> [u8; 768] {
    for i in 0..768 {
        let sum = pst.values[stm][i] + threat.values[stm][i];
        ft_pre[i] = clamp(sum, 0, FT_QUANT);
    }
    // Then apply multiplicative activation (Technique 1)
}
```

## Applying to Vortex

### Architecture Decision

Your TypeScript NNUE currently has a single accumulator with `HIDDEN_SIZE = 32`. Your Rust NNUE has `HIDDEN_SIZE = 256`. To adopt dual accumulators:

1. **Create two accumulator structs** — one for PST (HalfKP), one for threats
2. **Both must be the same width** (L1_SIZE) — 256, 512, or 768
3. **Maintain two stacks** — one per ply for each accumulator
4. **Sum at evaluation time**, not before — this saves memory bandwidth

### TypeScript Outline

```typescript
class PstAccumulator {
  values: [Int16Array, Int16Array];  // [stm, nstm]
  accurate: [boolean, boolean];
  // HalfKP feature update logic
}

class ThreatAccumulator {
  values: [Int16Array, Int16Array];
  accurate: [boolean, boolean];
  // Attack-based feature update logic
}

// At evaluation:
const pst = pstAccum.values[sideToMove];
const tht = thrAccum.values[sideToMove];
const ft = new Uint8Array(L1_SIZE);
for (let i = 0; i < L1_SIZE; i++) {
  ft[i] = Math.max(0, Math.min(255, pst[i] + tht[i]));
}
```

### Rust Outline

```rust
struct DualAccumulator {
    pst: Accumulator,     // [i16; L1_SIZE] × 2 perspectives
    threat: Accumulator,  // [i16; L1_SIZE] × 2 perspectives
}

fn evaluate(dual: &DualAccumulator, stm: Color) -> i32 {
    let mut ft_out = [0u8; L1_SIZE];
    for i in 0..L1_SIZE {
        let sum = dual.pst.values[stm][i] + dual.threat.values[stm][i];
        ft_out[i] = sum.clamp(0, 255) as u8;
    }
    forward_pass(&ft_out, bucket)
}
```

## Performance Implications

| Aspect | Single Accumulator | Dual Accumulator |
|--------|-------------------|------------------|
| Memory per ply | 1 × L1_SIZE × 2 × 2 bytes | 2 × L1_SIZE × 2 × 2 bytes |
| Refresh cost | 1 pass over pieces | PST pass + threat pass |
| Update on move | Single delta | PST delta + threat deltas (up to 80) |
| Feature count | 7,680 (PST only) | 7,680 + 66,864 = 74,544 |
| Weight memory | ~15 KB (i16) | ~15 KB (i16) + ~67 KB (i8) |
| Tactical awareness | Inferred by hidden layers | Directly encoded in features |

## Why It's Reckless

Maintaining two independent accumulators is **doubling the memory and update cost** for every ply. Most engines consider this wasteful — "the hidden layers can learn threats." But Reckless bets that **explicit threat encoding** makes the network far more tactically aware, especially with the tiny hidden layers (L2=16, L3=32) that otherwise couldn't learn complex attack patterns from raw positions alone.
