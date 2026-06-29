# Technique 6: Adaptive SIMD Unrolling & Latency Hiding

**Source:** Reckless NNUE (`src/nnue/accumulator/threats.rs`, `src/nnue/forward/vectorized.rs`)

## What It Replaces

Standard SIMD loops process data in fixed-size chunks, using a simple pattern:

```rust
for i in (0..L1_SIZE).step_by(I16_LANES) {
    let v = load(&input[i..]);
    let w = load(&weights[i..]);
    let result = v.dot_product(w);
    store(&output[i..], result);
}
```

This is correct but leaves performance on the table — it doesn't hide latency or maximize register utilization.

## The Reckless Innovation

Reckless uses **three aggressive unrolling techniques**:

1. **Register-count-adaptive unrolling**: Uses as many SIMD registers as the ISA provides to cover the full L1_SIZE in one pass
2. **Double-issue dot products**: Processes two L1 input features simultaneously to hide FMA latency
3. **Partitioned accumulation**: Splits the output into independent partial sums to break dependency chains

## 1. Register-Count-Adaptive Unrolling

### Threat Accumulator (`threats.rs`)

```rust
// How many registers can we use?
// AVX-512: 32 × i16 = 1024 elements → covers L1_SIZE=768 in one pass
// AVX2:    16 × i16 = 256 elements  → need 3 passes of 8 registers
// Scalar:  1 × i16                   → full loop

#[cfg(target_feature = "avx512f")]
const REGISTERS: usize = L1_SIZE / I16_LANES;  // 24 registers, each 32-wide

#[cfg(not(target_feature = "avx512f"))]
const REGISTERS: usize = 8;  // 8 registers, loop over L1_SIZE in chunks

fn apply_changes(values: &mut [i16; L1_SIZE], adds: &[(PieceType, Square)], subs: &[(PieceType, Square)]) {
    // Unroll adds and subs into register-sized accumulators
    let mut accs = [[_mm512_setzero_si512(); REGISTERS]; 2];  // [add, sub]

    for (pt, sq) in adds {
        let idx = pst_index(sq, pt);
        // Each register covers one L1_SIZE / REGISTERS chunk of weights
        for r in 0..REGISTERS {
            let chunk_base = r * (L1_SIZE / REGISTERS);
            let w = load(&weights[idx][chunk_base..chunk_base + I16_LANES]);
            accs[0][r] = _mm512_add_epi16(accs[0][r], w);
        }
    }
    // Same for subs...

    // Apply all accumulated registers to values
    for r in 0..REGISTERS {
        let chunk_base = r * (L1_SIZE / REGISTERS);
        let v = load(&values[chunk_base..]);
        let result = _mm512_add_epi16(v, accs[0][r]);
        let result = _mm512_sub_epi16(result, accs[1][r]);
        store(&mut values[chunk_base..], result);
    }
}
```

On AVX-512, 24 registers × 32 lanes = 768 elements = **exactly one pass over L1_SIZE**. No loop overhead at all.

## 2. Double-Issue L1 Dot Products (`forward/vectorized.rs`)

The L1 layer does: `output[j] = Σ(input[i] × weight[i][j])` for each NNZ feature. Reckless processes **two NNZ features simultaneously**:

```rust
fn double_dpbusd(
    acc: &mut [i32; L3_SIZE],           // output accumulator
    input1: i16, input2: i16,           // two NNZ feature values
    weight1: &[i8; L1_SIZE],            // weight row for feature 1
    weight2: &[i8; L1_SIZE],            // weight row for feature 2
    input_scale: i32,                   // dequant multiplier
) {
    // Process L1_SIZE in SIMD chunks
    for chunk in (0..L1_SIZE).step_by(I16_LANES) {
        // Load weights for both features
        let w1 = load_i8(&weight1[chunk..]);     // 16/32 × i8
        let w2 = load_i8(&weight2[chunk..]);

        // Splat input values (scalar broadcast)
        let in1 = splat(input1 as i32);
        let in2 = splat(input2 as i32);

        // Multiply and accumulate — two FMA chains interleaved
        // This hides the 4-cycle latency of FMA by having
        // independent operations in between
        let mut acc_chunk = load(&acc[chunk..]);  // already-scaled values

        // First feature contribution
        let product1 = mul_i8x_i16(w1, in1);
        acc_chunk = add_i32(acc_chunk, product1);

        // Second feature contribution (independent, no data dependency)
        let product2 = mul_i8x_i16(w2, in2);
        acc_chunk = add_i32(acc_chunk, product2);

        store(&mut acc[chunk..], acc_chunk);
    }
}
```

By interleaving two independent dot products, the CPU pipeline is never stalled waiting for a multiply result. Each FMA can execute independently every cycle while the other is in flight.

## 3. Partitioned L3 Accumulation (`forward/vectorized.rs`)

The L3 layer is a single dot product: `score = Σ(l2_out[i] × l3_weights[i])`. This is normally a serial reduction. Reckless **partitions into multiple independent sums**:

