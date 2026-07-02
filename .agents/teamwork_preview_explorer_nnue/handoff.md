# NNUE Core Architecture Audit Report

This report presents a deep read-only audit of the NNUE core architecture in `vortex-core/src/nnue/`, focusing on the dequantization multiplier, threat accumulator updates, and locking primitives for static weights.

---

## 1. Observation

### Focus Area 1: Dequantization Multiplier
In `vortex-core/src/nnue/forward.rs` (lines 85-93), the L1 layer dequantization factor is computed as:
```rust
    let mut l1_out = [0.0f32; L2_SIZE];
    let l1_bias_offset = bucket * L2_SIZE;
    // Dequantisation factor (plan §1.5):
    //   DEQUANT = 1 / (FT_QUANT × FT_QUANT × L1_QUANT)
    //           = 1 / (255 × 255 × 64) ≈ 2.4e-7
    // The SCReLU product (a×b)>>9 is implicitly scaled by FT_QUANT²;
    // L1 weights are quantised by L1_QUANT. Both must be undone here.
    let dequant = 512.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);
```
In `vortex-core/src/nnue/forward.rs` (lines 44-59), the activation function (SCReLU) performs a bitwise right-shift of 9 (`FT_SHIFT`):
```rust
    let mut ft = [0u8; FT_SIZE];
    for i in 0..FT_HALF {
        let a = clamped[i] as u32;
        let b = clamped[i + FT_HALF] as u32;
        let product = (a * b) >> FT_SHIFT;
        ft[i]           = product.min(255) as u8;
        ft[i + FT_HALF] = ft[i]; // SCReLU symmetry: both halves carry the same activation
        // ...
    }
```
In `vortex-core/src/types.rs` (lines 35-36), the constants are:
```rust
pub const FT_QUANT: i32 = 255;
pub const FT_SHIFT: u8 = 9;
```

Similarly, in `evaluate_policy_move` in `forward.rs` (lines 158-163):
```rust
    // Dequantisation is NOT needed here because FT in Rust is in [0, 255] which is
    // treated as [0, 1.0] in PyTorch. Wait, in evaluate_nnue we had:
    // val = (sum as f32) * dequant + ...
    // Since policy weights are trained in float-space on [0,1] features, we need to divide by FT_QUANT^2.
    // SCReLU squares the values, so it's scaled by FT_QUANT * FT_QUANT.
    let dequant = 512.0 / (FT_QUANT as f32 * FT_QUANT as f32);
```

### Focus Area 2: Threat Accumulator Updates
In `vortex-core/src/nnue/threat_map.rs` (lines 48-52), `ThreatMap::new()` computes attacks on an empty board:
```rust
                    PieceType::Knight => crate::attacks::get_knight_attacks(from as u8),
                    PieceType::Bishop => crate::magic::get_bishop_attacks(from as u8, 0),
                    PieceType::Rook => crate::magic::get_rook_attacks(from as u8, 0),
                    PieceType::Queen => crate::magic::get_bishop_attacks(from as u8, 0) | crate::magic::get_rook_attacks(from as u8, 0),
                    PieceType::King => crate::attacks::get_king_attacks(from as u8),
```
In `vortex-core/src/nnue/network.rs` (lines 293-319), `get_attacks` computes sliding attacks with `all_pieces` occupancy mask set to `0` (empty board):
```rust
            PieceType::Bishop => crate::magic::get_bishop_attacks(sq, all_pieces),
            PieceType::Rook   => crate::magic::get_rook_attacks(sq, all_pieces),
            PieceType::Queen  => {
                crate::magic::get_bishop_attacks(sq, all_pieces)
                    | crate::magic::get_rook_attacks(sq, all_pieces)
            }
```
In `vortex-core/src/nnue/network.rs` (lines 377-383), `apply_threat_deltas` flips squares vertically for Black perspective:
```rust
            for persp in 0..2usize {
                // Flip squares vertically for Black perspective.
                let p_from = if persp == 1 { from_sq ^ 56 } else { from_sq };
                let p_to   = if persp == 1 { to_sq   ^ 56 } else { to_sq    };

                if let Some(feat_idx) = map.get_index(attacker, p_from, victim, p_to) {
```
In `vortex-core/src/nnue/features.rs` (lines 121-131), the PyTorch training bridge uses identical mapping:
```rust
                        // White perspective — raw squares
                        if let Some(feat) = map.get_index(atk_pt, from_sq, vic_pt, to_sq) {
                            debug_assert!(feat < THREAT_FEATURES);
                            white_idx.push(feat as u32);
                        }

                        // Black perspective — flip both squares
                        if let Some(feat) = map.get_index(atk_pt, from_sq ^ 56, vic_pt, to_sq ^ 56) {
                            debug_assert!(feat < THREAT_FEATURES);
                            black_idx.push(feat as u32);
                        }
```

