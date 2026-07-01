# Handoff Report — Vortex Search Logic Audit

## 1. Observation

During a read-only investigation of the Rust core search engine, several structural bugs, performance bottlenecks, and missing features were identified.

### Observation 1.1: Missing Mate Score Adjustment in Transposition Table (TT)
In `vortex-core/src/search/mod.rs` (lines 256–263):
```rust
    if let Some(entry) = tt.probe(hash) {
        if entry.depth >= depth {
            if entry.bound == TT_EXACT { return entry.score; }
            if entry.bound == TT_ALPHA && entry.score <= alpha { return alpha; }
            if entry.bound == TT_BETA && entry.score >= beta { return beta; }
        }
        tt_move = Move(entry.best_move);
    }
```
And in line 391:
```rust
    tt.store(hash, depth, best_score, bound, best_move);
```
No modifications are made to mate scores stored in the TT to account for distance from root (`ply`), which is standard practice in transposition tables.

### Observation 1.2: Total Node Count Under-reporting (Resetting `ctrl.nodes = 0`)
In `vortex-core/src/search/mod.rs` (line 108):
```rust
pub fn search_root_internal(state: &mut GameState, depth: i8, mut alpha: i16, beta: i16, tt: &mut TranspositionTable, ctrl: &mut SearchControl) -> SearchResult {
    ctrl.nodes = 0;
```
Every invocation of the root search resets the node counter to 0.

### Observation 1.3: Repetition History Cleared and Underflows
In `vortex-core/src/state.rs` (lines 80–226), the function `make_move` does not push the current hash to `self.repetition_history`. In `unmake_move` (lines 278–280):
```rust
        if !self.repetition_history.is_empty() {
            self.repetition_history.pop();
        }
```
In `vortex-core/src/search/mod.rs` (line 484):
```rust
fn is_repetition(state: &GameState) -> bool {
    let history = &state.repetition_history;
    if history.len() < 4 { return false; }
```

### Observation 1.4: Heuristics Local Wiping (Killers and History arrays)
In `vortex-core/src/search/mod.rs` (lines 114–115):
```rust
    let mut killers = [[Move(0); 2]; MAX_PLY as usize];
    let mut history = [[[0i32; 64]; 64]; 2];
```
These arrays are initialized locally inside `search_root_internal`.

### Observation 1.5: Threat Delta State Pollution
In `vortex-core/src/search/mod.rs` (lines 278–284):
```rust
        let current_eval = evaluate(state);
        let threat_delta = current_eval - null_score;
        if threat_delta > 200 {
            state.threat_delta = threat_delta;
        } else {
            state.threat_delta = 0;
        }
```
No restoration of `state.threat_delta` occurs during backtracking or in `unmake_move`. No threat delta check is run at the root of `search_root_internal`.

### Observation 1.6: Overly Aggressive LMR Reduction
In `vortex-core/src/search/mod.rs` (lines 342–344):
```rust
                let lmr_base = legal_moves.min(64) as f32;
                let reduction = (lmr_base.ln() / 2.0f32.ln()).round() as i8;
                let reduced = (depth - 1 - reduction).max(0);
```

### Observation 1.7: Unused VarianceTracker
In `vortex-core/src/search/mod.rs` (line 151):
```rust
    let _variance_tracker = VarianceTracker::new();
```
The struct is instantiated but goes out of scope without being used.

---

## 2. Logic Chain

### Logic Chain 1.1 (Mate Score Adjustment)
Checkmate values are represented as `+/-MATE_SCORE` adjusted by distance from root (`ply`). Storing a checkmate score directly in the TT causes it to lose its root-relative meaning. When accessed from a different branch or at a different ply via transposition, the unadjusted score will be incorrect, potentially leading to search loops, missed mates, or incorrect mate announcements.
*Conclusion*: Mate scores must be normalized to root-independent values before writing to the TT and re-adjusted to root-relative values after reading from the TT.

### Logic Chain 1.2 (Node Count Reset)
Iterative deepening (`search_root_id`) calls `search_with_windowing` once per depth, which calls `search_root_internal`. By resetting `ctrl.nodes = 0` inside `search_root_internal`, all node counts from previous depths or failed window searches are lost. The final returned node count only represents the work done in the final iteration.
*Conclusion*: Initialize `nodes = 0` only when instantiating `SearchControl`, and remove the reset from the root search function.

### Logic Chain 1.3 (Repetition History)
Since `make_move` does not push to `repetition_history` but `unmake_move` pops from it, the repetition history will quickly be emptied during search. Once empty, `is_repetition` will always return `false`. This prevents the engine from recognizing repetitions that occur within the search tree.
*Conclusion*: Add a push of the previous board hash to `repetition_history` at the start of `make_move`.

### Logic Chain 1.4 (Heuristics Lifespans)
Killer moves and history scores are key ordering heuristics that gain accuracy as search progresses. By declaring `killers` and `history` local to `search_root_internal`, the engine resets all learned move-ordering information at the start of each search depth.
*Conclusion*: Move `killers` and `history` variables to the outer iterative deepening loop (`search_root_id`) and pass them by reference.

