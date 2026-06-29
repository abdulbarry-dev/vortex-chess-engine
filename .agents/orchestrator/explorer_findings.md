# Phase 1 NNUE Core Architecture Code Review Findings

## 1. Dual Accumulator Architecture & Incremental Updates

### Assessment of Code Structure (`accumulator.rs`, `network.rs`, and `types.rs`)
The dual accumulator design specified in `plan.md` (PstAccumulator and ThreatAccumulator) is **not fully implemented**. While the structures exist, they contain only stubs and are completely missing the logic required to initialize, compute, and incrementally update the accumulator values.

#### PstAccumulator
- **Implementation Status**: Only the basic data structure is defined.
- **Missing Delta Tracking**: There is no delta tracking structure (e.g. `PstDelta`) defined or tracked in `accumulator.rs`.
- **Missing Methods**: It completely lacks the `apply_delta`, `record_move`, and `refresh` functions specified in `plan.md` and research documents.

#### ThreatAccumulator
- **Implementation Status**: Only the data structure and threat delta packer (`ThreatDelta`) are defined.
- **Missing Functionality**: There is no threat feature index mapping or attack-relation lookup. No logic exists to generate threat indices or compute threat updates based on piece attacks.
- **Stubbed Methods**: In `accumulator.rs`, it only defines helper stubs:
```rust
impl ThreatAccumulator {
    pub fn new() -> Self { ... }
    pub fn push_delta(&mut self, delta: ThreatDelta) { ... }
    pub fn clear_deltas(&mut self) { ... }
    pub fn deltas(&self) -> &[ThreatDelta] { ... }
}
```

#### IncrementalNetwork (`network.rs`)
- **Plan Mismatch**: The implementation lacks the stack-based architecture requested in `plan.md` to track search plies. The plan specifies:
```rust
pub struct IncrementalNetwork {
    pub pst_stack: Vec<PstAccumulator>,     // allocated once, indexed by ply
    pub threat_stack: Vec<ThreatAccumulator>,
    pub index: usize,
}
```
However, `network.rs` implements a flat structure without stacks or ply indexing:
```rust
#[derive(Clone, Copy)]
pub struct IncrementalNetwork {
    pub pst: PstAccumulator,
    pub threat: ThreatAccumulator,
}
```
- **Stubbed-out Methods**:
  - `refresh_pst(w_king_sq, b_king_sq)` is completely stubbed out. It only copies biases to the accumulator values but does not loop over pieces or calculate their HalfKP features relative to the kings:
  ```rust
  pub fn refresh_pst(&mut self, _w_king_sq: Square, _b_king_sq: Square) {
      let weights = WEIGHTS.lock().unwrap();
      if !weights.is_loaded { return; }
      self.pst.values[0].copy_from_slice(&weights.pst_biases);
      self.pst.values[1].copy_from_slice(&weights.pst_biases);
      self.pst.accurate[0] = true;
      self.pst.accurate[1] = true;
      // Piece loops would go here... For Phase 1 we stub this...
  }
  ```
  - `update_pst` only sets validity flags to `false` and does not apply any incremental deltas:
  ```rust
  pub fn update_pst(&mut self, _pt: PieceType, _color: Color, _from: Square, _to: Square) {
      let weights = WEIGHTS.lock().unwrap();
      if !weights.is_loaded { return; }
      self.pst.accurate[0] = false; // Mark dirty for now
      self.pst.accurate[1] = false;
  }
  ```
  - The stack operations `push` and `pop` are completely absent.
  - The lazy evaluation system (`ensure_accurate`, `can_update_incrementally`) is not implemented.

---

## 2. Multiplicative FT Activation

### Assessment of Math & Scaling (`forward.rs` and `types.rs`)
The activation function `activate_ft` is defined as:
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

### Mathematical Analysis of `FT_SHIFT` and Scaling
1. **Dynamic Range & Precision Loss**:
   - `sums` are clamped to `[0..255]`.
   - The product of two sums has a maximum value of $255 \times 255 = 65,025$.
   - Shifting right by `FT_SHIFT = 9` divides this product by $2^9 = 512$.
   - The maximum output value is $\lfloor 65,025 / 512 \rfloor = 127$.
   - **Precision Loss**: The output values occupy a `u8` container but are compressed into `[0..127]`. This wastes 1 bit of precision. If `FT_SHIFT = 8` (divide by 256) were used, the maximum output value would be $\lfloor 65,025 / 256 \rfloor = 254$, utilizing the full 8-bit dynamic range and conserving precision.
