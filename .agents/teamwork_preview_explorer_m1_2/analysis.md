# Deep Analysis of NNUE and Evaluation Components in Vortex Chess Engine

This analysis report documents several critical bugs, logic flaws, and performance bottlenecks identified in `vortex-core/src/nnue` and `vortex-core/src/evaluate.rs`.

---

## 1. Dequantization Scaling Bug in NNUE Forward Pass

### Description
In the NNUE architecture, the feature transformer activation (`activate_ft` in `vortex-core/src/nnue/forward.rs`) computes the Squared Clipped-ReLU (SCReLU) activation as:
```rust
let product = (a * b) >> FT_SHIFT; // FT_SHIFT is 9
```
This right-shift by 9 divides the product by 512 ($2^9$). To map this back to floating-point activations expected by the network, this division must be compensated. 

The dequantization factor `dequant` in `evaluate_nnue` (and `evaluate_policy_move`) is computed as:
```rust
let dequant = 1.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);
```
This formula correctly divides by `FT_QUANT * FT_QUANT * l1_quant` to undo the quantization of the inputs and L1 weights, but it **completely misses the factor of 512** needed to compensate for the right-shift division of the SCReLU product. Consequently, all NNUE evaluations and policy logits are scaled down by a factor of 512, making them effectively 0 and rendering the neural network evaluations useless during search.

### Location
- **File**: `vortex-core/src/nnue/forward.rs`
- **Lines**: 92 and 163

```rust
92:     let dequant = 1.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);
...
163:     let dequant = 1.0 / (FT_QUANT as f32 * FT_QUANT as f32);
```

### Proposed Patch
Change the numerator of `dequant` from `1.0` to `512.0` to compensate for the `FT_SHIFT` shift:
```patch
diff --git a/vortex-core/src/nnue/forward.rs b/vortex-core/src/nnue/forward.rs
--- a/vortex-core/src/nnue/forward.rs
+++ b/vortex-core/src/nnue/forward.rs
@@ -92,3 +92,3 @@
-    let dequant = 1.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);
+    let dequant = 512.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);
@@ -163,3 +163,3 @@
-    let dequant = 1.0 / (FT_QUANT as f32 * FT_QUANT as f32);
+    let dequant = 512.0 / (FT_QUANT as f32 * FT_QUANT as f32);
```

---

## 2. Threat Accumulator Update Mismatch (Accumulator Leak/Drift)

### Description
The threat evaluation model is trained on "empty-board" threats. This is confirmed by:
1. `features.rs::get_threat_indices` (used to generate training data) which queries `ThreatMap::get_index` for any piece pairs on the board without checking if they are blocked.
2. `network.rs::refresh_threats` which does the same.

However, the incremental update helper `push_threat_on_change` (which accumulates threats dynamically during moves) checks for actual attacks *with blockages* by using `board.occupancies[2]`:
```rust
let attacks = Self::get_attacks(piece, color, sq, board.occupancies[2]);
```
This causes a critical discrepancy:
1. Full refreshes (`refresh_threats`) populate the accumulator with blocked (empty-board) threats, whereas incremental updates only update unblocked threats.
2. If other pieces move and block/unblock a slider's attack ray, the accumulator does not update the threat delta because only the moving piece's threats are updated. When the slider eventually moves, the subtract delta will use the new blockages and fail to subtract the originally accumulated empty-board threat, leading to a permanent **accumulator leak/drift**.

### Location
- **File**: `vortex-core/src/nnue/network.rs`
- **Lines**: 261-262 and 285-286 (in `push_threats_on_change`)

### Proposed Patch
In `push_threats_on_change`, use `0` as the occupancy mask to compute empty-board attacks, aligning the incremental updates with the empty-board threat definition used in training and full refreshes:
```patch
diff --git a/vortex-core/src/nnue/network.rs b/vortex-core/src/nnue/network.rs
--- a/vortex-core/src/nnue/network.rs
+++ b/vortex-core/src/nnue/network.rs
@@ -261,2 +261,2 @@
-        let attacks = Self::get_attacks(piece, color, sq, board.occupancies[2]);
+        let attacks = Self::get_attacks(piece, color, sq, 0);
         let mut bb = attacks & board.occupancies[color.opposite() as usize];
@@ -285,2 +285,2 @@
-                let e_attacks = Self::get_attacks(pt, them, e_sq, board.occupancies[2]);
+                let e_attacks = Self::get_attacks(pt, them, e_sq, 0);
```

---

## 3. Reversed Signs in Pawn Tension Evaluation (HCE)

### Description
In `evaluate_pawn_tension` (the handcrafted evaluation code), the score adjustments are completely reversed:
- White pawn attacks on Black pawns are subtracted: `score -= ...`. Since `score` is relative to White, attacking the enemy's pawns should increase White's score.
- Black pawn attacks on White pawns are added: `score += ...`. Black threats against White should decrease White's score.

