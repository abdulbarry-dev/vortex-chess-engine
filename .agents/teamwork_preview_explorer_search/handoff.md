# Handoff Report: Deep Audit of Search and Evaluation Mechanisms in Vortex Core

This report provides a detailed read-only audit of the search and evaluation mechanisms in the `vortex-core` Rust crate, specifically focusing on the 7 requested focus areas.

---

## 1. Observation

### Focus Area 1: Root TT Bounds
In `vortex-core/src/search/mod.rs` (lines 231–242), the transposition table (TT) entry is stored at the root using bounds evaluated against the search window (`original_alpha` and `beta`):
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

### Focus Area 2: Quiescence Quiet Filtering
In `vortex-core/src/search/mod.rs` (lines 551–559), quiescence search generates pseudo-legal moves and filters out non-capture and non-promotion moves before scoring or sorting:
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
```
At lines 563–574, `score_move` and sorting only run on `move_list`, which excludes quiet moves.

### Focus Area 3: Root TT Move Ordering
In `vortex-core/src/search/mod.rs` (lines 117–120) under `search_root_internal`:
```rust
    let mut tt_move = Move(0);
    if let Some(entry) = tt.probe(state.hash) {
        tt_move = Move(entry.best_move);
    }
```
And at lines 165–167:
```rust
    for i in 0..move_list.count {
        move_scores[i] = score_move(move_list.moves[i], state, tt_move, 0, &killers, &history, &swindle, contempt);
    }
```
In `score_move` (line 52):
```rust
    if m == tt_move { return 10_000_000; }
```

### Focus Area 4: Pawn Tension Sign Reversal
In `vortex-core/src/evaluate.rs` (lines 267–285), the `evaluate_pawn_tension` function calculates and updates the evaluation score as follows:
```rust
fn evaluate_pawn_tension(state: &GameState) -> i16 {
    let mut score = 0;
    let white_pawns = state.board.get_pieces(Color::White, PieceType::Pawn);
    let black_pawns = state.board.get_pieces(Color::Black, PieceType::Pawn);
    
    let w_attacks_left = (white_pawns & !0x0101010101010101u64) << 7;
    let w_attacks_right = (white_pawns & !0x8080808080808080u64) << 9;
    
    score -= (count_bits(w_attacks_left & black_pawns) as i16) * 10;
    score -= (count_bits(w_attacks_right & black_pawns) as i16) * 10;
    
    let b_attacks_left = (black_pawns & !0x0101010101010101u64) >> 9;
    let b_attacks_right = (black_pawns & !0x8080808080808080u64) >> 7;
    
    score += (count_bits(b_attacks_left & white_pawns) as i16) * 10;
    score += (count_bits(b_attacks_right & white_pawns) as i16) * 10;
    
    score
}
```

### Focus Area 5: King Safety Scaling
In `vortex-core/src/evaluate.rs` (lines 137–147), king safety is evaluated and combined using the following logic:
```rust
        // 3. King Safety
        let w_safety = evaluate_king_safety(state, Color::White);
        let b_safety = evaluate_king_safety(state, Color::Black);
        
        if w_safety < b_safety {
            score += (w_safety as f32 * 1.4) as i16 - b_safety;
        } else if b_safety < w_safety {
            score += w_safety - (b_safety as f32 * 1.4) as i16;
        } else {
            score += w_safety - b_safety;
        }
```

### Focus Area 6: Swindle Complexity
In `vortex-core/src/search/swindle.rs` (lines 43–55), the complexity bonus is evaluated:
```rust
        let us_pawns = state.board.get_pieces(state.side_to_move, PieceType::Pawn);
        let them_pawns = state.board.get_pieces(state.side_to_move.opposite(), PieceType::Pawn);
        
        let (left_attacks, right_attacks) = if state.side_to_move == crate::types::Color::White {
            ((us_pawns & !0x0101010101010101) << 7, (us_pawns & !0x8080808080808080) << 9)
        } else {
            ((us_pawns & !0x0101010101010101) >> 9, (us_pawns & !0x8080808080808080) >> 7)
        };
        

        // We will just approximate tension as pawn attacks intersecting opponent pawns
        let tension_mask = (left_attacks | right_attacks) & them_pawns;
        let tension = tension_mask.count_ones() as i32;
