# Changes Made

This document details the modifications applied to the Vortex Chess Engine's Python training pipeline and data generation tools in the `tools/` directory.

## 1. Stockfish Output Parsing in Data Labeling
- **File**: `tools/generate_training_data/src/main.rs`
- **Details**: 
  - Modified the Stockfish output parsing loop (around lines 160–175).
  - Changed the loop to capture the score from *any* line starting with `"info "` rather than limiting it to lines matching `depth_prefix` or `next_prefix`.
  - Removed the unused variables `depth_prefix` and `next_prefix` to prevent compiler warnings.

## 2. Color/Perspective Indexing in Selfplay Generation
- **File**: `tools/selfplay/generate_selfplay.py`
- **Details**:
  - Modified the mainline moves loop (around lines 49–61).
  - Dynamically flip the value target based on the active turn side-to-move (`board.turn`).
  - Added the calculation: `relative_value = value_target if board.turn == chess.WHITE else (1.0 - value_target)`.
  - Appended `relative_value` to the dataset entries instead of the static/unflipped `value_target`.
