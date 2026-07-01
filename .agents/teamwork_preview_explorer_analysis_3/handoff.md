# Evaluation and NNUE Analysis Handoff Report

## 1. Observation

During read-only inspection of the Rust evaluation and NNUE code, the following details were observed:

### A. Missing Threat Accumulator Initialization
- **File**: `vortex-core/src/nnue/network.rs` (lines 407–423) and `vortex-core/src/nnue/accumulator.rs` (lines 66–74).
- **Verbatim code**:
  ```rust
  pub fn ensure_accurate(&mut self, board: &crate::board::Board) {
      if !self.pst_stack[self.index].accurate[0]
          || !self.pst_stack[self.index].accurate[1]
      {
          self.refresh_pst(board);
      }

      if !self.threat_stack[self.index].accurate[0]
          || !self.threat_stack[self.index].accurate[1]
      {
          self.apply_threat_deltas();
      }
  }
  ```
  ```rust
  pub fn new() -> Self {
      Self {
          values: [[0; FT_SIZE]; 2],
          accurate: [false; 2],
          deltas: [ThreatDelta(0); 80],
          delta_len: 0,
      }
  }
  ```

### B. Blockers Mismatch in Threat System
- **File**: `vortex-core/src/nnue/features.rs` (line 122) and `vortex-core/src/nnue/network.rs` (lines 260–262).
- **Verbatim code**:
  ```rust
  // features.rs
  if let Some(feat) = map.get_index(atk_pt, from_sq, vic_pt, to_sq) {
  ```
  ```rust
  // threat_map.rs (empty board/0 occupancy)
  PieceType::Bishop => crate::magic::get_bishop_attacks(from as u8, 0),
  PieceType::Rook => crate::magic::get_rook_attacks(from as u8, 0),
  ```
  ```rust
  // network.rs (actual occupancy)
  let attacks = Self::get_attacks(piece, color, sq, board.occupancies[2]);
  let mut bb = attacks & board.occupancies[color.opposite() as usize];
  ```

### C. Missing Scaling Factor in L1 Dequantization
- **File**: `vortex-core/src/nnue/forward.rs` (lines 53, 92).
- **Verbatim code**:
  ```rust
  let product = (a * b) >> FT_SHIFT; // FT_SHIFT = 9
  ```
  ```rust
  let dequant = 1.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);
  ```

### D. Inverted Passed Pawn Masks in structural danger
- **File**: `vortex-core/src/evaluate.rs` (lines 109–110).
- **Verbatim code**:
  ```rust
  let b_passed_advanced = (b_pawns & 0x00FFFF0000000000) != 0;
  let w_passed_advanced = (w_pawns & 0x00000000FFFF0000) != 0;
  ```

### E. Asymmetric Flat-Index-Based Passed Pawn Mask Calculation
- **File**: `vortex-core/src/evaluate.rs` (lines 250, 255).
- **Verbatim code**:
  ```rust
  mask &= !((1u64 << (sq + 1)) - 1);
  ```
  ```rust
  mask &= (1u64 << sq) - 1;
  ```

### F. Mutual Pawn Tension Always Cancels to Zero
- **File**: `vortex-core/src/evaluate.rs` (lines 277–284).
- **Verbatim code**:
  ```rust
  score -= (count_bits(w_attacks_left & black_pawns) as i16) * 10;
  score -= (count_bits(w_attacks_right & black_pawns) as i16) * 10;
  ...
  score += (count_bits(b_attacks_left & white_pawns) as i16) * 10;
  score += (count_bits(b_attacks_right & white_pawns) as i16) * 10;
  ```

### G. Far-Away Pawn Shield for King Safety
- **File**: `vortex-core/src/evaluate.rs` (lines 307–310).
- **Verbatim code**:
  ```rust
  let file_our_pawns = our_pawns & file_mask;
  if file_our_pawns != 0 {
      safety += 10; // PAWN_SHIELD_BONUS
  }
  ```

