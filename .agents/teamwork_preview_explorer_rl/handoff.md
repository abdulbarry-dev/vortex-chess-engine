# Handoff Report — Reinforcement Learning & Selfplay Audit

## 1. Observation

### A. Stockfish Output Parser & Data Labeling Pipeline
In commit `626a62cda6321d71de5e6586f605e89b195e6beb` of `tools/generate_training_data/src/main.rs`, the Stockfish engine was driven via UCI stdin/stdout at depth 18. The loop to capture search evaluation scores was:
```rust
        writeln!(sf_stdin, "position fen {}", fen)?;
        writeln!(sf_stdin, "go depth 18")?;
        
        let mut final_score = 0i16;
        
        loop {
            line.clear();
            sf_reader.read_line(&mut line)?;
            if line.contains("bestmove") {
                break;
            }
            if line.contains("info depth 18 ") || line.contains("info depth 19 ") {
                if let Some(caps) = score_re.captures(&line) {
                    final_score = caps.get(1).unwrap().as_str().parse().unwrap_or(0);
                } else if let Some(caps) = mate_re.captures(&line) {
                    let mate_in = caps.get(1).unwrap().as_str().parse::<i16>().unwrap_or(0);
                    if mate_in > 0 {
                        final_score = 30000 - mate_in;
                    } else {
                        final_score = -30000 - mate_in;
                    }
                }
            }
        }
```

In the latest commit `7f2e6fd61566b19f971e9822729490347dc63e8f`, the Stockfish invocation and search parsing code was entirely removed. The generator program now acts as a text parser that maps FEN outcomes directly to the `.vdata` version 2 binary record format:
```rust
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: {} <input.epd> <output.vdata>", args[0]);
        std::process::exit(1);
    }

    let input_path = &args[1];
    let output_path = &args[2];
```

However, pipeline orchestration scripts have not been updated:
- In `tools/train/run_training.sh` (line 173):
  ```bash
  "$GEN_BIN" "$SF_BIN" "$EPD_FILE" "$VDATA_FILE" "$SF_DEPTH"
  ```
- In `tools/train/parallel_label.py` (lines 46-49):
  ```python
  def run_generator(sf_bin: str, gen_bin: str, epd: str, vdata: str, depth: int, job_id: int,
                    progress: dict, lock: threading.Lock):
      """Run a single generate_training_data process and track progress."""
      cmd = [gen_bin, sf_bin, epd, vdata, str(depth)]
  ```

### B. Selfplay Value Targets Perspective Flip & Policy Targets
In `tools/selfplay/generate_selfplay.py` (lines 39-60), the game parsing and relative value target computation is:
```python
            result = game.headers["Result"]
            if result == "1-0":
                value_target = 1.0
            elif result == "0-1":
                value_target = 0.0
            else:
                value_target = 0.5
                
            board = game.board()
            
            for move in game.mainline_moves():
                # Policy target is the move played
                uci_move = move.uci()
                fen = board.fen()
                
                relative_value = value_target if board.turn == chess.WHITE else (1.0 - value_target)
                
                # Append to EPD dataset
                dataset.append(f'{fen} c9 "{result}"')
                
                board.push(move)
```

In `tools/train/train.py` (lines 133-140), the result perspective flip is handled dynamically during training:
```python
        # Result from STM perspective
        if result == 0:
            result_stm = 0.5
        elif result == 1:
            result_stm = 1.0 if stm == 0 else 0.0
        else:
            result_stm = 0.0 if stm == 0 else 1.0
```

Additionally, in `tools/train/train.py` (line 373), `target_policy` is filled with a dummy vector of `-1`:
```python
        "target_policy": torch.full((batch["stm"].shape[0],), -1, dtype=torch.long, device=device) # Dummy policy for now
```

In `vortex-core/src/search/mod.rs` (lines 98-101), the move ordering calls the policy head evaluator:
```rust
    // Neural Network Policy Head: Prior distribution for move ordering
    let policy_logit = crate::nnue::evaluate_policy_move(state, &state.nnue, m.to_policy_index());
    let policy_bonus = (policy_logit * 5000.0) as i32; // Scale logit to act as a strong history bias
    base_score += policy_bonus;
```

---

## 2. Logic Chain

