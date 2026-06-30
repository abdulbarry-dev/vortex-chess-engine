# Evaluation of Fortress and Magnetism Heuristics in Vortex Engine Core

This report evaluates the Fortress and Magnetism heuristics implemented in the Rust-based engine core (`vortex-core/src/evaluate.rs`) against the engine's core defensive philosophy as documented in `docs/research/`.

---

## Executive Summary
1. **Tablebase Magnetism (Piece Count Gravity):** The Rust implementation in `evaluate.rs` aligns perfectly with the design specified in `docs/research/tablebase-magnetism.md`. It successfully implements simplification gravity and a tablebase threshold anchor, using a minimax-compatible direction adjustment.
2. **Fortress Recognition:** The Rust implementation is a **very partial port** of the TS implementation. It only implements the opposite-colored bishop (OCB) endgame scaling, completely omitting locked pawn chains/pawn barriers, rook corner fortresses, and pawn span concentration. This represents a significant gap in the engine's ability to seek out defensive fortresses.
3. **Blockade Asymmetry Bug:** The `evaluate_blockade` function is implemented as a flat positive addition to White's score. This makes the heuristic asymmetric: White is rewarded for blockading, but Black is penalized (discouraged from blockading). This is a severe bug in the minimax evaluation logic.
4. **Test Suite Defect:** The Rust search test `test_search_depth_1` in `vortex-core/tests/search_test.rs` is currently failing due to an overly restrictive score assertion `assert!(score >= -50 && score <= 50)` on the starting position, which does not account for the natural first-move advantage of White amplified by mobility and PST bonuses.

---

## 1. Tablebase Magnetism (Piece Count Gravity)
Tablebase Magnetism aims to guide the engine toward drawn endgames when it is losing. 

### Implementation Analysis
In `vortex-core/src/evaluate.rs`:
```rust
fn tablebase_magnetism(state: &GameState, score: i16) -> i16 {
    if score.abs() < 50 { return 0; }
    
    let mut total_pieces = 0;
    let mut non_pawn_pieces = 0;
    
    for c in [Color::White, Color::Black] {
        total_pieces += count_bits(state.board.occupancies[c as usize]);
        non_pawn_pieces += count_bits(state.board.occupancies[c as usize] 
            ^ state.board.get_pieces(c, PieceType::Pawn) 
            ^ state.board.get_pieces(c, PieceType::King));
    }
    
    let mut bonus = (14 - non_pawn_pieces as i16) * 8;
    if total_pieces <= 7 {
        bonus += 50;
    }
    
    bonus = bonus.min((score.abs() as f32 * 0.5) as i16);
    
    if score < -50 {
        bonus
    } else if score > 50 {
        -bonus
    } else {
        0
    }
}
```

### Strategic Alignment
- **Simplification Gravity:** Adds `+8cp` per non-pawn piece traded off the board (relative to the maximum starting count of 14 pieces). This incentivizes the engine to exchange pieces when behind.
- **Tablebase Threshold Anchor:** Adds a flat `+50cp` when total pieces on the board drop to 7 or fewer, pulling the engine toward the Syzygy tablebase limit.
- **Directional Sign Logic:** The bonus is added as positive to a negative score (pushing White's losing score closer to 0) and as negative to a positive score (pushing Black's losing score closer to 0). This correctly matches minimax search assumptions: White maximizes, Black minimizes.
- **Capping Mechanism:** The bonus is capped at 50% of the evaluation score, which prevents sign-flipping and preserves search gradients.
- **Research Alignment:** Matches `docs/research/tablebase-magnetism.md` and the TS reference in `src/evaluation/Evaluator.ts` exactly.

---

## 2. Fortress Recognition (Fortress Scale)
Fortress Recognition scales down the evaluation score when a drawn configuration is detected, making the deficit look smaller and encouraging the engine to steer into it.

