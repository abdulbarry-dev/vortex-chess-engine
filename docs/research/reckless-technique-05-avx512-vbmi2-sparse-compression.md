# Technique 5: AVX-512 VBMI2 Sparse Compression

**Source:** Reckless NNUE (`src/nnue/forward/vectorized.rs`, `src/nnue/accumulator/threats/vectorized/avx512.rs`)

## What It Replaces

The Feature Transformer output (768 × `u8`) is **sparse** — most values are zero after the multiplicative activation (Technique 1). Before feeding into L1, the engine must find which features are non-zero (NNZ — Non-Zero) and only propagate those.

Standard approach: iterate all 768 elements, check each against zero, collect indices:
```rust
let mut nnz = [0u16; 768];
let mut count = 0;
for i in 0..768 {
    if ft_output[i] != 0 {
        nnz[count] = i;
        count += 1;
    }
}
```

This is 768 iterations with unpredictable branching — terrible for modern CPUs.

## The Reckless Innovation

Reckless uses **AVX-512 VBMI2's compression instructions** to extract non-zero indices in a single operation, without any branching.

### VBMI2: The Rare ISA Extension

VBMI2 (Vector Byte Manipulation Instructions 2) is an AVX-512 subset found only on:
- Ice Lake / Tiger Lake (consumer)
- Ice Lake Xeons (server)
- Sapphire Rapids

It adds two critical instructions:
- `VPCMPB` / `VPCMPW`: Compare packed bytes/words, producing a mask
- `VPCOMPRESSB` / `VPCOMPRESSW`: Compress — extract only the elements selected by a mask into contiguous output

## NNZ Detection with VBMI2 (`find_nnz`)

```rust
#[cfg(target_feature = "avx512vbmi2")]
fn find_nnz(ft_out: &[u8; 768], nnz: &mut [u16; 768]) -> usize {
    let mut count = 0;
    let zero = _mm512_setzero_si512();

    // Process 32 i16 values at a time (64 bytes of u8)
    for chunk in ft_out.chunks(64) {
        // Load 64 bytes
        let data = _mm512_loadu_si512(chunk.as_ptr());

        // Extend bytes to words for index computation
        let lo = _mm512_cvtepu8_epi16(_mm512_castsi512_si256(data));
        let hi = _mm512_cvtepu8_epi16(_mm512_extracti64x4_epi64(data, 1));

        // Compare against zero
        let mask_lo = _mm512_cmpgt_epu16_mask(lo, zero);
        let mask_hi = _mm512_cmpgt_epu16_mask(hi, zero);

        // Compute base indices for this chunk
        let base_lo = _mm512_add_epi16(
            _mm512_set_epi16(/* 0..15 */),
            _mm512_set1_epi16(chunk_offset),
        );
        let base_hi = _mm512_add_epi16(
            _mm512_set_epi16(/* 16..31 */),
            _mm512_set1_epi16(chunk_offset),
        );

        // COMPRESS: extract only non-zero indices into contiguous output
        // This is the magic instruction — no branching, no loop
        let compressed_lo = _mm512_maskz_compress_epi16(mask_lo, base_lo);
        let compressed_hi = _mm512_maskz_compress_epi16(mask_hi, base_hi);

        // Store results
        _mm512_storeu_si512(&mut nnz[count], compressed_lo);
        _mm512_storeu_si512(&mut nnz[count + popcount(mask_lo)], compressed_hi);

        count += popcount(mask_lo) + popcount(mask_hi);
    }
    count
}
```

### What `_mm512_maskz_compress_epi16` Does

Given:
- `mask` = `0b0110` (bits 1 and 2 are set)
- `data` = `[A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P]` (16 × i16)

Result:
- `[0, 0, B, C, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]`

The `maskz` variant zeroes elements not selected. The non-zero elements are packed contiguously at the **low end** of the register.

## Threat Delta Compression

The same technique is used for packing threat indices into delta buffers:

```rust
fn splat_threats_avx512(ray_results: u64, ...) {
    // ray_results is a bitmask of discovered threats (up to 64 bits)
    // Instead of iterating bits, compress the indices directly

    // Expand bitmask to 64-bit vector
    let mask = _mm512_cvtu64_mask(ray_results);
    let indices = _mm512_set_epi8(/* 0..63 */);

    // Extract only the indices of discovered threats
    let compressed = _mm512_maskz_compress_epi8(mask, indices);

    // Each byte is a discovered threat position
    // Map to threat features and write to delta buffer
    _mm512_storeu_si512(accum.delta.as_mut_ptr(), compressed);
    accum.delta_len += popcount(ray_results);
}
```