### Logic Chain 1.5 (Threat Delta Pollution)
Since `threat_delta` is a field of `GameState` and is not saved/restored during move backtracking, a child node setting `threat_delta` will pollute the state of parent nodes. Furthermore, since the root node doesn't run NMP, the `threat_delta` returned at the end of the search is just whatever value was set by the last NMP node visited at the bottom of the tree.
*Conclusion*: Save and restore `threat_delta` locally in `search_position`, and run NMP at the root in `search_root_internal` to correctly evaluate the root threat.

### Logic Chain 1.6 (LMR Reduction)
The current formula `log2(legal_moves)` yields reductions of up to 6 plies. At depth 7 or 8, a 6-ply reduction leaves only depth 1, causing the engine to miss immediate tactical lines.
*Conclusion*: Cap the reduction to not exceed `depth / 2` or `depth - 2`.

---

## 3. Caveats

- NNUE serialization dummy buffer loading failure in `tests/Wasm.test.ts` was not investigated because it is a binary parsing verification unrelated to search logic.
- We assume that the UI wrapper sets the initial repetition history before commencing a search, which is why a root push is executed in `VortexCore::search`.

---

## 4. Conclusion & Recommended Fixes

The search engine suffers from several silent bugs that degrade its Elo strength and distort diagnostics (node count, threat delta, repetition detection).

Below are the recommended Rust fixes:

### Fix 1: Mate Score Adjustment
Modify `vortex-core/src/search/mod.rs` inside `search_position`:
```rust
    // In TT Probe:
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
```
And during storage:
```rust
    let mut score_to_store = best_score;
    if score_to_store > MATE_SCORE - 100 {
        score_to_store += ply as i16;
    } else if score_to_store < -MATE_SCORE + 100 {
        score_to_store -= ply as i16;
    }

    tt.store(hash, depth, score_to_store, bound, best_move);
```

### Fix 2: Node Count Reset
Remove `ctrl.nodes = 0;` on line 108 of `vortex-core/src/search/mod.rs`.

### Fix 3: Repetition History Pushes
Update `make_move` in `vortex-core/src/state.rs`:
```rust
    pub fn make_move(&mut self, m: Move) -> UndoInfo {
        self.repetition_history.push(self.hash);
        let from = m.from();
        ...
```

### Fix 4: Persistent Heuristics (Killers & History)
Move `killers` and `history` arrays to `search_root_id` in `vortex-core/src/search/id.rs`:
```rust
pub fn search_root_id(
    state: &mut GameState,
    max_depth: i8,
    _time_limit_ms: u64,
    tt: &mut TranspositionTable,
    ctrl: &mut SearchControl,
) -> SearchStats {
    let mut best_move = Move(0);
    let mut best_score = 0i16;
    let mut prev_score = 0i16;
    let mut volatility = 0.0f32;

    let mut killers = [[Move(0); 2]; MAX_PLY as usize];
    let mut history = [[[0i32; 64]; 64]; 2];

    let mut completed_depth = 0;
    for depth in 1..=max_depth {
        if ctrl.stop || ctrl.time_up() { break; }

        let (alpha, beta) = if depth >= 3 {
            (best_score - 25, best_score + 25)
        } else { (-INFINITY, INFINITY) };

        let result = search_with_windowing(state, depth, alpha, beta, tt, ctrl, &mut killers, &mut history);
```

### Fix 5: Threat Delta Restoration
Wrap `search_position` to preserve and restore `threat_delta`:
```rust
pub fn search_position(
    state: &mut GameState,
    depth: i8,
    alpha: i16,
    beta: i16,
    ply: i8,
    tt: &mut TranspositionTable,
    ctrl: &mut SearchControl,
    killers: &mut [[Move; 2]; MAX_PLY as usize],
    history: &mut [[[i32; 64]; 64]; 2],
) -> i16 {
    let original_threat_delta = state.threat_delta;
    let score = search_position_inner(state, depth, alpha, beta, ply, tt, ctrl, killers, history);
    state.threat_delta = original_threat_delta;
    score
}

fn search_position_inner(...) -> i16 {
    // [Previous content of search_position goes here]
}
```

### Fix 6: Capped LMR Reduction
Update `search_position_inner` reduction limit:
```rust
                let lmr_base = legal_moves.min(64) as f32;
                let reduction = ((lmr_base.ln() / 2.0f32.ln()).round() as i8)
                    .min(depth / 2)
                    .max(1);
                let reduced = (depth - 1 - reduction).max(0);
```

---

## 5. Verification Method

To independently verify these fixes:
1. Compile the Rust crate and run the test suite:
   ```bash
   cargo test --manifest-path vortex-core/Cargo.toml
   ```
2. Re-compile the WASM package and run TypeScript integration tests:
   ```bash
   npm run build:all
   npm test
   ```
3. Test that checkmates are correctly reported and not broken by running cutechess-cli derby matches or by manual UCI calls:
   ```bash
   npm run derby:quick
   ```
4. Verify that repetition history is active and does not drop to 0 by printing the `repetition_history.len()` during search trace.