### H. Closed Position Blockade Bias
- **File**: `vortex-core/src/evaluate.rs` (lines 373–378).
- **Verbatim code**:
  ```rust
  if b_sq == w_sq + 8 {
      locked_files += 1;
  }
  if w_sq == b_sq + 8 {
      locked_files -= 1;
  }
  ```

---

## 2. Logic Chain

### A. Missing Threat Accumulator Initialization
1. A new `IncrementalNetwork` is initialized with all zeros (`[[0; FT_SIZE]; 2]`) for the threat accumulator and `accurate = [false; 2]`.
2. When `ensure_accurate()` is called on a newly loaded position, it checks if `accurate` is false and calls `apply_threat_deltas()`.
3. Since `delta_len == 0` on start/load, `apply_threat_deltas()` loops 0 times, does nothing to update the values, and sets `accurate = [true; 2]`.
4. As a result, the threat accumulator remains all zeros, ignoring all initial threats present on the board.

### B. Blockers Mismatch in Threat System
1. The training pipeline uses `features.rs::get_threat_indices`, which maps threats based on the `ThreatMap` layout.
2. `ThreatMap` is built using an empty board (`0` occupancy), mapping all sliding paths (x-ray attacks) to indices.
3. The engine's incremental threat accumulator (`push_threats_on_change`) filters sliding attacks using `board.occupancies[2]` (with blockers).
4. Consequently, the features accumulated during search evaluation are blocked attacks only, while the features during training/serialization include x-rays. This creates a severe model-inference mismatch.

### C. Missing Scaling Factor in L1 Dequantization
1. SCReLU activations compute `(a * b) >> 9` in `activate_ft`, dividing the product of two quantized inputs by 512.
2. The dequantization factor `dequant` in `evaluate_nnue` divides by `FT_QUANT * FT_QUANT * l1_quant`, failing to multiply by `512` to compensate for the right shift.
3. The output value from the network is thus scaled down by an extra factor of 512.

### D. Inverted Passed Pawn Masks
1. `b_pawns & 0x00FFFF0000000000` checks Black pawns on ranks 7 and 6. These are Black's starting ranks, not advanced ranks.
2. `w_pawns & 0x00000000FFFF0000` checks White pawns on ranks 3 and 4. These are starting/early ranks, not advanced ranks.

### E. Asymmetric Passed Pawn Mask
1. Squares are mapped 0..63 rank-by-rank.
2. For White, `!((1 << (sq + 1)) - 1)` clears bits up to `sq`. Any squares to the right of the pawn on the same rank (index > `sq`) are not cleared.
3. Thus, an enemy pawn on the same rank to the right blocks the pawn from being considered passed, while one to the left does not.

### F. Mutual Pawn Tension Cancels to Zero
1. A pawn attack between a White pawn and a Black pawn is always mutual.
2. Therefore, `White attacks Black` count always equals `Black attacks White` count.
3. The formula `score = - (White attacks Black) * 10 + (Black attacks White) * 10` always evaluates to 0.

### G. Far-Away Pawn Shield
1. Pawn shield bonus is added if a pawn is present on the same or adjacent file.
2. No rank restrictions are applied, so a pawn on rank 7 shields a King on rank 1.

### H. Closed Position Blockade Bias
1. Bypassed pawns (`w_sq == b_sq + 8`) are not locked, but trigger `locked_files -= 1`.
2. Actual locked pawns can only trigger `b_sq == w_sq + 8`, adding `+1` to `locked_files` (favoring White).
3. Symmetrically blocked closed positions thus always add a positive bonus to White, biasing the search.

---

## 3. Caveats

- We assume the training pipeline uses `get_threat_indices` to extract training datasets. If the python training script implements its own threat-indexing logic, it should be verified against `get_threat_indices` as well.
- The proposed fixes are theoretical changes to improve engine playing strength and HCE/NNUE alignment; since we are in read-only investigation mode, these must be verified after implementation by running playing matches (derbies) and comparing Elos.

---

## 4. Conclusion