1. **Stockfish Search Early Cutoff Bug**:
   - The loop in `626a62c`'s `main.rs` only matched stdout lines containing `"info depth 18 "` or `"info depth 19 "` to extract the evaluation score.
   - If Stockfish terminated search early (e.g., due to checkmate found at a lower depth, a transposition table hit resolving the search instantly, or tablebase adjudication), it would emit `bestmove` without printing the expected `info depth 18/19` lines.
   - As a result, the `final_score` variable would remain at its initial value (`0i16`), incorrectly writing a draw evaluation to the `.vdata` file for clearly won/lost positions.

2. **Pipeline Argument Alignment & Data Truncation Bug**:
   - In HEAD (`7f2e6fd`), `generate_training_data` was rewritten to only take 2 positional arguments: `args[1]` (input EPD) and `args[2]` (output `.vdata`).
   - The shell script `run_training.sh` and python script `parallel_label.py` still invoke it with 5 arguments, passing the Stockfish path `"$SF_BIN"` as `args[1]` and the input EPD path `"$EPD_FILE"` as `args[2]`.
   - Consequently, `generate_training_data` treats the Stockfish binary as a text EPD file and the input EPD as the output `.vdata` path.
   - This causes it to truncate the input EPD file to 0 bytes and write a binary VDAT header into it, and then fail/exit when reading the Stockfish binary because it hits invalid UTF-8 bytes. This completely destroys the training dataset.

3. **Value Target Perspective Flip Analysis**:
   - In `generate_selfplay.py`, the variable `relative_value` (which calculates the side-to-move perspective flip) is assigned but never used, nor written to the EPD. The script simply writes the absolute game result string (`"1-0"`, `"0-1"`, `"1/2-1/2"`) inside `c9` quotes.
   - However, this is not a correctness bug because the training loader in `train.py` dynamically handles the perspective flip of the absolute result value by checking the side-to-move (`stm` = 0 for White, 1 for Black) and assigning `result_stm` accordingly.

4. **Untrained Policy Head and Search Ordering Impact**:
   - The policy target move `uci_move` calculated in `generate_selfplay.py` is never exported to the EPD.
   - During training, the policy targets are hardcoded to dummy values of `-1`, which causes `combined_loss` to completely bypass the policy loss term.
   - Thus, the Policy Head is never trained and retains its random kaiming-uniform initialization weights.
   - During engine search in `vortex-core/src/search/mod.rs`, an untrained policy head adds a large, random `policy_bonus` (up to $\pm 5000$) to move ordering scores, which severely degrades search efficiency and move prioritization.

---

## 3. Caveats

- We assumed that cutechess-cli runs without issues and correctly outputs standard PGN files.
- We did not audit the actual training performance of PyTorch or the convergence rates of the value loss on large datasets.
- The policy encoding scheme mapping chess moves to policy indices (e.g. `to_policy_index()` returning a value < 1858) was not checked for indexing bugs.

---

## 4. Conclusion

The audit identified three major issues in the reinforcement learning and selfplay training pipeline:
1. **Critical Pipeline Bug**: The argument mismatch between `generate_training_data` and the orchestrators (`run_training.sh` and `parallel_label.py`) truncates and corrupts the input EPD dataset when run.
2. **Untrained Policy Head / Search Move Ordering Degradation**: Because policy target move data is never generated or parsed, the Policy Head remains untrained. Running alpha-beta search with a random policy head degrades search efficiency due to noise-based move ordering bonuses.
3. **Stale Stockfish Parser**: In older versions, evaluations for early cutoffs were not captured by the parser, defaulting to `0` (draw). Although the Stockfish parser was removed in the latest commit, the pipeline orchestration scripts were not updated to reflect this change.

---

## 5. Verification Method

### A. Verify Argument Alignment & Truncation
1. Create a dummy EPD file with 1 valid FEN line.
2. Run the generator with 5 arguments (simulating the script behavior):
   `cargo run --manifest-path tools/generate_training_data/Cargo.toml --release -- /bin/ls dummy.epd dummy.vdata 16`
3. Inspect `dummy.epd`. It will be truncated to 9 bytes containing `"VDAT\x02\x00\x00\x00\x00"` and the command will exit with a UTF-8 read error.

### B. Verify Untrained Policy Head and Move Ordering
1. Build the engine and load a compiled `.vortex` NNUE file.
2. Probe evaluations in search using `evaluate_policy_move` and verify that the outputs are uniform/random weights.
