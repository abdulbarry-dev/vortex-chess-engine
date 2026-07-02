# Handoff Report - Search Analysis

## 1. Observation
We conducted a deep read-only analysis of the search components in `vortex-core/src/search` (`mod.rs`, `id.rs`, `aspiration.rs`, `swindle.rs`, `variance.rs`). We observed the following exact code and structures:

* **Observation A (Unconditional TT Storing at Root)**: In `vortex-core/src/search/mod.rs` lines 225–227, the root search unconditionally stores TT entries as exact:
  ```rust
      if best_move.0 != 0 {
          tt.store(state.hash, depth, best_score, TT_EXACT, best_move);
      }
  ```
* **Observation B (Incorrect Pawn Tension for Black in Swindle Mode)**: In `vortex-core/src/search/swindle.rs` lines 48–49, the complexity calculation computes pawn attacks assuming pawn shifts are always forward (upward) for White:
  ```rust
          let left_attacks = (us_pawns & !0x0101010101010101) << 7;
          let right_attacks = (us_pawns & !0x8080808080808080) << 9;
  ```
* **Observation C (Quiescence Search Quiet Move Sorting/Scoring)**: In `vortex-core/src/search/mod.rs` lines 536–558, the quiescence search generates all moves, scores them, and sorts them before skipping quiet moves:
  ```rust
      let mut move_list = generate_pseudo_legal_moves(&state.board, state.side_to_move, state.castling_rights, state.en_passant_sq);
      ...
      for i in 0..move_list.count {
          move_scores[i] = score_move(move_list.moves[i], state, Move(0), 0, killers, history, &swindle, contempt);
      }
      ...
      for i in 0..move_list.count {
          ...
          if !m.is_capture() && !m.is_promotion() { continue; }
  ```
* **Observation D (Missing TT Move Ordering at Root)**: In `vortex-core/src/search/mod.rs` line 160, the move scoring loop passes `Move(0)` as the TT move parameter to `score_move`:
  ```rust
          move_scores[i] = score_move(move_list.moves[i], state, Move(0), 0, &killers, &history, &swindle, contempt);
  ```
* **Observation E (Dead VarianceTracker Component)**: In `vortex-core/src/search/mod.rs` line 156, `_variance_tracker` is initialized but never used:
  ```rust
      let _variance_tracker = VarianceTracker::new();
  ```

---

## 2. Logic Chain

* **Logic Chain A (Unconditional TT Storing)**:
  1. Under Observation A, `best_score` is stored as `TT_EXACT` regardless of search bounds.
  2. In an alpha-beta search (and specifically aspiration searches used in `id.rs`/`aspiration.rs`), `best_score` can be less than or equal to the search's initial `alpha` (fail-low) or greater than or equal to `beta` (fail-high).
  3. Storing fail-low and fail-high bounds as `TT_EXACT` means subsequent probes will assume they are exact scores.
  4. This introduces incorrect score values into the search tree during transpositions, leading to search instability and severe tactical blunders.

* **Logic Chain B (Incorrect Swindle Pawn Tension)**:
  1. Under Observation B, pawn attacks are always calculated via left-shifts (`<<`).
  2. White pawns move up the board (increasing square index), so left-shifts represent White pawn attacks.
  3. Black pawns move down the board (decreasing square index), requiring right-shifts (`>>`) to represent Black pawn attacks.
  4. Thus, if Black is the side to move (the one trying to swindle), the complexity evaluation is calculated using incorrect (non-existent) pawn attacks, producing an incorrect complexity score.

* **Logic Chain C (Quiescence Search Bottleneck)**:
  1. Under Observation C, quiescence search generates and processes all moves.
  2. For every move (including quiet moves), `score_move` is called.
  3. `score_move` contains an expensive call to `evaluate_policy_move` (policy head NNUE evaluation).
  4. Since quiet moves are not searched in quiescence search, computing their scores and sorting them represents a massive, useless computational overhead.

* **Logic Chain D (Missing TT Move Ordering)**:
  1. Under Observation D, the root search orders moves without a TT move.
  2. Iterative deepening relies on finding the best move from the previous iteration to search first at the next depth.
  3. Searching the best move first maximises alpha-beta cutoffs, reducing the search space exponentially.
  4. Passing `Move(0)` prevents the root search from checking the best move first, causing a massive nodes-evaluated bottleneck.

---

## 3. Caveats
* We assumed that the WASM boundary optimization in `SearchControl::time_up` operates correctly and did not investigate WASM build interactions.
* We did not implement or test the proposed patches ourselves, as we are under a read-only constraint.

---

## 4. Conclusion
We conclude that the search module has critical correctness bugs (transposition table bounds corruption, incorrect swindle mode evaluation for Black) and severe performance bottlenecks (quiescence search policy-head evaluation on quiet moves, missing root TT move ordering). These issues can be resolved with localized patches in `vortex-core/src/search/mod.rs` and `swindle.rs`.

---

## 5. Verification Method
To verify these findings and the impact of the proposed changes:
1. Run `cargo test --manifest-path vortex-core/Cargo.toml` to ensure the baseline test suite passes.
2. View `analysis.md` inside `.agents/teamwork_preview_explorer_m1_1/` for detailed descriptions of the root causes and concrete patches.
3. Once the implementer applies the patches, run the vitest search tests with `npm test` and verify that the search depth/speed (NPS) increases significantly (particularly due to the quiescence search and root TT move ordering fixes) without breaking correctness.
