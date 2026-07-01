# Execution Plan — Codebase Analysis

## Mission
Analyze core Rust components (`vortex-core/src/search` and evaluation logic) to find at least 3 distinct, verifiable weak points, provide Rust patches/snippets, verify they don't break the test suite, write `diagnostic_report.md` at the project root, and update beads.

## Steps

### Step 1: Initial Setup and Issue Selection
- Run `bd ready` and `bd prime` to see the available issues and claim the issue.
- Create an issue in `bd` if none exists for the codebase analysis task.
- Claim/Update issue in `bd`.

### Step 2: Codebase Investigation (Search & Eval)
- Spawn `teamwork_preview_explorer` (Explorer 1) to investigate search files (`vortex-core/src/search/mod.rs`, `vortex-core/src/search/aspiration.rs`, `vortex-core/src/search/id.rs`, `vortex-core/src/search/swindle.rs`, `vortex-core/src/search/variance.rs`).
- Spawn `teamwork_preview_explorer` (Explorer 2) to investigate evaluation files (`vortex-core/src/evaluate.rs`, `vortex-core/src/nnue/`, etc.).
- Retrieve Explorer reports identifying hidden bugs, missing features, or performance bottlenecks.

### Step 3: Synthesis and Patch Design
- Synthesize the findings from Explorers into a list of 3+ distinct weak points.
- Draft concrete, syntactically valid Rust patches/snippets for these weak points.

### Step 4: Verification
- Spawn `teamwork_preview_worker` (Worker 1) to:
  1. Apply/verify the proposed patches.
  2. Run `cargo test --manifest-path vortex-core/Cargo.toml` to verify they don't break the existing test suite.
  3. Write the diagnostic report to `/home/vortex/Desktop/Projects/vortex-chess-engine/diagnostic_report.md`.

### Step 5: Wrap-up and Issue Closure
- Close the issue in `bd`.
- Write `handoff.md` and report completion back to Sentinel.
