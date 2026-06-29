# Technique 4: Ray-Board SIMD Threat Detection

**Source:** Reckless NNUE (`src/nnue/accumulator/threats/vectorized.rs`, `vectorized/avx2.rs`, `vectorized/avx512.rs`)

## What It Replaces

Standard threat computation iterates attackers one by one. For each piece, you compute its attack set, check what's attacked, generate features. This is inherently scalar:

```rust
for each piece on the board:
    attacks = attacks_from(piece.type, piece.square, occupancy)
    for each attacked_sq in attacks:
        generate_threat_feature(piece, attacked_sq)
```

This is O(pieces × attacks) — expensive when many pieces have sliding attacks.

## The Reckless Innovation

Reckless **reformulates the entire 64-square board as a SIMD vector** and computes all attacks simultaneously using a clever "ray-board" encoding.

### Core Idea

1. **Permute the mailbox** (64 bytes, one per square) into "ray order" — all squares along each of the 8 directions (N, NE, E, SE, S, SW, W, NW) are laid out contiguously.
2. **Apply piece-type bitmasks** to the reordered board to get occupancy per ray.
3. **Use the hyperbola quintessence trick** (vectorized) to find the closest piece on each ray — in both directions.
4. **Map results back** to threat features.

## The Ray Permutation (`vectorized.rs`)

### Compile-Time Precomputation

```rust
const RAY_PERMUTATIONS: [[u8; 64]; 64] = {
    let mut perms = [[0u8; 64]; 64];
    for sq in 0..64 {
        let mut idx = 0;
        // For each of the 8 rays (N, NE, E, SE, S, SW, W, NW):
        for dir in DIRECTIONS {
            // Walk along the ray from the square
            let mut cursor = sq;
            while let Some(next) = advance(cursor, dir) {
                perms[sq][idx] = next;
                idx += 1;
                cursor = next;
            }
        }
        // Fill remaining with 0x80 (invalid/off-board sentinel)
        while idx < 64 {
            perms[sq][idx] = 0x80;
            idx += 1;
        }
    }
    perms
};
```

For each square, this produces a 64-entry table mapping "position in ray order" → "actual square index." Invalid directions (try to go North from rank 7) map to `0x80` — a negative index that becomes zero in `_mm512_shuffle_epi8` (the shuffle byte is ignored when the top bit is set).

### The Permutation in Action

Original mailbox (indexed by square):
```
[0]  [1]  [2]  ...  [63]
```

After permutation for square `e4` (index 28):

| Ray | Squares in ray order |
|-----|---------------------|
| N   | e5, e6, e7, e8 |
| NE  | f5, g6, h7 |
| E   | f4, g4, h4 |
| SE  | f3, g2, h1 |
| S   | e3, e2, e1 |
| SW  | d3, c2, b1 |
| W   | d4, c4, b4, a4 |
| NW  | d5, c6, b7, a8 |
| (invalid) | 0x80 repeated to fill 64 |

### Board to Ray Order (`board_to_rays()`)

```rust
fn board_to_rays(board: __m512i, sq: Square) -> (__m512i, u64) {
    // Permute the 64-byte mailbox into ray order for this square
    let perm = RAY_PERMUTATIONS[sq];
    let ray_board = _mm512_permutexvar_epi8(perm, board);
    // Apply piece-type bitmask via shuffle
    let occupied = _mm512_shuffle_epi8(ray_board, PIECE_TO_BITS);
    // Reduce to u64 bitmask
    let mask = _mm512_movemask_epi8(occupied);
    (ray_board, mask)
}
```

On AVX2 (no VBMI2), the permutation requires a multi-step swizzle:

```rust
fn board_to_rays_avx2(board: [__m256i; 2], sq: Square) -> ([__m256i; 2], u64) {
    // Step 1: Load the permutation
    let perm_lo = load(&RAY_PERMUTATIONS[sq][0..32]);
    let perm_hi = load(&RAY_PERMUTATIONS[sq][32..64]);

    // Step 2: Swizzle with half-cross-lane permute
    let half1 = _mm256_permute2x128_si256(board[0], board[1], perm_lo);
    let half2 = _mm256_permute2x128_si256(board[0], board[1], perm_hi);

    // Step 3: Shuffle within lanes (vpshufb)
    let ray_lo = _mm256_shuffle_epi8(half1, perm_lo);
    let ray_hi = _mm256_shuffle_epi8(half2, perm_hi);

    // Step 4: Blend to select correct bytes
    let ray_board = [_mm256_blendv_epi8(ray_lo, ray_hi, cross_mask), ...];

    // Step 5: Get bitmask
    let mask = _mm256_movemask_epi8(ray_board[0])
             | (_mm256_movemask_epi8(ray_board[1]) << 32);
    (ray_board, mask)
}
```

## Closest Piece Per Ray (`closest_on_rays()`)

Once the board is in ray order with an occupancy bitmask, Reckless applies a **vectorized hyperbola quintessence**:

