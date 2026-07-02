## 2026-07-01T21:59:02Z
You are a teamwork_preview_worker.
Your designated working directory is /home/vortex/Desktop/Projects/vortex-chess-engine/.agents/teamwork_preview_worker_m3_1.
Your objective is to apply the following fixes to the Rust core (`vortex-core/`):

1. **NNUE dequantization scale mismatch**:
   - File: `vortex-core/src/nnue/forward.rs`
   - In `evaluate_nnue` (around line 92): change the dequant computation to:
     `let dequant = 512.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);`
   - In `evaluate_policy_move` (around line 163): change the dequant computation to:
     `let dequant = 512.0 / (FT_QUANT as f32 * FT_QUANT as f32);`

2. **Threat accumulator update mismatch (leak/drift)**:
   - File: `vortex-core/src/nnue/network.rs`
   - In `push_threats_on_change` (around lines 261 and 285): use `0` as the occupancy mask instead of `board.occupancies[2]`.
   - Specifically:
     Line 261: `let attacks = Self::get_attacks(piece, color, sq, 0);`
     Line 285: `let e_attacks = Self::get_attacks(pt, them, e_sq, 0);`

3. **NNUE Weights RwLock Contention**:
   - File: `vortex-core/src/nnue/weights.rs`
   - Change line 49 from:
     `pub static WEIGHTS: Mutex<VortexWeights> = Mutex::new(VortexWeights::new());`
     to:
     `pub static WEIGHTS: std::sync::RwLock<VortexWeights> = std::sync::RwLock::new(VortexWeights::new());`
   - File: `vortex-core/src/nnue/forward.rs`
     Replace `.lock().unwrap_or_else(...)` with `.read().unwrap_or_else(...)` for `WEIGHTS`.
     For example:
     `let w = WEIGHTS.read().unwrap_or_else(|e| e.into_inner());`
   - File: `vortex-core/src/nnue/serialize.rs`
     Check if there is any lock access on `WEIGHTS`. If it reads, change to `.read()`. If it writes/initializes, use `.write().unwrap_or_else(...)`.

4. **Correct Transposition Table bounds at root**:
   - File: `vortex-core/src/search/mod.rs`
   - In `search_root_internal` (around line 116), save the original alpha:
     `let original_alpha = alpha;`
   - At the end of `search_root_internal` (around lines 225-227), calculate `bound` as `TT_ALPHA` if `best_score <= original_alpha`, `TT_BETA` if `best_score >= beta`, else `TT_EXACT`. Store `score_to_store` adjusted for mate if necessary.
     ```rust
     if best_move.0 != 0 {
         let bound = if best_score <= original_alpha { TT_ALPHA }
                    else if best_score >= beta { TT_BETA }
                    else { TT_EXACT };
         let mut score_to_store = best_score;
         if score_to_store > MATE_SCORE - 100 {
             score_to_store += 0;
         } else if score_to_store < -MATE_SCORE + 100 {
             score_to_store -= 0;
         }
         tt.store(state.hash, depth, score_to_store, bound, best_move);
     }
     ```

5. **Quiescence search performance bottleneck**:
   - File: `vortex-core/src/search/mod.rs`
   - In `quiescence_search` (around lines 536-558):
     Generate all moves into `raw_move_list`, then filter to `move_list` containing only captures and promotions *before* move scoring and sorting.
     ```rust
     let mut raw_move_list = generate_pseudo_legal_moves(&state.board, state.side_to_move, state.castling_rights, state.en_passant_sq);
     let mut move_list = crate::movegen::MoveList { moves: [Move(0); 256], count: 0 };
     for i in 0..raw_move_list.count {
         let m = raw_move_list.moves[i];
         if m.is_capture() || m.is_promotion() {
             move_list.moves[move_list.count] = m;
             move_list.count += 1;
         }
     }
     // Now score and sort move_list
     ```

6. **Missing root TT move ordering**:
   - File: `vortex-core/src/search/mod.rs`
   - In `search_root_internal` (around lines 115-116), probe the TT:
     ```rust
     let mut tt_move = Move(0);
     if let Some(entry) = tt.probe(state.hash) {
         tt_move = Move(entry.best_move);
     }
     ```
   - In the move scoring loop:
     `move_scores[i] = score_move(move_list.moves[i], state, tt_move, 0, &killers, &history, &swindle, contempt);`

7. **Incorrect Swindle Pawn Tension**:
   - File: `vortex-core/src/search/swindle.rs`
   - In `complexity_bonus` (around lines 48-49):
     ```rust
     let (left_attacks, right_attacks) = if state.side_to_move == crate::types::Color::White {
         ((us_pawns & !0x0101010101010101) << 7, (us_pawns & !0x8080808080808080) << 9)
     } else {
         ((us_pawns & !0x0101010101010101) >> 9, (us_pawns & !0x8080808080808080) >> 7)
     };
     ```

8. **Handcrafted pawn tension evaluation signs**:
   - File: `vortex-core/src/evaluate.rs`
   - In `evaluate_pawn_tension` (around lines 275-282), flip the signs of evaluation score adjustments:
     White attacking Black pawns -> `score += ...`
     Black attacking White pawns -> `score -= ...`

9. **King safety difference scaling**:
   - File: `vortex-core/src/evaluate.rs`
   - In `evaluate_king_safety` / HCE safety adjustments (around lines 141-147), scale the difference `b_safety - w_safety` by 1.4:
     ```rust
     if w_safety < b_safety {
         score -= ((b_safety - w_safety) as f32 * 1.4) as i16;
     } else if b_safety < w_safety {
         score += ((w_safety - b_safety) as f32 * 1.4) as i16;
     }
     ```

Verify and run:
- Compile/test the Rust project: `cargo test --manifest-path vortex-core/Cargo.toml`
- Compile the WASM target: `npm run build:wasm`
- Run JS/TS vitest suite: `npm test`
Write a list of modifications to `changes.md` and complete a handoff report in `handoff.md`.
