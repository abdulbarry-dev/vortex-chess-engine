# Technique 8: Feature Engineering — King Buckets, Interaction Maps, Threat Encoding

**Source:** Reckless NNUE (`src/nnue/nnue.rs`, `src/nnue/accumulator/threats/threat_index.rs`, accumulator/threats/scalar.rs`)

## What It Replaces

Standard HalfKP NNUE uses each king square (0-63) as a separate bucket — 64 separate feature subspaces:
```
feature_index = king_sq * 768 + piece_index
// 64 × 768 = 49,152 total features (per perspective)
```

Threat features, if they exist, are usually just "is this piece attacked by a pawn?" — a single boolean per piece.

## The Reckless Innovation

Reckless redefines both the positional and threat feature spaces from the ground up:

1. **King buckets are reduced from 64 to 10** via a smart rank-based layout
2. **Output buckets are dynamic** — 8 sub-networks selected by material count
3. **Threat features encode every attacker×victim×square interaction** — 66,864 features
4. **A piece interaction matrix** defines which attack relationships are valid

## 1. King Buckets: 64 → 10 (`INPUT_BUCKETS_LAYOUT`)

```rust
const INPUT_BUCKETS_LAYOUT: [u8; 64] = {
    let mut buckets = [0u8; 64];
    let mut b = 0usize;
    while b < 64 {
        let rank = b / 8;
        let file = b % 8;
        buckets[b] = match rank {
            0 | 7 => file,             // ranks 1/8: bucket = file (0-7)
            1 | 6 => file + 8,         // ranks 2/7: doesn't exist in 0-9? let's reconsider
            // Actual Reckless layout:
            // Ranks 1-2 → buckets 0-7 (mirrored by file)
            // Ranks 3-4 → bucket 8
            // Ranks 5-8 → bucket 9
            0 | 1 | 6 | 7 => file % 8, // edge ranks → file-based buckets
            2 | 3 | 4 | 5 => {
                if rank < 4 { 8 } else { 9 } // center ranks → shared
            }
            _ => 0,
        };
        b += 1;
    }
    buckets
};
```

### The Bucket Algorithm

The engine maps king square to bucket:

```rust
fn king_bucket(king_sq: Square, pov: Color, kingside: bool) -> usize {
    let sq = if pov == BLACK { king_sq ^ 56 } else { king_sq };
    let rank = sq / 8;
    let file = sq % 8;

    if rank <= 1 {                // Rank 1-2: back rank
        file                       // 8 buckets (0-7) by file
    } else if rank <= 3 {         // Rank 3-4: slightly forward
        8                          // 1 bucket
    } else {                      // Rank 5-8: forward/opponent territory
        9                          // 1 bucket
    }
}
```

### Why This Makes Sense

The king's file matters greatly for pawn shield and safety (which side is the king castled to?). But its exact rank matters less — once the king moves forward beyond rank 4, it's already exposed. Compressing from 64 to 10 buckets reduces the weight matrix from `64 × 768 = 49,152` to `10 × 768 = 7,680` entries — a **6.4× reduction** with minimal loss of positional expressiveness.

## 2. Output Buckets: Material-Based Sub-Networks (`OUTPUT_BUCKETS_LAYOUT`)

```rust
const OUTPUT_BUCKETS_LAYOUT: [usize; 33] = {
    // Index by total occupancy (number of non-king pieces on board)
    // Each entry maps to one of 8 output networks
    let mut layout = [0usize; 33];

    // Opening: many pieces → networks 0-3
    layout[0] = 7;  // 0 pieces (theoretically impossible, but...)
    layout[1] = 7;
    layout[2] = 6; layout[3] = 6;
    layout[4] = 5; layout[5] = 5;
    layout[6] = 4; layout[7] = 4;
    layout[8] = 3; layout[9] = 3;
    layout[10] = 2; layout[11] = 2;
    layout[12] = 1; layout[13] = 1;

    // Middlegame: decreasing piece count → gradually changing network
    layout[14] = 0; layout[15] = 0; layout[16] = 0;

    // Endgame: few pieces → networks 4-7
    for i in 17..33 {
        layout[i] = ((i - 17) / 2) + 4;
    }
    layout
};
```

As pieces are traded, the evaluation smoothly transitions between 8 sub-networks. This allows specialized knowledge for each material phase — aggressive tactics in the middlegame, precise calculation in the endgame.

## 3. Threat Feature Space: 66,864 Features

Each threat feature encodes:
```
threat_index = piece_type_of_attacker × (attacker_square, attacked_square, piece_type_of_victim)
```

### The Piece Interaction Map (`threat_index.rs:35`)

```rust
const PIECE_INTERACTION_MAP: [[i8; 6]; 6] = [
    //  P    N    B    R    Q    K
    [  0,   1,  -1,   2,  -1,  -1],  // P attacks...
    [  0,   1,   2,   3,   4,  -1],  // N attacks...
    [  0,   1,   2,   3,  -1,  -1],  // B attacks...
    [  0,   1,   2,   3,  -1,  -1],  // R attacks...
    [  0,   1,   2,   3,   4,  -1],  // Q attacks...
    [  0,   1,   2,   3,  -1,  -1],  // K attacks...
];
```

Values:
- **-1**: This interaction is **excluded** — no feature exists for it
- **0-4**: Sub-category index within this piece-pair group

### Excluded Interactions

| Attacker \ Victim | Why Excluded |
|-------------------|--------------|
| Pawn vs Bishop | Pawns don't attack bishops (pawns attack diagonally one square, bishops are never there) |
| Pawn vs Queen | Same reason |
| Pawn vs King | Pawns don't attack kings in the feature space (king safety handled elsewhere) |
| Knight vs King | Knight checks are too rare/specific for a general feature |
| Bishop vs Queen | Bishop attacks queen → actually happens — but excluded for performance |
| Bishop vs King | Same |
| Rook vs Queen | Same |
| Rook vs King | Same |
| Queen vs King | Same |
| King vs Knight/Bishop/Rook/Queen | King attacks to non-pawns are typically "king walks" — tactical noise |

### Index Encoding (`threat_index.rs:103`)

```rust
fn threat_index(attacker: PieceType, from: Square,
                victim: PieceType, to: Square) -> Option<usize> {
    let pair = PIECE_INTERACTION_MAP[attacker][victim];
    if pair == -1 {
        return None;  // excluded
    }

    let base = pair_base(attacker, victim, from, to);
    let offset = piece_offsets[attacker][from];
    let attack_idx = attack_indices[attacker][from][to];

    let raw = base + offset + attack_idx;

    // Semi-excluded flag: if attacker > victim type (alphabetically),
    // add 0x40000000 to distinguish reversed pairs
    if attacker > victim {
        Some(raw | SEMI_EXCLUDED_FLAG)
    } else {
        Some(raw)
    }
}
```

### Semi-Exclusion

Some interactions are valid but have a flag bit set (`0x40000000`). These are interactions where the same piece pair exists in both orders (e.g., "knight attacks bishop" and "bishop attacks knight") — the flag distinguishes them. The network learns when each direction matters.

### Per-Attacker Target Counts

```rust
const PIECE_TARGET_COUNT: [usize; 6] = [6, 10, 8, 8, 10, 8];
// P: 6 distinct attack targets per square
// N: 10
// B: 8
// R: 8
// Q: 10
// K: 8
```

This allocates index space proportionally — knights and queens have more potential targets, so they get more index slots.

## 4. Threat Delta Generation on Move

When a piece moves, the scalar path generates threat deltas:

### `push_threats_on_change` (`scalar.rs:25`)

For a piece appearing/disappearing at a square:

```rust
fn push_threats_on_change(accum: &mut ThreatAccumulator, board: &Board,
                          piece: PieceType, sq: Square, add: bool) {
    // 1. Outgoing threats: this piece attacks others from this square
    for each attacked_sq in attacks_from(piece, sq, board.occupancy()) {
        let victim = board.piece_at(attacked_sq);
        push_threat_feature(accum, piece, sq, victim, attacked_sq, add);
    }

    // 2. Incoming threats: enemy pieces attack this square
    for each (enemy, enemy_sq) in attackers_to(board, sq) {
        push_threat_feature(accum, enemy, enemy_sq, piece, sq, add);
    }

    // 3. X-ray threats: sliders that attack through this square
    //    (e.g., a rook on e1 attacks e8, pawn on e2 disappears — rook now attacks e8 directly)
    for slider in [BISHOP, ROOK, QUEEN] {
        let ray = ray_through(slider, sq);
        // Check both directions along the ray
        for direction in [FORWARD, BACKWARD] {
            // Find enemy slider that sees through this square
            if let Some(enemy_slider) = find_slider_on_ray(board, slider, sq, direction) {
                // Find what was behind the square
                let behind_sq = step(sq, direction);
                let behind_piece = board.piece_at(behind_sq);

                // Remove threat from enemy slider → behind_sq
                push_threat_feature(accum, slider, enemy_slider, behind_piece, behind_sq, !add);
                // Add threat from enemy slider → sq (our piece is now at sq)
                push_threat_feature(accum, slider, enemy_slider, piece, sq, add);
            }
        }
    }
}
```

### `push_threats_on_move` (`scalar.rs:73`)

For moving a piece from `from` to `to`:

```rust
fn push_threats_on_move(accum: &mut ThreatAccumulator, board: &Board,
                        piece: PieceType, from: Square, to: Square) {
    // Simulate intermediate state with piece at neither square
    let intermediate_board = board.with_removed(from, to);

    // Remove threats from old position
    push_threats_on_change(accum, &intermediate_board, piece, from, false);

    // Add threats at new position
    push_threats_on_change(accum, &intermediate_board, piece, to, true);
}
```

The intermediate board correctly handles cases like **discovered checks**: removing the piece from `from` reveals attacks behind it, and adding it at `to` creates new attacks.

## 5. Putting It All Together: Feature Index Layout

```
Total features = PST features + Threat features

PST:  [INPUT_BUCKETS][12 piece types][64 squares] = 10 × 768 = 7,680
       Per perspective: 7,680 × 2 = 15,360 indices

Threats: [66,864 features]
         Per perspective: 66,864 × 2 = 133,728 indices

Weight matrix layout:
  ft_piece_weights:  [10 × 768][768] i16   →  PST knowledge
  ft_threat_weights: [66,864][768] i8       →  Tactical knowledge
```

## Applying to Vortex

### TypeScript

```typescript
const INPUT_BUCKETS_LAYOUT = (() => {
  const layout = new Uint8Array(64);
  for (let sq = 0; sq < 64; sq++) {
    const rank = sq >> 3;
    const file = sq & 7;
    if (rank <= 1) layout[sq] = file;       // back rank → by file (0-7)
    else if (rank <= 3) layout[sq] = 8;     // slightly forward → bucket 8
    else layout[sq] = 9;                     // forward → bucket 9
  }
  return layout;
})();

function kingBucket(kingSq: number, pov: Color): number {
  const sq = pov === Color.Black ? kingSq ^ 56 : kingSq;
  return INPUT_BUCKETS_LAYOUT[sq];
}

const PIECE_INTERACTION_MAP = [
  //  P    N    B    R    Q    K
  [  0,   1,  -1,   2,  -1,  -1],   // P
  [  0,   1,   2,   3,   4,  -1],   // N
  [  0,   1,   2,   3,  -1,  -1],   // B
  [  0,   1,   2,   3,  -1,  -1],   // R
  [  0,   1,   2,   3,   4,  -1],   // Q
  [  0,   1,   2,   3,  -1,  -1],   // K
];

function threatIndex(attacker: PieceType, from: Square, victim: PieceType, to: Square): number | null {
  const pair = PIECE_INTERACTION_MAP[attacker][victim];
  if (pair === -1) return null;
  // ... compute base + offset + attack_index
  return base + offset + attackIndex;
}
```

### Rust

Your existing `nnue.rs` already uses a form of HalfKP. To add threat features:

```rust
const INPUT_BUCKETS: usize = 10;
const THREAT_FEATURES: usize = 66864;

fn pst_feature_index(king_sq: Square, pov: Color, piece: PieceType, sq: Square) -> usize {
    let bucket = KING_BUCKETS[if pov == WHITE { king_sq } else { king_sq ^ 56 }];
    let flip = 7 * if is_kingside(king_sq) { 1 } else { 0 }
             ^ if pov == BLACK { 56 } else { 0 };

    bucket * 768
        + 384 * (if piece.color() != pov { 1 } else { 0 })
        + 64 * piece.type()
        + (sq ^ flip)
}

fn threat_feature_index(attacker: Piece, from: Square, victim: Piece, to: Square) -> Option<usize> {
    let code = PIECE_INTERACTION_MAP[attacker.type()][victim.type()];
    if code == -1 { return None; }

    let base = pair_base(attacker.type(), victim.type());
    let offset = PIECE_OFFSETS[attacker.type()][from];
    let attack = ATTACK_INDICES[attacker.type()][from][to];

    Some(base + offset + attack)
}
```

## Why It's Reckless

The threat feature space at **66,864 features** is enormous — more than 8× the PST feature count. Most engines would argue that this many threat features is wasteful because:
- Threat patterns are sparse (most attack relationships don't exist at any given position)
- The hidden layers could learn tactical patterns from raw positions
- The weight matrix is huge (49 MB for i8 threats)

But Reckless bets that **explicit threat encoding** gives the network a built-in tactical vocabulary — the L1 layer doesn't need to discover what a "fork" or "skewer" is; it just needs to weigh the evidence. This is especially valuable with tiny hidden layers (L2=16, L3=32) that wouldn't have the capacity to learn complex tactical patterns from scratch.

The bucket compression (64→10 king buckets) is also aggressive — it assumes that exact king rank beyond rank 4 is irrelevant, which may not hold in some endgame positions. But the trade-off (6.4× fewer PST weights) enables the massive threat feature space within the same memory budget.