```

### Focus Area 7: Defensive Philosophy
- **Fortress scaling**: `vortex-core/src/evaluate.rs` (lines 418–449) defines `fortress_scale`, which scales down the evaluation toward zero (by `0.5` or `0.25`) for opposite-colored bishop endgames.
- **Simplification / tablebase magnetism**: `vortex-core/src/evaluate.rs` (lines 388–416) defines `tablebase_magnetism`, which adjusts the score closer to 0 when material is reduced, pulling evaluations towards a draw when behind and penalizing trades when ahead.
- **Pawn blockades**: In `vortex-core/src/evaluate.rs` (lines 355–386), `evaluate_blockade` measures locked pawns on the same file:
  ```rust
      for file in 0..8 {
          let file_mask = 0x0101010101010101u64 << file;
          let w_file = white_pawns & file_mask;
          let b_file = black_pawns & file_mask;
          
          if w_file != 0 && b_file != 0 {
              let w_sq = 63 - w_file.leading_zeros() as usize;
              let b_sq = b_file.trailing_zeros() as usize;
              
              if b_sq == w_sq + 8 {
                  locked_files += 1;
              }
              if w_sq == b_sq + 8 {
                  locked_files -= 1;
              }
          }
      }
      
      score += (locked_files as i16) * 20; 
      if locked_files >= 3 {
          score += 40; 
      }
  ```

---

## 2. Logic Chain

### Focus Area 1: Root TT Bounds
- Standard alpha-beta minimax writes nodes to the Transposition Table based on whether the score is <= alpha (upper bound, `TT_ALPHA`), >= beta (lower bound, `TT_BETA`), or exact (`TT_EXACT`).
- The root function `search_root_internal` stores search outcomes to the TT at the end of the root search loop using the same logic. While theoretically sound within the search tree, root fail-highs or fail-lows caused by narrow aspiration windows will write `TT_ALPHA` or `TT_BETA` directly to the root hash key in the transposition table.

### Focus Area 2: Quiescence Quiet Filtering
- The quiescence loop (`quiescence_search`) filters the raw pseudo-legal move list down to moves where `m.is_capture() || m.is_promotion()`.
- Thus, quiet moves (which have neither flag) are never included in the filtered `move_list`.
- Since only the filtered `move_list` is scored and sorted, quiet moves are never scored or sorted.

### Focus Area 3: Root TT Move Ordering
- At the root, `tt.probe(state.hash)` is queried.
- The returned `tt_move` is passed into `score_move`.
- In `score_move`, if the move matches `tt_move`, it gets a score of `10_000_000`.
- The sorting algorithm at the root then shifts this move to index `0` because it has the highest score.
- Therefore, root TT move ordering is fully present and correct.

### Focus Area 4: Pawn Tension Sign Reversal
- In evaluation, positive score values favor White, and negative values favor Black.
- White pawn attacks on Black pawns represent White applying pressure to Black. This should either increase the score or at least not decrease it.
- However, `score -= (count_bits(w_attacks & black_pawns) as i16) * 10` is used. This decreases White's score when White is attacking Black.
- Conversely, Black pawn attacks on White pawns represent Black applying pressure to White. This should decrease the score.
- However, `score += (count_bits(b_attacks & white_pawns) as i16) * 10` is used. This increases White's score when Black is attacking White.
- Therefore, the evaluation sign is completely reversed for pawn tension. White attacking Black helps Black; Black attacking White helps White.

### Focus Area 5: King Safety Scaling
- King safety scores are absolute, positive-biased values (increased for pawn shields, decreased for open/semi-open files).
- The scaling logic evaluates who has the lower safety score, then scales that lower safety score by `1.4` before computing the difference.
- If White safety is `10` and Black safety is `20` (White king is less safe), the code does: `score += (10 * 1.4) - 20 = 14 - 20 = -6`. Without scaling, it would be `10 - 20 = -10`. This means White's penalty is *reduced* (a relative bonus) when White's king is less safe.
- If White safety is `-20` and Black safety is `-10` (White king is less safe), the code does: `score += (-20 * 1.4) - (-10) = -28 - (-10) = -18`. Without scaling, it would be `-20 - (-10) = -10`. This correctly increases the penalty when the raw score is negative.
- Scaling the raw safety score directly rather than scaling the difference (`w_safety - b_safety`) creates an inconsistent penalty behavior depending on whether the raw safety is positive or negative.

### Focus Area 6: Swindle Complexity
- The bitboard shifting rules map a pawn's attacks.
- For White: `<< 7` (left attack, rank+1, file-1) and `<< 9` (right attack, rank+1, file+1). File masks check `!0x01...` (left attack cannot originate on A-file) and `!0x80...` (right attack cannot originate on H-file). This matches the Board layout.
- For Black: `>> 9` (left attack, rank-1, file-1) and `>> 7` (right attack, rank-1, file+1). File masks check `!0x01...` (left attack cannot originate on A-file) and `!0x80...` (right attack cannot originate on H-file).
- This is correct and symmetrical.
- However, the tension mask is computed as: `(left_attacks | right_attacks) & them_pawns` where attacks are only from `us_pawns` on `them_pawns`. This makes the tension measure one-sided (asymmetric).

### Focus Area 7: Defensive Philosophy
- **Opposite-Colored Bishops**: `fortress_scale` scales down the score to `0.25` or `0.5` in opposite-colored bishop endgames, directly implementing drawing mechanisms discussed in the fortress recognition research documents.
- **Simplification / Tablebase Magnetism**: `tablebase_magnetism` scales evaluations toward `0` as the number of non-pawn pieces drops below 14. This rewards simplified drawish positions when losing and discourages trading pieces when winning, which mirrors the "simplification under pressure" defensive concept.
- **Asymmetric Blockade Bug**: `evaluate_blockade` adds `40` to the score if `locked_files >= 3` (rewarding White for blockading Black), but does not subtract `40` if `locked_files <= -3` (failing to reward Black for blockading White).
- **Prophylaxis**: No explicit nimzowitsch-style overprotection bonuses or opponent mobility restriction bonuses exist in the hand-crafted evaluation.

---

## 3. Caveats

- **NNUE vs HCE**: The audit concerns only the Hand-Crafted Evaluation (HCE) pathway. When NNUE is loaded (`is_vortex_loaded()`), HCE is skipped, meaning that pawn tension, king safety scaling, blockades, and their associated bugs do not manifest on the NNUE evaluation itself. However, swindle complexity bonuses and fortress/tablebase scaling are applied to both HCE and NNUE outputs.
- **Search Extensions**: Search singular extensions or threat-prediction extensions based on the `threat_delta` logged during NMP are not active in search (the value is only logged and reported to the wrapper).

---

## 4. Conclusion

The audit identifies several successful mechanisms along with three critical bugs and asymmetries:
1. **Pawn Tension Sign Reversal (Bug)**: `evaluate_pawn_tension` penalizes the attacker and rewards the defender. Correcting this would involve swapping the `+=` and `-=` operators or swapping the attacks masks.
2. **King Safety Scaling Anomaly (Bug)**: Direct scaling of raw safety scores causes inverted penalties when safety scores are positive. The correction should scale the safety *difference* or the safety *deficiency* rather than the raw score.
3. **Blockade Evaluation Asymmetry (Bug)**: `evaluate_blockade` lacks a corresponding penalty for White (bonus for Black) when `locked_files <= -3`.
4. **Quiescence Search**: Correctly filters quiet moves (only capture/promotion evaluated).
5. **Root TT Bounds & Move Ordering**: Both function correctly as implemented.
6. **Defensive Philosophy**: Fortress scaling and tablebase magnetism are successfully aligned with the research documents, but HCE lacks explicit prophylaxis components.

---

## 5. Verification Method

To verify these observations and conclusions independently:
1. **Build & Test**: Run `cargo test` inside the `vortex-core/` directory to run all unit tests, confirming that they pass under the current baseline:
   ```bash
   cd vortex-core && cargo test
   ```
2. **Inspect Files**:
   - For Focus Areas 1, 2, and 3: View `vortex-core/src/search/mod.rs` around lines 117 (root TT probe), 231 (root TT bounds store), and 551 (quiescence filtering).
   - For Focus Areas 4, 5, and 7: View `vortex-core/src/evaluate.rs` around lines 137 (king safety scaling), 267 (pawn tension calculation), 355 (blockade calculation), and 418 (fortress scaling).
   - For Focus Area 6: View `vortex-core/src/search/swindle.rs` around line 43 (complexity bonus).
