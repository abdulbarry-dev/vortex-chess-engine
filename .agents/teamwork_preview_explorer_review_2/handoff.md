# Handoff Report — Explorer 2

This report evaluates the Fortress and Magnetism heuristics implemented in `vortex-core/src/evaluate.rs` against the engine's core defensive philosophy.

---

## 1. Observation

### Observation A: Fortress Implementation Gaps
In `vortex-core/src/evaluate.rs` lines 381-411, the `fortress_scale` function only evaluates opposite-colored bishops:
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
            ...
        }
    }
    (score as f32 * factor) as i16
}
```
However, in `src/evaluation/FortressEvaluator.ts`, there are additional fortress checks that are entirely missing in Rust:
- `evaluateLockedPawnChains` (evaluates locked pawn chains and lack of open files, scaling down by up to 0.4).
- `evaluateRookFortress` (checks if the defending king is boxed in/in the corner in a rook endgame, scaling down by 0.6).
- `evaluateDrawishEndgamePatterns` (checks if pawns are concentrated on a narrow band, file span <= 3, scaling down by 0.5 to 0.85).

### Observation B: Blockade Asymmetry Bug
In `vortex-core/src/evaluate.rs` line 124, the blockade bonus is added directly to White's absolute score:
```rust
        // 5. Blockade
        score += evaluate_blockade(state);
```
Since it is a flat positive addition, White receives a bonus for blockading, but Black's blockade score is evaluated as positive, which Black's minimizing search seeks to avoid.

### Observation C: Rust Search Test Failure
Running `cargo test` in `vortex-core` fails on:
```
thread 'test_search_depth_1' (998562) panicked at tests/search_test.rs:72:5:
assertion failed: score >= -50 && score <= 50
```
Line 72 in `vortex-core/tests/search_test.rs` reads:
```rust
    assert!(score >= -50 && score <= 50);
```

---

## 2. Logic Chain

1. **Fortress Incompleteness:** Comparing the Rust `fortress_scale` (Observation A) with the TypeScript `FortressEvaluator.ts` reveals that three out of four fortress heuristics are missing. Without Locked Pawn Chain detection, Rook Corner endgames, and Concentrated Pawn Spans, the Rust engine cannot recognize blockaded pawn structures or rook corner draw positions, making it unable to steer into them when losing.
2. **Blockade Asymmetry Bug:** The blockade bonus in `evaluate.rs` is added directly to White's score (Observation B). In minimax, White seeks to maximize and Black seeks to minimize the score. Because the blockade bonus is always positive, White is rewarded for blockading, but Black is penalized for blockading (or rather, Black's search will reject blockaded positions). This causes the engine to behave blockading-averse when playing Black, directly violating the defensive philosophy of using blockades to slow the game down.
3. **Rust Test Failure:** In `test_search_depth_1`, the search evaluates positions after White's first move (Observation C). Because White's pawn PST improves from `-20` to `+20` and White gains mobility for the queen and bishop (adding `+18cp` in mobility), White's score at depth 1 naturally rises above `50cp`, triggering the assertion failure.

---

## 3. Caveats
- We did not examine the NNUE weights themselves; the investigation assumes the handcrafted evaluation is the primary fallback or hybrid partner as configured.
- We did not implement code fixes, in line with our read-only constraint.

---

## 4. Conclusion
The Rust core's implementation of Tablebase Magnetism is correct and matches the TS version, but its Fortress Recognition is only partially implemented (missing pawn barriers, rook corners, and pawn spans). There is a critical minimax asymmetry bug in the blockade evaluation that discourages Black from blockading, and the Rust test suite contains an overly restrictive assertion that causes tests to fail.

---

## 5. Verification Method

To verify these findings:
1. **To verify the Rust test failure:** Run `cargo test --test search_test test_search_depth_1` in `vortex-core/`. It will panic on the assertion.
2. **To inspect Fortress/Blockade/Magnetism logic:** Open `vortex-core/src/evaluate.rs` and check lines 124 (`score += evaluate_blockade(state);`), 352-379 (`tablebase_magnetism`), and 381-411 (`fortress_scale`).
3. **To inspect TS Reference:** Open `src/evaluation/FortressEvaluator.ts` and `src/evaluation/Evaluator.ts` to confirm the missing heuristics.
