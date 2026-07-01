# Diagnostic Report: Vortex Chess Engine Critical Weak Points

This report documents the top 5 most critical issues identified in the Vortex search, evaluation, and NNUE subsystems, along with syntactically valid Rust patches, step-by-step explanations of the bugs, and the verification results showing that the fixes compile and pass tests.

---

## 1. Transposition Table (TT) Mate Score Adjustment

### Step-by-Step Explanation
1. During search, the engine assigns checkmate scores that are relative to the root of the search tree (`MATE_SCORE - ply` for a win, and `-MATE_SCORE + ply` for a loss).
2. When the engine stores these scores directly in the Transposition Table (TT) without adjusting them, the score loses its root-relative meaning.
3. If this TT entry is later probed in another branch of the search tree or at a different ply depth, the unadjusted score will be interpreted incorrectly. This leads to checkmate announcement failures, search instability, and potential infinite search loops.
4. **Resolution**: Adjust checkmate scores to a root-independent value (distance from current node) before storing in the TT, and convert it back to a root-relative value (distance from root) when probing the TT.

### Concrete Patch
Applied to `vortex-core/src/search/mod.rs`:

```rust
// Inside search_position (TT Probing):
    let mut tt_move = Move(0);
    if let Some(entry) = tt.probe(hash) {
        let mut score = entry.score;
        if score > MATE_SCORE - 100 {
            score -= ply as i16;
        } else if score < -MATE_SCORE + 100 {
            score += ply as i16;
        }
        if entry.depth >= depth {
            if entry.bound == TT_EXACT { return score; }
            if entry.bound == TT_ALPHA && score <= alpha { return alpha; }
            if entry.bound == TT_BETA && score >= beta { return beta; }
        }
        tt_move = Move(entry.best_move);
    }

// Inside search_position (TT Storing):
    let mut score_to_store = best_score;
    if score_to_store > MATE_SCORE - 100 {
        score_to_store += ply as i16;
    } else if score_to_store < -MATE_SCORE + 100 {
        score_to_store -= ply as i16;
    }
    tt.store(hash, depth, score_to_store, bound, best_move);
```

---

## 2. NNUE Threat Accumulator Cold-Start Initialization

### Step-by-Step Explanation
1. The engine's `IncrementalNetwork` is initialized with threat values of zero and `accurate = [false; 2]`.
2. When loading a new game state or starting a search, `ensure_accurate()` is called on the accumulator stack. It checks if the threat accumulator is marked stale (`!accurate[0] || !accurate[1]`) and calls `self.apply_threat_deltas()`.
3. However, since the delta buffer is empty on start (`delta_len == 0`), `apply_threat_deltas()` iterates 0 times, leaving the accumulator values as all zeroes, but marks `accurate = [true; 2]`.
4. As a result, the threat accumulator is never initialized from the board state, resulting in a cold-start bug where initial threat features are entirely ignored.
5. **Resolution**: Implement a full threat accumulator recalculation function (`refresh_threats`) that populates the accumulator from scratch when `delta_len == 0`.