```rust
fn closest_on_rays(ray_mask: u64) -> u64 {
    // The classic bitboard trick: occ ^ (occ - 1) gives the least
    // significant set bit and all trailing zeros as ones.
    // Vectorized: do this for all 8 rays simultaneously.

    // Step 1: Add wall bits at ray boundaries to prevent
    // cross-ray contamination
    let wall_bits = 0x8181818181818181u64;  // MSB per byte
    let o = ray_mask | wall_bits;

    // Step 2: Subtract 0x03 per byte (2 bits below each ray start)
    // to isolate the first blocker on each ray
    let sub = 0x0303030303030303u64;
    let x = o ^ (o.wrapping_sub(sub));

    // Step 3: Mask out wall bits to get clean result
    x & !wall_bits
}
```

This is the same algorithm used in Stockfish's bitboard attack generation, but applied to the **reordered ray-board** instead of raw square coordinates. The key insight: by arranging squares in ray order, all 8 rays can be processed with a single 64-bit SWAR operation.

## Threat Index Generation

From the ray-board result, Reckless maps found pieces back to threat features:

```rust
fn splat_threats(ray_board: __m512i, ray_results: u64, sq: Square, accum: &mut ThreatAccumulator) {
    // Each set bit in ray_results indicates a discovered attack
    let mut attacked = ray_results;

    // AVX-512 VBMI2: compress and map in one step
    while attacked != 0 {
        let bit = attacked.trailing_zeros();
        attacked &= attacked - 1;
        let attacked_sq = ray_order_to_square(sq, bit);
        let victim = piece_at(ray_board, attacked_sq);
        let delta = ThreatDelta::new(piece, sq, victim, attacked_sq, true);
        accum.delta.push(delta);

        // Also compute the reverse: enemy piece now threatens our piece
        let defender = piece_at(ray_board, sq);
        let reverse = ThreatDelta::new(victim, attacked_sq, defender, sq, true);
        accum.delta.push(reverse);
    }
}
```

On AVX-512 VBMI2, the scalar `while` loop is replaced with `_mm512_maskz_compress_epi8` — extracting only the active threat indices directly into the delta buffer.

## Applying to Vortex

### Rust Implementation

Since vortex-core is in Rust, you can directly adapt this technique:

```rust
// Step 1: Precompute ray permutations at compile time
const RAY_PERM: [[u8; 64]; 64] = compute_ray_permutations();

// Step 2: Pack the board as a SIMD vector
let mailbox = _mm512_loadu_si512(board.mailbox_ptr());

// Step 3: For each occupied square, compute threats
for sq in board.occupied_squares() {
    let (ray_board, occupancy_mask) = board_to_rays(mailbox, sq, RAY_PERM[sq]);
    let threats = closest_on_rays(occupancy_mask);
    generate_threat_features(ray_board, threats, sq, &mut deltas);
}
```

### TypeScript Implementation (Scalar Fallback)

TypeScript can't use SIMD for this, but the algorithm can be implemented scalarly:

```typescript
const RAY_DIRECTIONS = [
  [0, 1], [1, 1], [1, 0], [1, -1],
  [0, -1], [-1, -1], [-1, 0], [-1, 1]
];

function computeThreatsForSquare(board: Board, sq: number): ThreatDelta[] {
  const deltas: ThreatDelta[] = [];
  const piece = board.pieceAt(sq);

  for (const [df, dr] of RAY_DIRECTIONS) {
    let f = sq % 8 + df;
    let r = Math.floor(sq / 8) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const targetSq = r * 8 + f;
      const targetPiece = board.pieceAt(targetSq);
      if (targetPiece) {
        deltas.push(new ThreatDelta(piece, sq, targetPiece, targetSq, true));
        break; // first piece blocks the ray
      }
      f += df;
      r += dr;
    }
  }
  return deltas;
}
```

The key benefit even in scalar: the **ray-order encoding** makes the data layout optimal if you ever add WASM SIMD or a native addon.

### Adaptation for WASM (vortex-core may build to WASM)

If vortex-core targets WASM, the ray permutation is even more natural:

```rust
// WASM SIMD: 8×16 = 128 bits
let mailbox = wasm_i8x16_load(mailbox_ptr);
let perm = wasm_i8x16_load(ray_perm_ptr);
let ray_board = wasm_i8x16_swizzle(mailbox, perm);
// Process 8 bytes (one rank) at a time
```

## Performance Numbers (from Reckless codebase)

| Operation | Scalar | AVX2 | AVX-512 VBMI2 |
|-----------|--------|------|---------------|
| Threat refresh (all pieces) | ~5000 cycles | ~800 cycles | ~300 cycles |
| Threat delta (one piece) | ~200 cycles | ~40 cycles | ~15 cycles |
| Ray permutation | N/A | ~8 instructions | 1 instruction |
| Closest-on-rays | loop per ray | 1 SWAR | 1 SWAR |
| Index generation | scalar loop | scalar bitloop | compress instruction |

## Why It's Reckless

The ray-board encoding is a **completely custom data structure** — no standard NNUE does this. It requires:
- **Compile-time permutation tables** (64 × 64 bytes = 4KB of read-only data)
- **Custom per-square reordering** of the entire board state
- **SWAR hyperbola quintessence** applied to reorganized data (not raw bitboards)
- **AVX-512 VBMI2 dependence** for maximum performance (falls back to complex AVX2 swizzle)

It sacrifices simplicity and readability for raw attack computation speed — exactly what an aggressive engine needs to evaluate tactical positions quickly.