However, in `vortex-core/src/state.rs` (lines 130-148), `make_move` processes incremental updates as follows:
```rust
        self.board.remove_piece(us, moving_piece, from);
        
        // NNUE Incremental Update
        if crate::nnue::serialize::is_vortex_loaded() {
            self.nnue.push();
            self.nnue.update_pst(&self.board, moving_piece, us, from, to);
            if let Some((color, pt)) = captured_piece {
                let capture_sq = if flag == crate::move_core::FLAG_EP_CAPTURE {
                    if us == Color::White { to - 8 } else { to + 8 }
                } else {
                    to
                };
                // Remove captured piece from PST accumulator (I1 fix).
                self.nnue.remove_pst(&self.board, pt, color, capture_sq);
                // Record threat delta for the disappearing piece.
                self.nnue.push_threats_on_change(&self.board, color, pt, capture_sq, false);
            }
            self.nnue.update_threats(&self.board, moving_piece, us, from, to);
        }
```

### Focus Area 3: RwLock for Static Weights
In `vortex-core/src/nnue/weights.rs` (lines 49-50):
```rust
pub static WEIGHTS: std::sync::RwLock<VortexWeights> = std::sync::RwLock::new(VortexWeights::new());
pub static IS_NNUE_LOADED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
```
Line 2 of `weights.rs` shows an unused import warning:
```rust
warning: unused import: `std::sync::Mutex`
 --> src/nnue/weights.rs:2:5
  |
2 | use std::sync::Mutex;
  |     ^^^^^^^^^^^^^^^^
```

---

## 2. Logic Chain

### Focus Area 1: Dequantization Multiplier Math
1. In PyTorch training, features are normalized in $[0, 1]$. The SCReLU activation on friendly/opponent features $x, y$ evaluates to $f(x, y) = x \cdot y$.
2. In the quantized Rust implementation, the feature transformer accumulates values scaled by `FT_QUANT` = 255.
3. The raw product of two accumulator halves is therefore scaled by $\text{FT\_QUANT}^2$:
   $$\text{product\_raw} = a \cdot b = (x \cdot 255) \cdot (y \cdot 255) = (x \cdot y) \cdot 255^2$$
4. A bitwise right-shift of `FT_SHIFT` (9) is performed to squeeze the activation value into a `u8`:
   $$A = \text{product\_raw} \gg 9 = \lfloor \frac{\text{product\_raw}}{512} \rfloor \approx (x \cdot y) \cdot \frac{255^2}{512}$$
5. The L1 weights are quantized by `L1_QUANT` (64), so $W = w_{\text{float}} \cdot 64$.
6. The dot product computed is:
   $$S = \sum A \cdot W \approx \left( \sum x \cdot y \cdot w_{\text{float}} \right) \cdot \frac{255^2 \cdot 64}{512}$$
7. To recover the unquantized floating-point value $\sum x \cdot y \cdot w_{\text{float}}$, we must multiply the integer sum $S$ by the dequantization factor:
   $$\text{dequant} = \frac{512}{\text{FT\_QUANT}^2 \cdot \text{L1\_QUANT}}$$
8. This requires `512.0` in the numerator. Omitting it would scale the evaluations down by a factor of 512, leading to severe underflow relative to the unscaled float biases/hidden layers.

