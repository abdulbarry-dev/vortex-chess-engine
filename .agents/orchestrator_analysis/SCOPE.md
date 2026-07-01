# Scope: Codebase Analysis of Core Rust Components

## Architecture
- Module/package boundaries, data flow, shared interfaces
  - `vortex-core/src/search/`: includes search algorithms (ID, aspiration, alpha-beta, mod.rs)
  - `vortex-core/src/evaluate.rs`: evaluation function
  - `vortex-core/src/nnue/`: NNUE evaluation network

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Explore Search & Eval | Identify weak points, bugs, bottlenecks | None | DONE |
| 2 | Design & Verify Patches | Create Rust patches, run tests to verify | M1 | DONE |
| 3 | Report & Handoff | Write diagnostic_report.md and handoff | M2 | DONE |
