# Handoff Report — Teamwork Preview Explorer (Milestone 1_2)

This report details the findings, logic chains, and proposed fixes for 5 identified bugs, logical flaws, and performance bottlenecks in `vortex-core/src/nnue` and `vortex-core/src/evaluate.rs`.

---

## 1. Observation

### Observation A: Missing 512× Factor in Dequantization
In `vortex-core/src/nnue/forward.rs` lines 53 and 92:
```rust
53:         let product = (a * b) >> FT_SHIFT; // FT_SHIFT is 9
...
92:     let dequant = 1.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);
```
Line 53 right-shifts the Squared Clipped-ReLU (SCReLU) activation by 9, dividing the raw product by 512. The dequantization factor on line 92 does not multiply by 512.0 to compensate, causing all output evaluations and policy logits (line 163) to be 512 times smaller than they should be.

### Observation B: Threat Accumulator Incremental Update Mismatch
In `vortex-core/src/nnue/network.rs` line 261:
```rust
261:         let attacks = Self::get_attacks(piece, color, sq, board.occupancies[2]);
```
Incremental threat accumulator updates check for actual attacks using the board's occupancy (`board.occupancies[2]`), whereas the `ThreatMap` (used for PyTorch training data and full refreshes in `refresh_threats` / `get_threat_indices`) is computed on an empty board. This creates a divergence between full refreshes and incremental updates, causing the accumulator to leak/drift during search.

### Observation C: Reversed Signs in Handcrafted Pawn Tension Evaluation
In `vortex-core/src/evaluate.rs` lines 275-282:
```rust
275:     score -= (count_bits(w_attacks_left & black_pawns) as i16) * 10;
276:     score -= (count_bits(w_attacks_right & black_pawns) as i16) * 10;
...
281:     score += (count_bits(b_attacks_left & white_pawns) as i16) * 10;
282:     score += (count_bits(b_attacks_right & white_pawns) as i16) * 10;
```
White attacking Black pawns subtracts from White's evaluation, and Black attacking White pawns adds to White's evaluation, which is completely backwards.

### Observation D: Mathematically Inconsistent King Safety Scaling
In `vortex-core/src/evaluate.rs` lines 141-147:
```rust
141:         if w_safety < b_safety {
142:             score += (w_safety as f32 * 1.4) as i16 - b_safety;
```
If `w_safety < b_safety` (White king is less safe), the 1.4 multiplier scales White's raw safety score rather than the safety difference. If `w_safety = 10` and `b_safety = 20`, this results in `14 - 20 = -6` (reducing the penalty compared to the simple difference of -10). If `w_safety = -20` and `b_safety = -10`, it yields `-28 - (-10) = -18` (increasing the penalty).

### Observation E: NNUE Weights Mutex Contention Bottleneck
In `vortex-core/src/nnue/weights.rs` line 49 and `vortex-core/src/nnue/forward.rs` line 66:
```rust
49: pub static WEIGHTS: Mutex<VortexWeights> = Mutex::new(VortexWeights::new());
...
66:     let w = WEIGHTS.lock().unwrap_or_else(|e| e.into_inner());
```
During parallel search (Lazy SMP), multiple threads invoke `evaluate_nnue` simultaneously. Because `WEIGHTS` is a global `Mutex`, all search threads block trying to acquire the exclusive lock, serializing evaluation and eliminating parallel search scaling.

---

## 2. Logic Chain

1. **SCReLU Scaling**: Since the activation layer scales down output by a factor of 512, but the dequantization factor doesn't scale it back up, the network score is mathematically compressed to near-zero values.
2. **Threat Updates**: Because the training script and the engine's `refresh_threats` compile empty-board threats (blocker-free), the network expects empty-board threat features to be active. Tracking blocked threats incrementally means expected features are missing, and accumulator updates will leak when lines of sight change without a moving attacker/victim.
3. **Pawn Tension Signs**: Since `score` represents White's advantage, adding to the score should correspond to White advantages (White attacking Black) and subtracting to Black advantages (Black attacking White). The current code does the exact opposite.
4. **King Safety**: Scaling a signed value representing a score rather than scaling the difference between the scores creates a mathematically flawed progression where a positive safety score is rewarded for being low.
5. **Mutex Serialization**: Multiple threads concurrently executing a Mutex lock-unlock cycle on every leaf node evaluation blocks thread execution. This reduces parallel search speedups.

---

## 3. Caveats

- We assumed that the training script uses empty-board threats because `features.rs::get_threat_indices` generates threat features without using the occupancy mask. If the training script was supposed to use blocked threats, then `features.rs` and `refresh_threats` are bugged instead. In either case, they must match.
- We did not check the performance impact of copy-on-push operations of the search stack accumulators, though this might be another minor bottleneck.

---

## 4. Conclusion

The Vortex Chess Engine has critical bugs in its NNUE scaling and threat accumulator logic, evaluation sign errors in handcrafted pawn tension and king safety, and a performance bottleneck due to mutex usage. Addressing these via the proposed patches in `analysis.md` will improve both search strength and multi-threaded scaling.

---

## 5. Verification Method

- **Compilation**: Run `cargo check` or `cargo build` in `vortex-core` after implementing the fixes.
- **Unit Tests**: Run `cargo test` in `vortex-core` to verify that evaluations and accumulators match.
- **Search Strength Verification**: Run a local engine derby match using `npm run derby` to confirm that the NNUE engine plays significantly better than HCE after the scaling and threat update fixes are applied.