2. **PyTorch vs. Weight Quantization**:
   - If the training script uses `(left * right) >> 9`, the training model learns weights scaled up by 2 to compensate. During weight quantization, these larger weights are twice as likely to saturate the `i8` range `[-128, 127]`, causing clipping artifacts.
3. **Mathematical Dequantization Bug**:
   - The project plan states:
     `DEQUANT = 1.0 / (FT_QUANT × FT_QUANT × L1_QUANT)`
   - This formula completely fails to account for the right-shift operation (`>> 9`). Because the shift scales down the L1 inputs by a factor of 512, the final evaluation score will be scaled down by 512, rendering the network evaluation effectively zero.
   - **Correction**: The dequantization multiplier must account for the shift:
     `DEQUANT = (1 << FT_SHIFT) as f32 / (FT_QUANT as f32 * FT_QUANT as f32 * L1_QUANT as f32)`

---

## 3. Serialization & Weight Layout

### Assessment of weight loader (`serialize.rs` and `weights.rs`)
The parsing function `load_vortex_weights` is highly stubbed out and contains a major layout mismatch with `plan.md`.

#### Mismatch and Missing Parsers
1. **Layout Mismatch**:
   - **Plan Specification**: Magic (4B) -> Version/Sizes Metadata (14B) -> PST weights -> PST biases -> Threat weights -> Phase embeddings -> NN layers.
   - **Current Parser**: Reads Magic "VRTX" (4B) -> PST biases (`pst_biases`) -> PST weights (`pst_weights`).
   - If a file following the plan layout is loaded, the parser will parse metadata bytes as PST biases and fail completely or load corrupted weights.
2. **Missing Weights & Layers**:
   - The parser completely ignores threat weights, phase embeddings, L1/L2/L3 weights, and biases.
   - These fields are initialized to empty vectors.

---

## 4. GameState & Engine Integration

### Assessment of Integration (`state.rs`, `lib.rs`, and `nnue.rs`)
The new `IncrementalNetwork` is entirely bypassed.

1. **Move Making/Unmaking cycle**:
   - In `state.rs`, `make_move()` calls `self.nnue.update_pst(...)` which is a stub that only marks validity flags dirty.
   - In `unmake_move()`, there is no call to update or pop the network state.
   - There are no threat calculations or updates to the threat accumulator deltas.
2. **Evaluation & Search**:
   - In `evaluate.rs`, the engine still creates a local `Accumulator` and uses `refresh_accumulator` and `evaluate_nnue` from `nnue.rs` (the old single-accumulator system).
   - In `lib.rs`, the WASM entry point `load_nnue` is wired to the old `load_nnue_buffer` and does not reference `load_vortex_weights`.

---

## Recommendations & Implementation Path

### Phase 2 Readiness Status
**NOT READY**. The Phase 1 NNUE Core Architecture is a set of non-functional stubs that must be fully implemented before Phase 2 (Handcrafted Fallback Evaluation) and Phase 3 (Training) can be integrated.

### Actionable Roadmap

1. **Fix Serialization and File Format**:
   - Rewrite `load_vortex_weights` to read the metadata header (Format version, sizes) and validate them.
   - Correct the byte offset reading order: header metadata -> `pst_weights` -> `pst_biases` -> `threat_weights` -> `phase_embeddings` -> L1/L2/L3 weights and biases.

2. **Implement Stack-based Incremental Updates**:
   - Redefine `IncrementalNetwork` to contain `pst_stack: Vec<PstAccumulator>`, `threat_stack: Vec<ThreatAccumulator>`, and a current index `ply`.
   - Implement `push` (which copies accumulators from `ply - 1` and records the move delta) and `pop` (which decrements the index).
   - Implement the threat relationship generator to calculate attackers, victims, and squares during moves and push `ThreatDelta` objects.

3. **Resolve Math and Scaling in Activation**:
   - Change `FT_SHIFT` from `9` to `8` to utilize the full 8-bit dynamic range of `u8` and prevent weight quantization saturation.
   - If `FT_SHIFT` must remain `9`, correct the `DEQUANT` multiplier in the forward pass to include the `(1 << FT_SHIFT)` factor.

4. **Wired into Search & Evaluation**:
   - Update `evaluate.rs` to call `state.nnue.evaluate(state)`.
   - Update `state.make_move()` to call `self.nnue.push(&self.board, m)`.
   - Update `state.unmake_move()` to call `self.nnue.pop()`.