This reverses the valuation of pawn tension, penalizing active white pawns and rewarding black threats.

### Location
- **File**: `vortex-core/src/evaluate.rs`
- **Lines**: 275-282

```rust
275:     score -= (count_bits(w_attacks_left & black_pawns) as i16) * 10;
276:     score -= (count_bits(w_attacks_right & black_pawns) as i16) * 10;
...
281:     score += (count_bits(b_attacks_left & white_pawns) as i16) * 10;
282:     score += (count_bits(b_attacks_right & white_pawns) as i16) * 10;
```

### Proposed Patch
Correct the signs of the pawn tension score:
```patch
diff --git a/vortex-core/src/evaluate.rs b/vortex-core/src/evaluate.rs
--- a/vortex-core/src/evaluate.rs
+++ b/vortex-core/src/evaluate.rs
@@ -275,2 +275,2 @@
-    score -= (count_bits(w_attacks_left & black_pawns) as i16) * 10;
-    score -= (count_bits(w_attacks_right & black_pawns) as i16) * 10;
+    score += (count_bits(w_attacks_left & black_pawns) as i16) * 10;
+    score += (count_bits(w_attacks_right & black_pawns) as i16) * 10;
@@ -281,2 +281,2 @@
-    score += (count_bits(b_attacks_left & white_pawns) as i16) * 10;
-    score += (count_bits(b_attacks_right & white_pawns) as i16) * 10;
+    score -= (count_bits(b_attacks_left & white_pawns) as i16) * 10;
+    score -= (count_bits(b_attacks_right & white_pawns) as i16) * 10;
```

---

## 4. King Safety Evaluation Logic Flaw (HCE)

### Description
In `evaluate.rs`, when the safety levels of the two kings differ, a scaling factor of `1.4` is applied. However, the multiplier is applied to the raw safety score of the weaker side rather than to the safety difference:
```rust
if w_safety < b_safety {
    score += (w_safety as f32 * 1.4) as i16 - b_safety;
}
```
Because safety scores are signed (can be positive or negative), this has highly inconsistent behavior:
- If `w_safety` is positive (e.g., 10 vs 20), scaling White's score by 1.4 yields `14 - 20 = -6` (reducing the penalty compared to the simple difference of -10).
- If `w_safety` is negative (e.g., -20 vs -10), scaling it yields `-28 - (-10) = -18` (increasing the penalty compared to the simple difference of -10).

The scaling should be applied directly to the safety difference.

### Location
- **File**: `vortex-core/src/evaluate.rs`
- **Lines**: 141-147

### Proposed Patch
Apply the 1.4 multiplier to the absolute difference in safety:
```patch
diff --git a/vortex-core/src/evaluate.rs b/vortex-core/src/evaluate.rs
--- a/vortex-core/src/evaluate.rs
+++ b/vortex-core/src/evaluate.rs
@@ -141,6 +141,6 @@
         if w_safety < b_safety {
-            score += (w_safety as f32 * 1.4) as i16 - b_safety;
+            score -= ((b_safety - w_safety) as f32 * 1.4) as i16;
         } else if b_safety < w_safety {
-            score += w_safety - (b_safety as f32 * 1.4) as i16;
+            score += ((w_safety - b_safety) as f32 * 1.4) as i16;
         } else {
```

---

## 5. Parallel Contention Bottleneck on Global Mutex

### Description
The loaded NNUE model weights are stored in `WEIGHTS`:
```rust
pub static WEIGHTS: Mutex<VortexWeights> = Mutex::new(VortexWeights::new());
```
During parallel search (Lazy SMP), every worker thread calls `evaluate_nnue` at leaf nodes, which locks the mutex:
```rust
let w = WEIGHTS.lock().unwrap_or_else(|e| e.into_inner());
```
This forces all search threads to serialize their evaluation passes, introducing extreme thread contention and preventing multi-threaded speedups. Since weights are read-only after loading, a `RwLock` or lock-free reference (`Arc` / `OnceLock`) should be used.

### Location
- **File**: `vortex-core/src/nnue/weights.rs` (line 49)
- **File**: `vortex-core/src/nnue/forward.rs` (lines 66 and 139)

### Proposed Patch
Convert `WEIGHTS` to a `RwLock` to allow multiple concurrent readers:
```patch
diff --git a/vortex-core/src/nnue/weights.rs b/vortex-core/src/nnue/weights.rs
--- a/vortex-core/src/nnue/weights.rs
+++ b/vortex-core/src/nnue/weights.rs
@@ -49,1 +49,1 @@
-pub static WEIGHTS: Mutex<VortexWeights> = Mutex::new(VortexWeights::new());
+pub static WEIGHTS: std::sync::RwLock<VortexWeights> = std::sync::RwLock::new(VortexWeights::new());
```
And replace calls to `.lock()` with `.read()` in `forward.rs` and `serialize.rs`.
