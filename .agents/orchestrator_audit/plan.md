# Audit Plan — Vortex Chess Engine

## Objective
Orchestrate a comprehensive audit of the Vortex Chess Engine's NNUE architecture, search evaluation mechanisms, and reinforcement learning pipeline, aligning with its defensive philosophy, and output a detailed report in `audit_report.md` in the project root.

## Milestones & Decomposition

### Milestone 1: Exploration & Diagnostics
- **Target**: Run parallel analysis on the three main areas to identify specific bugs, bottlenecks, and structural alignment issues.
- **Decomposition**:
  - **Explorer 1 (NNUE)**: Audits `vortex-core/src/nnue/` (accumulator, forward pass, weights, dequantization, threat map, thread contention, and serialize/deserialize).
  - **Explorer 2 (Search & Eval)**: Audits `vortex-core/src/search/` and `vortex-core/src/evaluate.rs` (Transposition Table root bounds, quiescence quiet filtering, root TT move ordering, pawn tension sign reversal, king safety scaling, swindle complexity, and alignment with `docs/research/`).
  - **Explorer 3 (RL Pipeline)**: Audits `tools/` (selfplay generation, Stockfish parsing, value target perspective, and parallel labeling).

### Milestone 2: Report Generation
- **Target**: Aggregate explorer findings and write `audit_report.md` to the project root.
- **Worker**: Synthesizes and writes the report. Conforms to the 3-section structure with concrete bottlenecks and recommendations for each, strictly integrating the defensive grandmaster/prophylaxis principles.

### Milestone 3: Verification & Closure
- **Target**: Review `audit_report.md`, verify tests pass, and execute Beads/Git session close procedures.

## Verification Steps
1. Verify `audit_report.md` exists and contains:
   - Section 1: NNUE Architecture (identifying dequantization, threat map, and static weights RwLock contention bottlenecks).
   - Section 2: Search Evaluation (identifying root TT bounds, quiescence quiet move sorting, root move ordering, HCE pawn tension sign reversal, and king safety scaling).
   - Section 3: RL Pipeline (identifying Stockfish output parser and selfplay perspective flip).
   - Recommendations for each.
   - Alignment with defensive philosophy (prophylaxis, fortress scale, Grandmaster play).
2. Run `npm test` and `cargo test` (via subagent) to verify the codebase builds and runs cleanly.
3. Close the beads issue `vortex-chess-engine-coc`.
4. Git add, commit, and push changes to remote.