### Implementation Analysis
In `vortex-core/src/evaluate.rs`:
```rust
fn fortress_scale(state: &GameState, score: i16) -> i16 {
    if score.abs() < 50 { return score; }
    
    let mut factor = 1.0;
    let w_bishops = state.board.get_pieces(Color::White, PieceType::Bishop);
    let b_bishops = state.board.get_pieces(Color::Black, PieceType::Bishop);
    
    if count_bits(w_bishops) == 1 && count_bits(b_bishops) == 1 {
        let w_sq = w_bishops.trailing_zeros() as usize;
        let b_sq = b_bishops.trailing_zeros() as usize;
        
        let w_light = ((w_sq / 8) + (w_sq % 8)) % 2 != 0;
        let b_light = ((b_sq / 8) + (b_sq % 8)) % 2 != 0;
        
        if w_light != b_light {
            factor *= 0.5;
            
            let mut other_pieces = 0;
            for c in [Color::White, Color::Black] {
                for pt in [PieceType::Knight, PieceType::Rook, PieceType::Queen] {
                    other_pieces += count_bits(state.board.get_pieces(c, pt));
                }
            }
            if other_pieces == 0 {
                factor *= 0.5;
            }
        }
    }
    
    (score as f32 * factor) as i16
}
```

### Gap Identification
While the opposite-colored bishop (OCB) check is correctly ported from `src/evaluation/FortressEvaluator.ts`, the other three fortress heuristics from the TypeScript codebase and `docs/research/fortress-recognition.md` are **completely missing** in Rust:
1. **Locked Pawn Chains (Pawn Barriers):** `evaluateLockedPawnChains` in TS evaluates interlocked pawns and checks for a lack of open files (impenetrability metric). This is crucial for detecting drawing fortresses with blocked files.
2. **Rook Corner Fortresses:** `evaluateRookFortress` in TS checks if the defending king is boxed in/in the corner in a rook endgame, with a rook cutting off the enemy king.
3. **Concentrated Pawn Spans:** `evaluateDrawishEndgamePatterns` in TS checks if pawns are concentrated on a narrow band (file span <= 3) with few pieces on the board.

### Strategic Consequences
Without these missing heuristics, the Rust core cannot recognize locked-structure fortresses or rook-endgame corner draws. When at a material disadvantage, it will fail to choose moves that block files or steer into rook corners, violating the engine's core defensive philosophy.

---

## 3. Blockade and Pawn Structure Heuristics
Closed and blockaded structures are key to defensive play as they limit tactical volatility and suppress opponent piece mobility.

### The Blockade Asymmetry Bug
In `vortex-core/src/evaluate.rs`:
```rust
        // 5. Blockade
        score += evaluate_blockade(state);
```
`evaluate_blockade` counts locked pawn pairs on the same file and adds `+20cp` per locked file (with an additional `+40cp` if 3 or more are locked).
- **The Bug:** The blockade bonus is added directly to `score` (White's score). Because it is a flat positive addition, White is rewarded for blockading, but Black is penalized.
- **Minimax Impact:** In the alpha-beta tree, Black is the minimizer and seeks to reduce the score. Since blockading increases the score, Black's search will actively avoid blockading—even when Black is defending and desperately needs to close the position. White, conversely, will seek blockades even when winning and needing to open the game to convert.
- **Alignment Failure:** This completely violates the Nimzowitsch blockade principle in `docs/research/defensive-philosophy.md` for the Black pieces.

### Pawn Structure Changes
In the `ca9a755` commit, the previous overextension penalty was removed from `evaluate_pawn_structure`:
```rust
// Removed code:
if relative_rank >= 5 {
    score -= 10;
}
```
- **Analysis:** While the removed code was buggy (it penalized all advanced pawns, including strong passed pawns, without checking if they were unsupported), removing it leaves the Rust core without a prophylaxis/patience mechanism for pawn structures. There is currently no penalty for premature pawn pushes that weaken the king shield or defensive squares.

---

## 4. Test Suite Analysis
The Rust test runner fails on `cargo test` in `vortex-core`:
- **Verbatim Error:**
  ```
  thread 'test_search_depth_1' (998562) panicked at tests/search_test.rs:72:5:
  assertion failed: score >= -50 && score <= 50
  ```
- **Cause:** At depth 1 from the starting position, White plays a move (e.g. `d4` or `e4`). This increases White's pawn PST bonus by `+40cp` (moving from a `-20cp` square to a `+20cp` square) and increases mobility for the queen and bishop, adding `+18cp` in mobility bonuses. The total score exceeds `50cp`, failing the assertion.
- **Recommendation:** The assertion in `tests/search_test.rs:72` should be relaxed to `score >= -100 && score <= 100` or the search depth 1 test should check for structural balance rather than strict first-move advantage bounds.
