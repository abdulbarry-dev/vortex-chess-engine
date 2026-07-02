# Vortex Chess Engine - Training Pipeline and Data Generation Analysis

This report presents a deep analysis of the Python training pipeline, data generation tools, and weight serialization/inference mapping in the Vortex Chess Engine. We have identified three critical bugs/weaknesses: two in the `tools/` directory and one in the core Rust engine's NNUE inference that directly causes a scale mismatch with the exported weights.

---

## 1. Stockfish Output Parsing Bug (Inaccurate Data Labeling)

* **File**: `tools/generate_training_data/src/main.rs`
* **Line Region**: Lines 160–175
* **Root Cause**:
  The tool spawns Stockfish to label positions from an EPD file at a specific target depth. It parses the Stockfish output inside a loop to capture the evaluation score:
  ```rust
  let mut final_score: i16 = 0;
  // Capture the last info line at target depth (or deepest seen).
  let depth_prefix = format!("info depth {} ", depth);
  let next_prefix  = format!("info depth {} ", depth + 1);

  loop {
      line.clear();
      sf_reader.read_line(&mut line)?;
      if line.contains("bestmove") { break; }
      if line.starts_with(&depth_prefix) || line.starts_with(&next_prefix) {
          if let Some(s) = parse_score(&line) {
              final_score = s;
          }
      }
  }
  ```
  If Stockfish terminates its search early (e.g., because a mate is found, a tablebase hit is resolved, or there is only one legal move), it does not reach the target `depth`. Consequently, it will not output any lines starting with `depth_prefix` or `next_prefix`. In these cases, the `if` condition is never met, and `final_score` remains at its initial value of `0`. 
  This means checkmates and other resolved positions are incorrectly labeled as equal/draws (`0` centipawns), severely corrupting the quality of the training data.

* **Proposed Patch**:
  Update the parsing logic to capture the score from *any* `info` line. Since Stockfish outputs info lines sequentially with increasing depths, the last valid score parsed before the `bestmove` token will naturally represent the deepest complete search:
  ```rust
  // Proposed change in tools/generate_training_data/src/main.rs (Lines 160-175)
  let mut final_score: i16 = 0;

  loop {
      line.clear();
      sf_reader.read_line(&mut line)?;
      if line.contains("bestmove") { break; }
      if line.starts_with("info ") {
          if let Some(s) = parse_score(&line) {
              final_score = s;
          }
      }
  }
  ```

---

## 2. Color/Perspective Indexing Bug (Selfplay Data Generation)

* **File**: `tools/selfplay/generate_selfplay.py`
* **Line Region**: Lines 49–61
* **Root Cause**:
  In RL selfplay data generation, the game result is mapped to a constant `value_target` (`1.0` for White win, `0.0` for Black win, `0.5` for draw). This target is then appended to every position in the mainline moves:
  ```python
  for move in game.mainline_moves():
      # Policy target is the move played
      uci_move = move.uci()
      fen = board.fen()
      
      # Append to dataset
      dataset.append({
          "fen": fen,
          "policy_target": uci_move,
          "value_target": value_target
      })
      
      board.push(move)
  ```
  Because the training script `train.py` expects relative value targets (where value is evaluated from the perspective of the side-to-move, STM), keeping `value_target` constant across all plies is incorrect. For example, if White wins (`value_target = 1.0`), then Black's turn positions (where STM is Black) are also labeled as `1.0` (a win for Black), when they should be `0.0` (a loss for Black). This injects conflicting signals and completely corrupts value learning.

* **Proposed Patch**:
  Flip the value target dynamically based on the side-to-move (`board.turn`) before appending it to the dataset:
  ```python
  # Proposed change in tools/selfplay/generate_selfplay.py (Lines 49-61)
  for move in game.mainline_moves():
      # Policy target is the move played
      uci_move = move.uci()
      fen = board.fen()
      
      # Flip value target based on the side-to-move
      relative_value = value_target if board.turn == chess.WHITE else (1.0 - value_target)
      
      # Append to dataset
      dataset.append({
          "fen": fen,
          "policy_target": uci_move,
          "value_target": relative_value
      })
      
      board.push(move)
  ```

---

## 3. NNUE Dequantization Scale Mismatch (Inference Bug)

* **File**: `vortex-core/src/nnue/forward.rs`
* **Line Region**: Lines 85–105 and 158–174
* **Root Cause**:
  In PyTorch, the Feature Transformer output activation is computed in float space in the range `[0.0, 1.0]`. 
  In the Rust engine, the SCReLU activation product is computed using integer values clamped to `[0, 255]`, and then shifted right by `9` bits (`FT_SHIFT`):
  ```rust
  let product = (a * b) >> FT_SHIFT; // FT_SHIFT = 9
  ```
  Since `a` and `b` are at most `255`, the maximum value of `product` is `(255 * 255) >> 9 = 127`. Therefore, the integer representation of the activation is in `[0, 127]`.
  When dequantizing the L1 layer inputs back to float space, the code uses `dequant`:
  ```rust
  let dequant = 1.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32); // FT_QUANT = 255
  ```
  This divides the sum by `255 * 255 = 65025`. However, since `ft[j]` was already divided by `512` during the right shift (`>> 9`), this results in double division. The output activation values in float space become `1/512` of their actual PyTorch counterparts (e.g. a max activation of `127` is scaled by `1 / 65025` to `0.00195`, rather than `1.0`).
  This scales the entire evaluation score of the NNUE down by a factor of 512, making the NNUE evaluation practically `0` and breaking the search.

* **Proposed Patch**:
  Scale the dequantization factor by `512.0` (or `2^FT_SHIFT`) to compensate for the integer right-shift:
  ```rust
  // Proposed change in vortex-core/src/nnue/forward.rs (Line 92)
  let dequant = 512.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);
  ```
  And similarly in the policy logits evaluation:
  ```rust
  // Proposed change in vortex-core/src/nnue/forward.rs (Line 163)
  let dequant = 512.0 / (FT_QUANT as f32 * FT_QUANT as f32);
  ```