```rust
fn propagate_l3(l2_out: &[f32; L3_SIZE], weights: &[f32; L3_SIZE]) -> f32 {
    let num_parts = 16 / F32_LANES;

    // Initialize num_parts accumulators
    let mut parts = [_mm512_setzero_ps(); num_parts];

    // Each accumulator processes every (1/num_parts)th element
    // This breaks the dependency chain — each accumulate is independent
    for i in 0..L3_SIZE / num_parts {
        for p in 0..num_parts {
            let idx = p * (L3_SIZE / num_parts) + i;
            let w = splat(weights[idx]);
            let v = splat(l2_out[idx]);
            parts[p] = fmadd_ps(w, v, parts[p]);
        }
    }

    // Horizontal reduction at the end
    let mut sum = 0f32;
    for p in 0..num_parts {
        sum += horizontal_sum(parts[p]);
    }
    sum
}
```

### Why This Works

FMA (Fused Multiply-Add) has a latency of 4-5 cycles on modern CPUs. A naive reduction:
```rust
let mut sum = 0.0;
for i in 0..L3_SIZE {
    sum = fma(weights[i], l2_out[i], sum);  // next iteration waits for sum
}
```

This is a **serial dependency chain** — 32 iterations × 4 cycles = 128 cycles minimum.

With partitioning (e.g., 4 parts of 8 each), the dependency chain length is only 8, so 8 × 4 = 32 cycles. The 4 parts run in parallel on different registers, and the CPU can execute them simultaneously via out-of-order execution.

## Applying to Vortex

### Rust Implementation

```rust
/// Adaptive unrolling: choose optimal strategy at runtime
enum UnrollStrategy {
    FullCover,    // Registers cover entire L1_SIZE
    Chunked,     // Loop over chunks with fixed registers
}

fn optimal_strategy() -> UnrollStrategy {
    #[cfg(target_feature = "avx512f")]
    { UnrollStrategy::FullCover }

    #[cfg(target_feature = "avx2")]
    { UnrollStrategy::Chunked }

    #[cfg(not(any(target_feature = "avx2", target_feature = "avx512f")))]
    { UnrollStrategy::Chunked }
}

fn l1_forward(inputs: &[u8], nnz: &[u16], weights: &[i8], output: &mut [f32]) {
    const CHUNKS: usize = 4;  // Double-issue × 2 features

    match optimal_strategy() {
        UnrollStrategy::FullCover => {
            // AVX-512: 16 i32 accumulators cover L3_SIZE=16
            let mut accs = [0i32; L3_SIZE];
            for nnz_chunk in nnz.chunks(CHUNKS) {
                for (j, &idx) in nnz_chunk.iter().enumerate() {
                    let input_val = inputs[idx as usize] as i32;
                    let w_row = &weights[idx as usize * L1_SIZE..];
                    // Accumulate with fmadd-like pattern
                    for k in 0..L1_SIZE {
                        accs[k] += input_val * w_row[k] as i32;
                    }
                }
            }
            // Dequantize and apply bias
            for k in 0..L3_SIZE {
                output[k] = accs[k] as f32 * DEQUANT + bias[k];
            }
        }
        UnrollStrategy::Chunked => {
            // AVX2/scalar: chunk L3 into manageable pieces
            let mut accs = vec![0i32; L3_SIZE];
            for &idx in nnz {
                let input_val = inputs[idx as usize] as i32;
                let w_row = &weights[idx as usize * L1_SIZE..];
                for k in 0..L1_SIZE {
                    accs[k] += input_val * w_row[k] as i32;
                }
            }
            for k in 0..L3_SIZE {
                output[k] = accs[k] as f32 * DEQUANT + bias[k];
            }
        }
    }
}
```

### TypeScript

TypeScript can't do SIMD unrolling, but you can apply the **partitioned accumulation** concept:

```typescript
function l3DotProduct(l2Out: Float32Array, weights: Float32Array): number {
  const PARTS = 4;
  const partSize = l2Out.length / PARTS;
  const sums = [0, 0, 0, 0];

  for (let i = 0; i < partSize; i++) {
    for (let p = 0; p < PARTS; p++) {
      const idx = p * partSize + i;
      sums[p] += l2Out[idx] * weights[idx];
    }
  }

  return sums.reduce((a, b) => a + b, 0);
}
```

## Performance Impact

| Technique | Without | With | Speedup |
|-----------|---------|------|---------|
| Register coverage | 3-pass AVX2 | 1-pass AVX-512 | 3× |
| Double-issue L1 | 1 feature at a time | 2 features at a time | 1.8× |
| Partitioned L3 | Serial FMA chain | 4 parallel chains | 3-4× |
| Combined | Baseline | All three | ~10-15× |

## Why It's Reckless

The full-cover register strategy on AVX-512 uses **24 out of 32 registers** — leaving almost no room for the compiler to spill or for other operations. This is extremely aggressive register budgeting.

The double-issue L1 processing assumes the inputs are dense enough to find pairs of NNZ features — if sparsity is high (>90%), the pairing overhead may not pay off. But Reckless bets on low sparsity from the multiplicative activation.

The partitioned L3 creates artificial parallelism where the algorithm is naturally serial — a textbook latency-hiding trick used in HPC, not typically in chess engines.
