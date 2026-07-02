# Project: VORTEX-2.0 Analysis and Repair

## Architecture
- **Rust core engine (`vortex-core`)**: Implements bitboard chess board representation, move generation, transposition table, evaluation (neural net NNUE and handcrafted features), and search (iterative deepening, alpha-beta search, aspiration windows, swindling, variance).
- **Python training pipeline (`tools/`)**: Includes tools for selfplay data generation, parallel labeling, training models, and exporting weights for the NNUE.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Explore Codebase | Deep analysis of search, nnue, and python tools to find 3 distinct weak points. | None | DONE |
| 2 | Document & Issue | Produce draft of weak points, write beads tasks, and set up for fix. | M1 | DONE (vww, 7pn, 3q4, 2d9, i6c) |
| 3 | Patch/Repair | Implement fixes for the weak points using Worker agent. | M2 | IN_PROGRESS |
| 4 | Verification | Run cargo test / npm test and verify using Reviewer/Challenger/Auditor. | M3 | PLANNED |
| 5 | Report & Close | Finalize diagnostic_report.md and close tasks in beads. | M4 | PLANNED |

## Interface Contracts
- Rust search interface conforms to the UCI protocol (via `src/core/UciHandler.ts` and `vortex-core` bindings).
- Rust NNUE expects exported weight files in a specific binary format compatible with Python-trained weights.
- Selfplay data generation must output standard PGN / FEN data formats for labeling and training.

## Code Layout
- `vortex-core/src/`: Core engine source code (Rust).
  - `search/`: Search modules (`mod.rs`, `id.rs`, `aspiration.rs`, `swindle.rs`, `variance.rs`).
  - `nnue/`: NNUE evaluation modules (`network.rs`, `features.rs`, `accumulator.rs`, etc.).
- `tools/`: Training tools (Python / Rust).
  - `train/`: NNUE training and exporting scripts (`train.py`, `export.py`, `parallel_label.py`).
  - `selfplay/`: Selfplay data generation (`generate_selfplay.py`).
  - `generate_training_data/`: Rust tool for dataset creation.
