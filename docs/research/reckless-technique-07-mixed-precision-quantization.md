# Technique 7: Mixed-Precision Quantization Strategy

**Source:** Reckless NNUE (`src/nnue/nnue.rs:30-65`, `src/nnue/forward/`)

## What It Replaces

Standard NNUEs often use uniform quantization — everything is `i16` or everything is `i8`. Stockfish, for example, uses `i16` for the feature transformer and `i8` for hidden layers.

## The Reckless Innovation

Reckless uses **four different numeric types** in the same network, each chosen for the specific sensitivity and size of the parameter:

| Layer | Weight Type | Activation Type | Quantization | Notes |
|-------|-------------|-----------------|-------------|-------|
| FT (PST) | `i16` | `i16` sum → `u8` clamp | Bias: i16, Weights: i16 | High precision for positional features |
| FT (Threats) | `i8` | `i16` sum → `u8` clamp | Weights: i8 | Compressed — 66,864 features |
| L1 | `i8` | `u8` → `i32` → `f32` | L1_QUANT = 64 | Dot product: u8 × i8 |
| L2 | `f32` | `f32` | Full precision | Small matrix (16×32) |
| L3 | `f32` | `f32` | Full precision | Tiny (32×1) |

## Quantization Details

### 1. PST Feature Weights: `i16`

```rust
ft_piece_weights: Aligned<[[i16; L1_SIZE]; INPUT_BUCKETS * 768]>
// Shape: [10 king buckets][768 piece features][768 neurons]
// Size: 10 × 768 × 768 × 2 bytes = 11,796,480 bytes ≈ 11.3 MB
```

These are the largest weights in the network. `i16` provides:
- Range: [-32,768, 32,767]
- Used for: positional pattern recognition (sensitive to exact piece placement)

### 2. Threat Feature Weights: `i8`

```rust
ft_threat_weights: Aligned<[[i8; L1_SIZE]; 66864]>
// Shape: [66,864 threat features][768 neurons]
// Size: 66,864 × 768 × 1 byte = 51,351,552 bytes ≈ 49 MB
```

**Half the memory of i16 for nearly 9× more features.** `i8` provides:
- Range: [-128, 127]
- Used for: tactical pattern recognition (more robust to quantization error)

### 3. FT Output: `u8` with Fixed-Point Clamp

```rust
const FT_QUANT: i16 = 255;
const FT_SHIFT: i16 = 9;

ft_out[i] = clamp(pst[i] + threat[i], 0, FT_QUANT);  // u8 range

// Multiplicative activation (Technique 1):
product = (ft_out[left_half] * ft_out[right_half]) >> FT_SHIFT;
// Result: max value = (255 * 255) >> 9 = 65025 >> 9 ≈ 127
```

The output of the FT is always a `u8` in [0, 127]. This is the input to L1.

### 4. L1 Weights: `i8` with L1_QUANT = 64

```rust
const L1_QUANT: i32 = 64;

fn propagate_l1(ft_out: &[u8; L1_SIZE], nnz: &[u16], bucket: usize) -> [f32; L2_SIZE] {
    let mut output = [0f32; L2_SIZE];

    for &idx in nnz {
        let input_val = ft_out[idx as usize] as i32;  // u8: [0, 127]
        // Dot product: u8 × i8 → i32
        for j in 0..L2_SIZE {
            let weight = l1_weights[bucket][j * L1_SIZE + idx as usize] as i32;
            output_ints[j] += input_val * weight;
        }
    }

    // Dequantize: output_i32 / (FT_QUANT * L1_QUANT) * scale
    // Simplified: dequant_multiplier = 2^9 / (255 * 255 * 64)
    for j in 0..L2_SIZE {
        output[j] = (output_ints[j] as f32) * DEQUANT_MULTIPLIER + l1_biases[bucket][j];
        output[j] = output[j].clamp(0.0, 1.0);
    }

    output
}
```

The dequant multiplier:
```
DEQUANT_MULTIPLIER = 2^9 / (255 × 255 × 64)
                   = 512 / 4,161,600
                   ≈ 0.000123
```

This converts the integer dot product back to the expected floating-point range.

### 5. L2/L3: Full `f32`

```rust
l2_weights: Aligned<[[[f32; L3_SIZE]; L2_SIZE]; 8]>  // 8 × 16 × 32 × 4 = 16 KB
l2_biases:  Aligned<[[f32; L3_SIZE]; 8]>              // 8 × 32 × 4 = 1 KB
l3_weights: Aligned<[[f32; L3_SIZE]; 8]>              // 8 × 32 × 4 = 1 KB
l3_biases:  Aligned<[f32; 8]>                         // 8 × 4 = 32 bytes
```

These layers are so small (18KB total) that quantization would save <10KB — not worth the precision loss.

## Why Mixed Precision Works

### The Sensitivity Hierarchy

```
Positional (PST) > Tactical (Threats) > Pattern (L1) > Blending (L2/L3)

  i16                 i8                 i8      →    f32
 (high precision)  (compressed)     (quantized)   (full)
```

- **PST weights need i16**: Moving a pawn one square changes the evaluation by a small amount. Losing precision here blurs fine positional distinctions.
- **Threat weights can be i8**: A knight fork either exists or it doesn't. The binary nature of tactical patterns tolerates coarser quantization.
- **L1 activations stay u8**: The output of the multiplicative FT (max 127) fits in a byte. The L1 dot product (u8 × i8 → i32) accumulates into 32-bit to avoid overflow, then dequantizes.
- **L2/L3 stay f32**: They're tiny, and the nonlinear CReLU at L1 output needs precise thresholds near 0.

### Memory Footprint