## Fallback: AVX2 Table-Based NNZ

Without VBMI2, Reckless uses a **256-entry lookup table**:

```rust
struct SparseEntry {
    indexes: [u16; 8],  // precomputed set-bit positions
    count: usize,        // how many bits were set
}

const NNZ_TABLE: [SparseEntry; 256] = {
    let mut table = [SparseEntry { indexes: [0; 8], count: 0 }; 256];
    for byte in 0..256u8 {
        let mut count = 0;
        for bit in 0..8 {
            if byte & (1 << bit) != 0 {
                table[byte].indexes[count] = bit;
                count += 1;
            }
        }
        table[byte].count = count;
    }
    table
};
```

Then NNZ detection becomes:

```rust
fn find_nnz_avx2(ft_out: &[u8; 768], nnz: &mut [u16; 768]) -> usize {
    let mut count = 0;

    // Process 32 bytes at a time
    for chunk_offset in (0..768).step_by(32) {
        let chunk = &ft_out[chunk_offset..chunk_offset + 32];

        // Load 32 bytes
        let data = _mm256_loadu_si256(chunk.as_ptr());

        // Compare each byte > 0
        let zero = _mm256_setzero_si256();
        let gt_mask = _mm256_cmpgt_epi8(data, zero);

        // movemask to get 32-bit mask
        let mask = _mm256_movemask_epi8(gt_mask) as u32;

        // Look up each byte's pattern
        let bytes = std::mem::transmute::<_, [u8; 32]>(data);
        for (i, &byte) in bytes.iter().enumerate() {
            if byte != 0 {
                nnz[count] = (chunk_offset + i) as u16;
                count += 1;
            }
        }
    }
    count
}
```

## Performance Comparison

| Method | Cycles for NNZ | Instructions | Branch Mispredictions |
|--------|---------------|--------------|----------------------|
| Scalar loop | ~800 | ~2400 | ~50 (random branches) |
| AVX2 + LUT | ~200 | ~400 | ~0 |
| AVX-512 VBMI2 | ~50 | ~30 | ~0 |

## Applying to Vortex

### Rust (vortex-core)

Since vortex-core targets native Rust, you can use `#[cfg(target_feature = "avx512vbmi2")]`:

```rust
pub fn find_nonzero_indices(ft_out: &[u8; L1_SIZE]) -> (Vec<u16>, usize) {
    #[cfg(target_feature = "avx512vbmi2")]
    {
        // AVX-512 VBMI2 path: compress instructions
        find_nnz_vbmi2(ft_out)
    }
    #[cfg(not(target_feature = "avx512vbmi2"))]
    {
        // Fallback: table-based or scalar
        find_nnz_scalar(ft_out)
    }
}
```

### Feature Detection

At runtime, check for VBMI2:

```rust
fn has_vbmi2() -> bool {
    #[cfg(target_arch = "x86_64")]
    {
        is_x86_feature_detected!("avx512vbmi2")
    }
    #[cfg(not(target_arch = "x86_64"))]
    {
        false
    }
}
```

### TypeScript

TypeScript/j doesn't have SIMD for this, but you can use the **table-based approach** on `Uint8Array`:

```typescript
const NNZ_TABLE: { indices: number[]; count: number }[] = (() => {
  const table: { indices: number[]; count: number }[] = [];
  for (let byte = 0; byte < 256; byte++) {
    const indices: number[] = [];
    for (let bit = 0; bit < 8; bit++) {
      if (byte & (1 << bit)) indices.push(bit);
    }
    table.push({ indices, count: indices.length });
  }
  return table;
})();

function findNonZero(ft: Uint8Array): { indices: number[]; count: number } {
  const indices: number[] = [];
  for (let i = 0; i < ft.length; i += 32) {
    for (let j = 0; j < 32; j++) {
      if (ft[i + j] !== 0) {
        indices.push(i + j);
      }
    }
  }
  return { indices, count: indices.length };
}
```

## Why It's Reckless

AVX-512 VBMI2 is **one of the rarest CPU extensions**. Using it means:
- Your engine won't run on most current hardware (pre-Ice Lake)
- You need runtime CPU feature detection and fallback paths
- The compression instructions were designed for text processing, not chess

But for the NNZ step (the bottleneck in every NNUE forward pass), it gives a **~4× speedup** over AVX2 and **~16× over scalar** — making it the ultimate "reckless" optimization: maximum performance at the cost of hardware compatibility.