The evaluation logic and NNUE accumulator system contain several hidden bugs, conceptual mismatches, and dead code segments. The most critical are the NNUE threat accumulator cold-start bug, the blocker mismatch between features extraction and incremental updates, and the 512x scaling error in NNUE forward evaluation. 

The following fix strategies are recommended:

### Patch 1: Implement `refresh_threats` and update `ensure_accurate` in `vortex-core/src/nnue/network.rs`
```rust
    pub fn refresh_threats(&mut self, board: &crate::board::Board) {
        let weights = WEIGHTS.lock().unwrap_or_else(|e| e.into_inner());
        if !weights.is_loaded {
            return;
        }

        let threat = &mut self.threat_stack[self.index];
        threat.values[0].fill(0);
        threat.values[1].fill(0);

        let map = get_threat_map();

        for atk_color in [Color::White, Color::Black] {
            for atk_pt in [
                PieceType::Pawn,
                PieceType::Knight,
                PieceType::Bishop,
                PieceType::Rook,
                PieceType::Queen,
                PieceType::King,
            ] {
                let mut atk_bb = board.get_pieces(atk_color, atk_pt);
                while atk_bb != 0 {
                    let from_sq = atk_bb.trailing_zeros() as Square;
                    atk_bb &= atk_bb - 1;

                    let vic_color = atk_color.opposite();
                    for vic_pt in [
                        PieceType::Pawn,
                        PieceType::Knight,
                        PieceType::Bishop,
                        PieceType::Rook,
                        PieceType::Queen,
                        PieceType::King,
                    ] {
                        let mut vic_bb = board.get_pieces(vic_color, vic_pt);
                        while vic_bb != 0 {
                            let to_sq = vic_bb.trailing_zeros() as Square;
                            vic_bb &= vic_bb - 1;

                            // White perspective: raw squares
                            if let Some(feat_idx) = map.get_index(atk_pt, from_sq, vic_pt, to_sq) {
                                let row_start = feat_idx * FT_SIZE;
                                let row_end = row_start + FT_SIZE;
                                if row_end <= weights.threat_weights.len() {
                                    for i in 0..FT_SIZE {
                                        threat.values[0][i] = threat.values[0][i]
                                            .saturating_add(weights.threat_weights[row_start + i] as i16);
                                    }
                                }
                            }

                            // Black perspective: flip both squares
                            if let Some(feat_idx) = map.get_index(atk_pt, from_sq ^ 56, vic_pt, to_sq ^ 56) {
                                let row_start = feat_idx * FT_SIZE;
                                let row_end = row_start + FT_SIZE;
                                if row_end <= weights.threat_weights.len() {
                                    for i in 0..FT_SIZE {
                                        threat.values[1][i] = threat.values[1][i]
                                            .saturating_add(weights.threat_weights[row_start + i] as i16);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        threat.accurate[0] = true;
        threat.accurate[1] = true;
    }
```
Update `ensure_accurate` to:
```rust
    pub fn ensure_accurate(&mut self, board: &crate::board::Board) {
        if !self.pst_stack[self.index].accurate[0]
            || !self.pst_stack[self.index].accurate[1]
        {
            self.refresh_pst(board);
        }

        if !self.threat_stack[self.index].accurate[0]
            || !self.threat_stack[self.index].accurate[1]
        {
            let threat = &self.threat_stack[self.index];
            if threat.delta_len == 0 {
                self.refresh_threats(board);
            } else {
                self.apply_threat_deltas();
            }
        }
    }
```