### Focus Area 2: Threat Map Alignment & State Desync Bug
1. The threat indices are successfully aligned across the PyTorch training bridge (`features.rs`), full refresh (`refresh_threats`), and incremental update (`apply_threat_deltas`) due to consistent empty-board checks (`all_pieces = 0` occupancy) and mirrored `^ 56` square flips for the Black perspective.
2. In `make_move` (`state.rs`), the captured piece is removed from the board at line 108 and the moving piece is removed from `from` at line 130 *before* the NNUE update methods run.
3. When `self.nnue.push_threats_on_change` is called on the captured piece at `capture_sq` (with `add = false`), the method queries `board.occupancies` to find targets. Since the moving piece has already been removed from `from` (and not yet added to `to`), the captured piece's attack on the moving piece at `from` is missed.
4. When `self.nnue.update_threats` is called for the moving piece at `from` (with `add = false`), the method queries `board.get_pieces` to find attackers. Since the captured piece is already removed from `capture_sq`, the captured piece's attack on `from` is missed.
5. Consequently, the mutual threats between the moving piece and the captured piece are never removed from the threat accumulator. They leak/remain stranded, causing the incremental accumulator state to drift from the actual board state.

### Focus Area 3: Thread Contention (Mutex vs RwLock)
1. In a multi-threaded chess engine search (Lazy SMP), search threads perform NNUE evaluations concurrently millions of times per second.
2. If `WEIGHTS` were wrapped in a `Mutex`, only one search thread could read the weights at a time, serializing search and dropping SMP scaling to zero.
3. `RwLock` allows concurrent readers, solving this basic serialization problem.
4. However, `std::sync::RwLock` requires mutating atomic reader counters internally to track concurrent readers. In highly parallel execution, multiple CPU cores constantly writing to the same cache line containing this count causes cache line bouncing and lock acquisition overhead.
5. Accessing static weights could be optimized to be completely lock-free (using static pointers, `OnceLock`, or `ArcSwap` to read a pointer reference) since weights are read-only during search.

---

## 3. Caveats

- We assumed that the training script implements SCReLU using the standard PyTorch floating-point operations. If the training script emulates the truncating integer right-shift, there will be no divergence; if not, there is a minor truncation bias (underflow to 0) which increases activation sparsity in the engine.
- We did not audit the TypeScript / Worker implementation of NNUE in the Node CLI (`NnueEvaluator.ts` / `Accumulator.ts`) to see if it replicates the Rust core's state desync bug or dequantization multiplier correctly.

---

## 4. Conclusion

1. **Dequantization Multiplier**: The `512.0` multiplier in the numerator of `dequant` in `forward.rs` is mathematically necessary and correct to compensate for the right shift by 9 (`FT_SHIFT`) in SCReLU.
2. **Threat Updates Alignment**: The threat updates are index-aligned with empty-board maps, but there is a **critical state leakage bug** in `state.rs` during captured piece updates. The removal of the captured piece and the moving piece from the board prior to calling `push_threats_on_change` prevents mutual threats from being removed, resulting in a state desync.
3. **Locking Contention**: `RwLock` is correct compared to `Mutex` for parallel search, but standard library `RwLock` introduces atomic counter contention on high-core SMP. Using static leaked pointers or `ArcSwap` is the recommended path to achieve a completely lock-free evaluation hot path.

---

## 5. Verification Method

### Test Suite Execution
Run the Rust core test suite to ensure all baseline tests pass:
```bash
cd vortex-core
cargo test
```

### Reproducing/Fixing the Threat Leak Bug
To verify the state leakage bug, inspect `vortex-core/tests/nnue_test.rs` and verify that the test suite does not play moves on a `GameState` with captured pieces while comparing the incremental threat accumulator to `refresh_threats()`.

An invalidation condition for the threat accumulator accuracy would be to assert that `network.threat_stack[index].values` is identical to the output of `refresh_threats(board)` after playing a sequence of moves containing captures in a test case.
