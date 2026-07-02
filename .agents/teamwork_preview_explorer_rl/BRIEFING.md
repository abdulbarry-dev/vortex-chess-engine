# BRIEFING — 2026-07-02T08:40:45Z

## Mission
Conduct a deep read-only audit of the reinforcement learning and selfplay training pipeline in tools/, focusing on the Stockfish output parser and selfplay value targets perspective flip.

## 🔒 My Identity
- Archetype: explorer_rl
- Roles: Read-only Investigator
- Working directory: /home/vortex/Desktop/Projects/vortex-chess-engine/.agents/teamwork_preview_explorer_rl
- Original parent: 360f6f16-2b42-4478-8e81-fee6fdcf6c6d
- Milestone: RL pipeline audit

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Audit Stockfish output parser
- Audit selfplay value targets perspective flip in generate_selfplay.py

## Current Parent
- Conversation ID: 360f6f16-2b42-4478-8e81-fee6fdcf6c6d
- Updated: 2026-07-02T08:44:30Z

## Investigation State
- **Explored paths**:
  - `tools/generate_training_data/src/main.rs`
  - `tools/train/parallel_label.py`
  - `tools/train/run_training.sh`
  - `tools/train/train.py`
  - `tools/train/export.py`
  - `tools/train/pgn_to_fen.py`
  - `tools/selfplay/generate_selfplay.py`
  - `vortex-core/src/types.rs`
  - `vortex-core/src/nnue/weights.rs`
  - `vortex-core/src/nnue/serialize.rs`
  - `vortex-core/src/nnue/forward.rs`
  - `vortex-core/src/search/mod.rs`
- **Key findings**:
  - Stockfish output parser in older commit `626a62c` only parsed evaluation at exact hardcoded depths 18/19, losing early search cutoffs (e.g. checkmate or TT hits), resulting in draw defaults (`0i16`).
  - Current generator binary in HEAD takes 2 arguments, but pipeline scripts call it with 4-5 arguments, causing input EPD truncation/destruction.
  - `generate_selfplay.py` has dead code for `relative_value` perspective flip, but `train.py` dynamically applies the flip via `stm`, making it functionally correct.
  - Policy labels are not generated or parsed, causing the Policy Head to remain entirely untrained (random noise), which negatively impacts move ordering in alpha-beta search.
- **Unexplored areas**: None

## Key Decisions Made
- Completed read-only audit of both focus areas.

## Artifact Index
- /home/vortex/Desktop/Projects/vortex-chess-engine/.agents/teamwork_preview_explorer_rl/handoff.md — Final handoff report containing the audit findings.
