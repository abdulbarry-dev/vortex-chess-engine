# Technique 1: Multiplicative Feature Transformer Activation

**Source:** Reckless NNUE (`src/nnue/nnue.rs`, `src/nnue/forward/`)

## What It Replaces

Standard NNUEs use ClippedReLU (CReLU) on the feature transformer output:
```
ft_out[i] = clamp(accumulator[i], 0, FT_QUANT)   // typically [0, 255]
```

Each neuron independently fires based on its accumulator value. There is no interaction between neurons at the FT level — all interactions are learned in the hidden layers.

## The Reckless Innovation

Reckless splits its 768-wide FT accumulator into **two 384-wide halves** and computes each output neuron as the **product** of one value from each half:

```
left  = clamp(pst[i] + threat[i], 0, 255)         // i ∈ [0, 384)
right = clamp(pst[i+384] + threat[i+384], 0, 255) // i ∈ [0, 384)
ft_out[i]            = (left * right) >> 9         // first half
ft_out[i + FT_SIZE/2] = (left * right) >> 9       // mirrored for other perspective
```

### Why This Matters

Every FT neuron now represents a **pairwise interaction** between two feature subspaces. The network doesn't just learn "does feature A exist?" but "**how do features A and B co-occur?**" This is a built-in quadratic feature expansion at the very first layer, giving the tiny hidden layers (16 → 32 → 1) exponentially more expressive power.

### Mathematical Intuition

Standard CReLU: `y_i = σ(a_i)` — each output is a function of one accumulator element.

Multiplicative: `y_i = σ(a_i) × σ(a_{i+384})` — each output is a function of two accumulator elements. The gradient flows through both paths:
- `∂L/∂a_i = ∂L/∂y_i × σ(a_{i+384}) × σ'(a_i)`
- `∂L/∂a_{i+384} = ∂L/∂y_i × σ(a_i) × σ'(a_{i+384})`

This means both halves must fire for the neuron to fire — creating an AND-like gating mechanism.

## SIMD Implementation

### Vectorized Path (`forward/vectorized.rs`)

```rust
// Process 2*I16_LANES elements at a time
for i in (0..FT_SIZE/2).step_by(2*I16_LANES) {
    // Load 4 vectors: two from each half
    lhs1 = load(pst[i..] + threat[i..])
    lhs2 = load(pst[i+I16_LANES..] + threat[i+I16_LANES..])
    rhs1 = load(pst[i+FT_SIZE/2..] + threat[i+FT_SIZE/2..])
    rhs2 = load(pst[i+FT_SIZE/2+I16_LANES..] + threat[i+FT_SIZE/2+I16_LANES..])

    // Clamp both sides
    lhs1 = max(lhs1, 0); lhs1 = min(lhs1, FT_QUANT)
    lhs2 = max(lhs2, 0); lhs2 = min(lhs2, FT_QUANT)
    rhs1 = min(rhs1, FT_QUANT)  // rhs already ≥ 0 from half-split
    rhs2 = min(rhs2, FT_QUANT)

    // Fixed-point multiply-high: (lhs * rhs) >> FT_SHIFT
    // Preshift lhs by (16 - FT_SHIFT - MUL_HI_SHIFT) so the high
    // 16 bits of the 32-bit product give the correctly-shifted result
    shifted1 = lhs1 << (16 - FT_SHIFT - MUL_HI_SHIFT)
    shifted2 = lhs2 << (16 - FT_SHIFT - MUL_HI_SHIFT)
    product1 = mul_high_i16(shifted1, rhs1_clipped)
    product2 = mul_high_i16(shifted2, rhs2_clipped)

    // Pack i16 products into u8 with saturation
    packed = packus(product1, product2)

    // Permute to correct output layout (interleave halves)
    output = permute(packed)
}
```

### Why `mul_high_i16`?

The product of two i16 values is naturally 32 bits. `mulhi_epi16` extracts the top 16 bits. By pre-shifting the left operand by `(16 - FT_SHIFT)`, the top 16 bits become `(lhs * rhs) >> FT_SHIFT`.

For NEON, `vqdmulhq_s16` doubles the result (for Q15 format), so `MUL_HI_SHIFT = 1` to compensate. For x86, `MUL_HI_SHIFT = 0`.

## Applying to Vortex

### TypeScript (Existing NNUE)

Your current `NnueEvaluator.ts` uses `Math.max(0, hidden[i])` (ReLU on the hidden layer). To adopt multiplicative FT activation:

1. **Split your accumulator into two halves** — even if you keep the same `HIDDEN_SIZE`, split the 768 features into [0..383] and [384..767]
2. **Replace the linear accumulation** in `Accumulator.ts` with:
```typescript
// After accumulating PST into accumulator:
for (let i = 0; i < FT_SIZE / 2; i++) {
  const left = Math.max(0, Math.min(255, pstAccum[i] + threatAccum[i]));
  const right = Math.max(0, Math.min(255, pstAccum[i + FT_SIZE/2] + threatAccum[i + FT_SIZE/2]));
  ftOutput[i] = (left * right) >> 9;
}
```
3. **Remove the separate hidden layer ReLU** — the FT already does nonlinear activation

### Rust (vortex-core)

Your `nnue.rs` currently has `HIDDEN_SIZE = 256` with a standard `INPUT_SIZE = 40960` HalfKP scheme. To adopt multiplicative activation:

1. **Split L1_SIZE into two halves** (e.g., L1_SIZE = 512, each half = 256)
2. **Replace the clamp in `evaluate_nnue`** with the pairwise product
3. **Adjust forward pass** to process `(pst + threat) >> 9` as a pair

### Architectural Impact

| Aspect | Standard CReLU | Multiplicative (Reckless) |
|--------|---------------|--------------------------|
| FT outputs | 768 independent | 768 pairwise-interaction |
| Hidden layer needed | Larger (e.g., 768→256→32) | Can be tiny (768→16→32→1) |
| Nonlinearity | At FT + hidden | At FT (product is nonlinear) |
| Gradient flow | Per-neuron | Cross-neuron (both halves) |
| Sparsity at FT | ~50% zeros | ~75% zeros (product of two) |

## Key Parameters

| Constant | Value | Purpose |
|----------|-------|---------|
| `FT_QUANT` | 255 | Clamp maximum for each half |
| `FT_SHIFT` | 9 | Right shift after product (scale down) |
| `FT_SIZE` | 768 | Total accumulator width |
| `FT_HALF` | 384 | Each half's width |

## Why It's Reckless

This is not a standard NNUE technique. Every major engine (Stockfish, Torch, Komodo) uses CReLU at the FT. The multiplicative approach is:
- **Computationally heavier** (multiply per neuron vs. clamp)
- **Harder to train** (gradient vanishes if either half is zero)
- **More expressive** (quadratic feature interactions without hidden layer expansion)

It sacrifices speed for tactical pattern recognition — fitting for an aggressive engine.