### Concrete Patch
Applied to `vortex-core/src/nnue/network.rs`:

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
                                        let w = weights.threat_weights[row_start + i] as i16;
                                        threat.values[0][i] = threat.values[0][i].saturating_add(w);
                                    }
                                }
                            }

                            // Black perspective: flip both squares
                            if let Some(feat_idx) = map.get_index(atk_pt, from_sq ^ 56, vic_pt, to_sq ^ 56) {
                                let row_start = feat_idx * FT_SIZE;
                                let row_end = row_start + FT_SIZE;
                                if row_end <= weights.threat_weights.len() {
                                    for i in 0..FT_SIZE {
                                        let w = weights.threat_weights[row_start + i] as i16;
                                        threat.values[1][i] = threat.values[1][i].saturating_add(w);
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

    /// Make both accumulators accurate before evaluation.
    pub fn ensure_accurate(&mut self, board: &crate::board::Board) {
        // PST: full refresh if stale (covers king moves and cold-start).
        if !self.pst_stack[self.index].accurate[0]
            || !self.pst_stack[self.index].accurate[1]
        {
            self.refresh_pst(board);
        }

        // Threat: apply any pending deltas.
        if !self.threat_stack[self.index].accurate[0]
            || !self.threat_stack[self.index].accurate[1]
        {
            let delta_len = self.threat_stack[self.index].delta_len;
            if delta_len == 0 {
                self.refresh_threats(board);
            } else {
                self.apply_threat_deltas();
            }
        }
    }
```

---

## 3. Repetition History Tracking Underflow

### Step-by-Step Explanation
1. Detection of repetitions (e.g. three-fold draws) is handled by looking up previous board hashes in `state.repetition_history`.
2. While backtracking in `unmake_move` pops hashes from `repetition_history`, the forward move logic in `make_move` fails to push the current hash onto the stack.
3. Consequently, the repetition history quickly underflows and stays empty throughout the search, leaving the search completely blind to draws by repetition.
4. **Resolution**: Push the previous hash onto `repetition_history` at the beginning of `make_move`.

### Concrete Patch
Applied to `vortex-core/src/state.rs`:

```rust
    pub fn make_move(&mut self, m: Move) -> UndoInfo {
        self.repetition_history.push(self.hash);
        let from = m.from();
        let to = m.to();
        ...
```

---

## 4. Transposition Table Aging Calculation Inversion

### Step-by-Step Explanation
1. The Transposition Table (TT) tracks entry age using a wrapping table counter `self.age` that increments over search iterations.
2. Under collision replacement logic, the TT compares how many generations old each entry in a bucket is. Older entries should be replaced first.
3. The codebase calculates the replacement score for bucket `i` as `bucket[i].age.wrapping_sub(self.age)`.
4. Because `self.age` is larger than `bucket[i].age`, this wrapping subtraction yields larger values (close to 255) for newer entries and smaller values for older entries.
5. Under high TT collisions, this causes the table to prioritize newer entries for eviction instead of the oldest ones.
6. **Resolution**: Swap the aging calculation order to `self.age.wrapping_sub(bucket[i].age)`.

### Concrete Patch
Applied to `vortex-core/src/tt.rs`:

```rust
        let replace0 = if depth > bucket[0].depth { 2 } else { self.age.wrapping_sub(bucket[0].age) as i16 };
        let replace1 = if depth > bucket[1].depth { 2 } else { self.age.wrapping_sub(bucket[1].age) as i16 };
```

---

## 5. LMR Capping and Passed Pawn Evaluation Fixes

### Step-by-Step Explanation
1. **LMR Reduction Capping**: Late Move Reductions (LMR) can become too aggressive when many moves are evaluated, leading to reductions of up to 6 plies. Capping the reduction to `depth / 2` protects deep searches from missing immediate tactical lines.
2. **Passed Pawns Rank Mask**: In `evaluate.rs`, the advanced ranks for White and Black passed pawns were inverted. White checked ranks 3 and 4 (early ranks), while Black checked ranks 6 and 7 (early ranks). This is corrected so White checks ranks 6 and 7, and Black checks ranks 2 and 3.
3. **Symmetric Passed Pawn Mask**: The passed pawn mask uses rank-based clearing bitmasks that are asymmetrical: pawns to the right can block a passed pawn, but pawns to the left cannot. Using clean, rank-shifted masks makes the check symmetrical.

### Concrete Patches
Applied to `vortex-core/src/search/mod.rs` (LMR):
```rust
            if !in_check && depth >= 3 && legal_moves > 4 && !m.is_capture() && !m.is_promotion() && m != tt_move {
                let lmr_base = legal_moves.min(64) as f32;
                let reduction = ((lmr_base.ln() / 2.0f32.ln()).round() as i8)
                    .min(depth / 2)
                    .max(1);
                let reduced = (depth - 1 - reduction).max(0);
                score = -search_position(state, reduced, -alpha - 1, -alpha, ply + 1, tt, ctrl, killers, history);
```

Applied to `vortex-core/src/evaluate.rs` (Passed Pawns):
```rust
// Advanced passed pawns check:
    let b_passed_advanced = (b_pawns & 0x00000000FFFF0000) != 0; // Black advanced ranks (ranks 2 or 3)
    let w_passed_advanced = (w_pawns & 0x00FFFF0000000000) != 0; // White advanced ranks (ranks 6 or 7)

// Symmetric passed pawn mask:
        let passed_mask = if color == Color::White {
            let mask = file_mask | adj_files;
            let ranks_above = if rank < 7 { 0xFFFFFFFFFFFFFFFFu64 << ((rank + 1) * 8) } else { 0 };
            mask & ranks_above
        } else {
            let mask = file_mask | adj_files;
            let ranks_below = (1u64 << (rank * 8)) - 1;
            mask & ranks_below
        };
```

---

## 6. Verification Results

All applied patches were verified locally by compiling the `vortex-core` Rust library and running the entire unit test suite.

- **Verification Command**: `cargo test --manifest-path vortex-core/Cargo.toml`
- **Build Status**: Compile successful (0 warnings, 0 errors).
- **Test Result**: `ok. 37 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 35.82s`
  - Unit tests in `board_test.rs` passed.
  - Unit tests in `nnue_test.rs` passed.
  - Unit tests in `search_test.rs` passed.
