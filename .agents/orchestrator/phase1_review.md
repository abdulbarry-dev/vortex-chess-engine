# Phase 1 NNUE Core Architecture Code Review Report

## Executive Summary & Recommendation
- **Ready for Phase 2**: **NO**
- **Verdict**: The current Phase 1 implementation in `vortex-core` consists of non-functional skeleton structures and stubs. Crucial components, including the dual-accumulator update logic, serialization parser, multiplicative activation scaling, and GameState search integration, are either entirely missing or placeholder code. Proceeding to Phase 2 (Handcrafted Fallback Evaluation) is blocked until these architectural gaps are addressed.

---

## Architectural Alignment Analysis

This review compares the active codebase under `vortex-core/src/nnue/` against the design specifications in `plan.md` and the Reckless research documents:
1. `reckless-technique-01-multiplicative-ft-activation.md` (Multiplicative Feature Transformer)
2. `reckless-technique-02-dual-accumulator-architecture.md` (Dual Accumulator Architecture)
3. `reckless-technique-03-incremental-update-system.md` (Incremental Update System)

Below is a detailed breakdown of alignment, math scaling correctness, and structural gaps.

---

## 1. Component Review: Dual Accumulator Architecture

### Structural Integrity (`accumulator.rs` and `network.rs`)
- **Stubs vs. Implementation**: `PstAccumulator` and `ThreatAccumulator` are defined as structures in `accumulator.rs` but are completely devoid of functional execution code.
- **Delta Tracking Missing**: The `PstAccumulator` lacks any delta tracking mechanism (e.g. `PstDelta`). In `ThreatAccumulator`, the `ThreatDelta` packing structure is defined, but there is no feature index mapper or logic to record and apply threat updates.
- **Incremental updates (`network.rs`)**:
  - `refresh_pst` is a stub. It only loads biases and completely skips piece iteration loops and HalfKP index calculations.
  - `update_pst` is a stub. It merely sets the accuracy flags of both perspectives to `false` and does not apply any actual mathematical updates.
  - The stack-based layout specified in the plan (e.g. `pst_stack` and `threat_stack` vectors indexed by ply depth) is missing. The current `IncrementalNetwork` contains only flat structures (`pst: PstAccumulator`, `threat: ThreatAccumulator`), which cannot track evaluations correctly across search depths.
  - The lazy evaluation logic (`ensure_accurate`, `can_update_incrementally`) is entirely absent.

---

## 2. Component Review: Multiplicative FT Activation

### Mathematical Scaling and Precision Check (`forward.rs`)
The activation function `activate_ft` is defined as follows:
```rust
pub fn activate_ft(
    pst: &[i16; FT_SIZE],
    threat: &[i16; FT_SIZE],
    phase_embed: &[f32],
) -> [u8; FT_SIZE] {
    let mut ft = [0u8; FT_SIZE];
    let mut sums = [0i16; FT_SIZE];
    
    for i in 0..FT_SIZE {
        let embed = (phase_embed[i] * FT_QUANT as f32) as i16;
        sums[i] = (pst[i] as i32 + threat[i] as i32 + embed as i32).clamp(0, FT_QUANT as i32) as i16;
    }
    
    for i in 0..FT_HALF {
        let product = (sums[i] as u32 * sums[i + FT_HALF] as u32) >> FT_SHIFT;
        ft[i] = product.min(255) as u8;
        ft[i + FT_HALF] = ft[i];
    }
    ft
}
```

### Key Issues Identified:
1. **Precision Loss**:
   - `sums[i]` is clamped to `[0..255]`.
   - The product of `sums[i]` and `sums[i + FT_HALF]` ranges in `[0..65025]`.
   - Shifting right by `FT_SHIFT = 9` divides this product by $2^9 = 512$, resulting in a maximum output value of $\lfloor 65025 / 512 \rfloor = 127$.
   - **Consequence**: The output `u8` only uses half its dynamic range `[0..127]`, discarding 1 bit of precision. If `FT_SHIFT` were `8` (divide by 256), the maximum product would be $254$, utilizing the full 8-bit scale and preserving precision.
2. **Dequantization Multiplier Bug**:
   - `plan.md` defines the dequantization factor as:
     `DEQUANT = 1.0 / (FT_QUANT * FT_QUANT * L1_QUANT)`
   - This formula does not account for the $2^9$ division (`>> FT_SHIFT`). Because the forward pass divides the activations by 512, the final evaluation score is scaled down by 512.
   - **Correction**: The dequantization factor in evaluation must be scaled up:
     `DEQUANT = (1 << FT_SHIFT) as f32 / (FT_QUANT as f32 * FT_QUANT as f32 * L1_QUANT as f32)`

---

## 3. Component Review: Serialization

### Parser Integrity (`serialize.rs` and `weights.rs`)
- **Stubs**: `load_vortex_weights` only reads PST biases and weights. It completely ignores/stubs out threat weights, phase embeddings, and L1/L2/L3 neural layer weights and biases.
- **Layout Mismatch**:
  - `plan.md` specifies the binary layout as:
    `Magic -> Version/Sizes Metadata -> PST Weights -> PST Biases -> Threat Weights -> ...`
  - The parser in `serialize.rs` reads the magic header, then reads `pst_biases` first, followed by `pst_weights`, completely omitting the layout size/version metadata. This mismatch will fail to load or corrupt any valid `.vortex` file compiled according to the plan.

---

## 4. Integration and Execution Gaps

- **Bypassed Implementation**: The engine's search (`search.rs`), evaluation (`evaluate.rs`), and game state move-cycle (`state.rs`) completely bypass the new `IncrementalNetwork` module.
- **Old Evaluation System**: The evaluation calls in `evaluate.rs` still construct a local `Accumulator` and run the old single-accumulator refresh and evaluation logic.
- **WASM Exports**: In `lib.rs`, the WASM entry point `load_nnue` invokes the old `load_nnue_buffer` instead of `load_vortex_weights`.

---

## Actionable Recommendations & Next Steps

Before starting Phase 2, the following milestones must be resolved:

1. **Reconstruct Incremental Network Stack**:
   - Migrate `IncrementalNetwork` to a stack-based structure indexed by ply to avoid cross-depth corruption.
   - Implement delta-tracking (`PstDelta`) and lazy updates (`ensure_accurate`) so accumulators are only updated when evaluation is called.
2. **Implement Threat Feature Mapping**:
   - Write the threat feature index calculator and attack relations lookup.
   - Generate `ThreatDelta` objects in the move cycle and propagate updates to the threat accumulator.
3. **Correct Binary Serialization Layout**:
   - Rewrite `load_vortex_weights` to align with the plan layout: parse metadata header first, then load weights in the correct order: `pst_weights` -> `pst_biases` -> `threat_weights` -> `phase_embeddings` -> network layers.
4. **Fix Scaling & Dequantization Factor**:
   - Set `FT_SHIFT` to `8` or update the dequantization scale factor in evaluation (`evaluate.rs`) to account for the right-shift operation to avoid scaling the scores to zero.
5. **Integrate Incremental Network**:
   - Wire `IncrementalNetwork` push/pop into `GameState::make_move` and `unmake_move`.
   - Update `evaluate.rs` to call `state.nnue.evaluate()`.