| Component | Type | Count | Bytes | % of Total |
|-----------|------|-------|-------|------------|
| PST weights | i16 | 7,680 × 768 | 11,796,480 | 18.6% |
| Threat weights | i8 | 66,864 × 768 | 51,351,552 | 81.0% |
| FT biases | i16 | 768 | 1,536 | 0.002% |
| L1 weights | i8 | 8 × 16 × 768 | 98,304 | 0.15% |
| L1 biases | f32 | 8 × 16 | 512 | 0.001% |
| L2 weights | f32 | 8 × 16 × 32 | 16,384 | 0.026% |
| L2 biases | f32 | 8 × 32 | 1,024 | 0.002% |
| L3 weights | f32 | 8 × 32 | 1,024 | 0.002% |
| L3 biases | f32 | 8 | 32 | 0.0001% |
| **Total** | | | **~63.3 MB** | 100% |

81% of the weights are in the i8 threat layer — compressed tactical knowledge. If threats were i16, the model would be **~113 MB**.

## SIMD Dot Product for Mixed Precision

The L1 forward pass does a **u8 × i8 → i32** dot product. This maps perfectly to `dpbusd` (Dot Product of Unsigned and Signed Bytes):

```rust
// AVX-512 VNNI: _mm512_dpbusd_epi32
// Each instruction processes 64 bytes of input × 64 bytes of weights
// into 16 × i32 accumulators

fn dpbusd_avx512(acc: &mut [i32; L2_SIZE], input: &[u8; L1_SIZE], weights: &[i8; L1_SIZE]) {
    // Process 64 bytes at a time → 16 i32 results
    for chunk in (0..L1_SIZE).step_by(64) {
        let in_vec = _mm512_loadu_si512(&input[chunk]);       // 64 × u8
        let w_vec = _mm512_loadu_si512(&weights[chunk]);      // 64 × i8

        // dpbusd accumulates: acc[i] += Σ(input[j] × weight[j])
        // for j in [0..4] for each i
        let acc_vec = _mm512_loadu_si512(&acc[chunk / 4]);
        acc_vec = _mm512_dpbusd_epi32(acc_vec, in_vec, w_vec);
        _mm512_storeu_si512(&mut acc[chunk / 4], acc_vec);
    }
}
```

Without VNNI, the same operation requires two instructions:
```rust
// AVX2 fallback: maddubs (pairwise multiply + horizontal add)
let prod = _mm256_maddubs_epi16(input8, weight8);  // 16 × i16
let sum = _mm256_madd_epi16(prod, ones);             // 8 × i32
```

## Applying to Vortex

### Rust

Your current `nnue.rs` uses all `i16`. Adopt mixed precision:

```rust
// Current (uniform i16):
pub feature_weights: Vec<i16>,  // INPUT_SIZE × HIDDEN_SIZE

// Proposed (mixed):
pub struct QuantizedWeights {
    // PST: i16 for precision
    pub pst_weights: Vec<i16>,       // [king_buckets * 768][HIDDEN_SIZE]
    pub pst_biases: [i16; HIDDEN_SIZE],

    // Threats: i8 for compression
    pub threat_weights: Vec<i8>,     // [66,864][HIDDEN_SIZE]

    // L1: i8 with quantization
    pub l1_weights: Vec<i8>,         // [output_buckets][HIDDEN_SIZE * L1_SIZE]
    pub l1_biases: [f32; L1_SIZE],
    pub l1_quant: i32,               // = 64

    // L2/L3: f32 (tiny)
    pub l2_weights: Vec<f32>,
    pub l2_biases: Vec<f32>,
    pub l3_weights: Vec<f32>,
    pub l3_biases: Vec<f32>,
}
```

### TypeScript

TypeScript with `Int8Array`, `Int16Array`, `Float32Array`:

```typescript
// PST: high precision
this.pstWeights = new Int16Array(BUCKETS * 768 * HIDDEN_SIZE);
this.pstBiases = new Int16Array(HIDDEN_SIZE);

// Threats: compressed
this.threatWeights = new Int8Array(THREAT_FEATURES * HIDDEN_SIZE);

// L1: quantized
this.l1Weights = new Int8Array(OUTPUT_BUCKETS * HIDDEN_SIZE * L1_SIZE);
this.l1Biases = new Float32Array(L1_SIZE);

// L2/L3: full precision
this.l2Weights = new Float32Array(OUTPUT_BUCKETS * L1_SIZE * L2_SIZE);
this.l3Weights = new Float32Array(OUTPUT_BUCKETS * L2_SIZE);
```

### Training Considerations

When training a mixed-precision network:

1. **Train in f32**, then quantize: Train the full network in floating point, then quantize weights post-training
2. **Per-layer quantization ranges**: Threat weights (`i8`) need careful scaling — compute `max(abs(weights))` per output neuron and normalize
3. **Quantization-aware training**: Insert fake quantization nodes during training so the network learns to tolerate i8 threats
4. **Dequant multiplier**: Precompute `DEQUANT_MULTIPLIER = input_scale × weight_scale / output_scale` as a single f32 constant

```
Dequant = FT_SHIFT_scale / (FT_QUANT × FT_QUANT × L1_QUANT)
        = 512 / (255 × 255 × 64)
```

## Why It's Reckless

Using `i8` for threat weights with 66,864 features is **aggressive compression** — any individual threat feature has only 256 distinct values. Most engines wouldn't trust a critical tactical feature to an i8. Reckless compensates by having **many more threat features** than a standard NNUE would — the redundancy across features makes up for the per-feature quantization loss.

The `u8` FT output with `>> 9` shift is also aggressive — it means most products of small activations underflow to zero, increasing sparsity. This is by design: sparser FT output means fewer NNZ features, which means a faster L1 pass.
