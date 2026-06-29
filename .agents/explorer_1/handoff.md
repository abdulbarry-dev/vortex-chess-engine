# Handoff Report — Phase 1 NNUE Core Architecture Code Review

## 1. Observation

Direct observations made in the codebase:
- **PstAccumulator and ThreatAccumulator**: In `vortex-core/src/nnue/accumulator.rs`, there are no methods to perform incremental updates, refreshes, or threat generation.
- **IncrementalNetwork**: In `vortex-core/src/nnue/network.rs`, the struct contains no stack arrays (`pst_stack`/`threat_stack`) or ply index (`index`), instead declaring:
  ```rust
  pub struct IncrementalNetwork {
      pub pst: PstAccumulator,
      pub threat: ThreatAccumulator,
  }
  ```
  Methods `refresh_pst` (line 20) and `update_pst` (line 37) are empty stubs.
- **Mathematical Scaling Check**: In `vortex-core/src/nnue/forward.rs`, line 37 computes the multiplicative product as:
  ```rust
  let product = (sums[i] as u32 * sums[i + FT_HALF] as u32) >> FT_SHIFT;
  ```
  Since `sums` are clamped to `[0..255]` (`FT_QUANT`), the product maximum is $255 \times 255 = 65,025$. With `FT_SHIFT` set to `9`, the maximum value is $\lfloor 65,025 / 512 \rfloor = 127$, resulting in 1 bit of precision loss and a scaling mismatch.
- **Serialization**: In `vortex-core/src/nnue/serialize.rs`, lines 24-33 load PST biases first and then PST weights, bypassing headers and omitting all threats, phase embeddings, and network layers:
  ```rust
  // 1. PST Biases (FT_SIZE x i16)
  for i in 0..FT_SIZE {
      w.pst_biases[i] = read_i16();
  }
  ```
- **GameState/Engine Integration**: In `vortex-core/src/state.rs`, line 130 calls `self.nnue.update_pst(...)` on move make but lacks any call to update on move unmake, or any search integration in `vortex-core/src/evaluate.rs` where the old single-accumulator `refresh_accumulator` is still used.

## 2. Logic Chain

- **Dual Accumulator**: Since the stack arrays and update routines are missing/stubbed, and `ThreatAccumulator` does not calculate attacks, the dual accumulator system is non-functional.
- **Multiplicative FT**: Since `65,025 >> 9` restricts activations to `[0..127]`, it wastes the 8-bit dynamic range of `u8`. Furthermore, the plan's `DEQUANT` divisor does not account for this factor of 512, which would scale all evaluation outputs to near-zero.
- **Serialization**: The parser reads biases followed by weights immediately, completely mismatching the metadata header and weight order in the design plan.
- **Engine Integration**: The engine continues to use the old `Accumulator` and `evaluate_nnue` functions from `nnue.rs`, bypassing the new `IncrementalNetwork`.

## 3. Caveats

- We assumed that `plan.md` represents the correct final specifications. If the training pipeline or TypeScript bridge expects a different layout or different quantization scale, adjustments should be aligned.

## 4. Conclusion

The Phase 1 NNUE Core Architecture implementation is **not ready** for Phase 2. It contains non-functional stubs, a mathematical scaling bug in the FT activation, a serialization mismatch, and is completely bypassed by the engine search and evaluation.

## 5. Verification Method

To verify these findings:
1. Inspect the stubbed methods in `vortex-core/src/nnue/network.rs` (lines 20-54).
2. Check the parsing order in `vortex-core/src/nnue/serialize.rs` (lines 24-33) and compare it to the layout in `plan.md` (lines 285-309).
3. Inspect `vortex-core/src/evaluate.rs` (line 23) to confirm it is still using the old `nnue.rs` functions.