### Patch 2: Align `push_threats_on_change` to empty-board x-rays in `vortex-core/src/nnue/network.rs`
```rust
    pub fn push_threats_on_change(
        &mut self,
        board: &crate::board::Board,
        color: Color,
        piece: PieceType,
        sq: Square,
        add: bool,
    ) {
        // Pass 0 (empty board) to get_attacks to match ThreatMap definitions
        let attacks = Self::get_attacks(piece, color, sq, 0);
        let mut bb = attacks & board.occupancies[color.opposite() as usize];
        while bb != 0 {
            let to_sq = bb.trailing_zeros() as Square;
            bb &= bb - 1;
            if let Some((_, victim_pt)) = board.piece_at(to_sq) {
                self.push_threat_delta(ThreatDelta::new(piece, sq, victim_pt, to_sq, add));
            }
        }

        let them = color.opposite();
        for pt in [
            PieceType::Pawn,
            PieceType::Knight,
            PieceType::Bishop,
            PieceType::Rook,
            PieceType::Queen,
            PieceType::King,
        ] {
            let mut enemy_bb = board.get_pieces(them, pt);
            while enemy_bb != 0 {
                let e_sq = enemy_bb.trailing_zeros() as Square;
                enemy_bb &= enemy_bb - 1;
                // Pass 0 (empty board) to get_attacks
                let e_attacks = Self::get_attacks(pt, them, e_sq, 0);
                if (e_attacks & (1u64 << sq)) != 0 {
                    self.push_threat_delta(ThreatDelta::new(pt, e_sq, piece, sq, add));
                }
            }
        }
    }
```

### Patch 3: Fix L1 Dequantization Scaling in `vortex-core/src/nnue/forward.rs`
```rust
    // Incorporate the FT_SHIFT (9) division by multiplying the dequant factor by 512.0
    let dequant = (1 << FT_SHIFT) as f32 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);
```

### Patch 4: Fix Advanced Pawn Check in `vortex-core/src/evaluate.rs`
```rust
    let b_passed_advanced = (b_pawns & 0x00000000FFFF0000) != 0; // Rank 3 or 4
    let w_passed_advanced = (w_pawns & 0x00FFFF0000000000) != 0; // Rank 6 or 7
```

### Patch 5: Symmetric Passed Pawn Masks in `vortex-core/src/evaluate.rs`
```rust
        // Passed
        let passed_mask = if color == Color::White {
            let mut mask = file_mask | adj_files;
            let ranks_above = if rank < 7 { 0xFFFFFFFFFFFFFFFFu64 << ((rank + 1) * 8) } else { 0 };
            mask & ranks_above
        } else {
            let mut mask = file_mask | adj_files;
            let ranks_below = (1u64 << (rank * 8)) - 1;
            mask & ranks_below
        };
```

### Patch 6: Exclude Mutual Pawn Tension No-op in `vortex-core/src/evaluate.rs`
Delete `evaluate_pawn_tension` and line 135: `score += evaluate_pawn_tension(state);` (saves CPU cycles without changing the static HCE score which was always 0).

### Patch 7: Fix Far-Away Pawn Shield in `vortex-core/src/evaluate.rs`
```rust
    let king_rank = king_sq / 8;
    let shield_mask = if color == Color::White {
        let mut mask = 0;
        if king_rank + 1 < 8 { mask |= 0xFFu64 << ((king_rank + 1) * 8); }
        if king_rank + 2 < 8 { mask |= 0xFFu64 << ((king_rank + 2) * 8); }
        mask
    } else {
        let mut mask = 0;
        if king_rank >= 1 { mask |= 0xFFu64 << ((king_rank - 1) * 8); }
        if king_rank >= 2 { mask |= 0xFFu64 << ((king_rank - 2) * 8); }
        mask
    };
    
    // Within the file loop:
    let file_our_pawns = our_pawns & file_mask & shield_mask;
```

---

## 5. Verification Method

### A. Run Unit and Search Tests
Run the existing cargo test suite to ensure the patches do not break compilation or search behavior (since search tests run HCE which doesn't check specific values of pawn tension/shield, and NNUE tests only verify empty-weight execution):
```bash
cargo test
```

### B. Add Accumulator Verification Unit Tests
To independently verify that incremental updates match full refreshes:
1. In `vortex-core/tests/nnue_test.rs`, add a test that makes a random sequence of moves and asserts that the incrementally updated `PstAccumulator` and `ThreatAccumulator` match the ones obtained by calling `refresh_pst` and `refresh_threats` from scratch.
2. Assert that `evaluate_nnue` returns non-zero values when non-zero weights are loaded.
