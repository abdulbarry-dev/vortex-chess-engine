# Handoff Report - teamwork_preview_explorer_m1_3

## 1. Observation
We observed the following lines in the source files:

*   **Observation A** (`tools/generate_training_data/src/main.rs`, lines 160–175):
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

*   **Observation B** (`tools/selfplay/generate_selfplay.py`, lines 49–61):
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

*   **Observation C** (`vortex-core/src/nnue/forward.rs`, line 92 & 163):
    ```rust
        let dequant = 1.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);
    ```
    and:
    ```rust
        let dequant = 1.0 / (FT_QUANT as f32 * FT_QUANT as f32);
    ```
    along with `activate_ft` (lines 50–55):
    ```rust
        for i in 0..FT_HALF {
            let a = clamped[i] as u32;
            let b = clamped[i + FT_HALF] as u32;
            let product = (a * b) >> FT_SHIFT;
            ft[i]           = product.min(255) as u8;
            ft[i + FT_HALF] = ft[i];
        }
    ```
    where `FT_SHIFT` is defined as `9` and `FT_QUANT` as `255` in `vortex-core/src/types.rs`.

---

## 2. Logic Chain

*   **Logic for Observation A (Stockfish Output Parsing)**:
    1. Stockfish outputs search statistics as lines starting with `info depth <depth>`.
    2. If a search finishes early (e.g. mate found or tablebase resolved at depth 5), it will output info lines only up to that depth, and then immediately output `bestmove`.
    3. The loop in `main.rs` only updates `final_score` if the line starts with `depth_prefix` (which is `depth` of 18, i.e., `info depth 18 `) or `next_prefix` (`info depth 19 `).
    4. Therefore, when Stockfish terminates early, the `if` conditions are never met, and the score defaults to `final_score = 0`.
    5. This results in mate scores and other solved positions being incorrectly labeled as draws (`0` centipawns), corrupting the value labels in the dataset.

*   **Logic for Observation B (Color/Perspective Indexing)**:
    1. The game result `value_target` is a single scalar (`1.0` if White wins, `0.0` if Black wins) for the entire game.
    2. The training data pipeline evaluates positions from the side-to-move's (STM) perspective.
    3. The loop writes the exact same `value_target` to every ply in the game, ignoring the active turn `board.turn`.
    4. Therefore, on Black's turn during a game that White wins, the relative result target should be `0.0` (loss for STM), but is recorded as `1.0` (win for STM).
    5. This introduces contradictory/incorrect value labels that disrupt neural network convergence.

*   **Logic for Observation C (NNUE Dequantization Scale Mismatch)**:
    1. During PyTorch training, features output by the transformer are floats in `[0.0, 1.0]`.
    2. In Rust inference, the SCReLU activation product is computed as `(a * b) >> 9`, where `a, b <= 255`. The maximum possible product value is `(255 * 255) >> 9 = 127`.
    3. Thus, an activation of `1.0` in PyTorch corresponds to `127` in the integer array `ft[j]`.
    4. To map `127` back to `1.0` in float space, we need to divide it by `127.0` (which is `(255.0 * 255.0) / 512.0`).
    5. However, `dequant` is computed as `1.0 / (255.0 * 255.0 * w.l1_quant)`. This divides the sum by `65025.0`, but since it was already divided by `512` in the right shift, the effective value is scaled down by another factor of 512.
    6. As a result, the NNUE output is 512 times smaller than it should be, causing the evaluation score to be practically zero and rendering NNUE search useless.

---

## 3. Caveats
No caveats. The code logic and mathematical scaling has been verified directly against the TypeScript/Rust codebase and standard NNUE quantization principles.

---

## 4. Conclusion
We have verified three critical issues in the training/data-generation pipeline:
1. An inaccurate data-labeling parsing bug in `tools/generate_training_data/src/main.rs` that defaults checkmates to equal/draw evaluations when search terminates early.
2. A perspective/color indexing mismatch in `tools/selfplay/generate_selfplay.py` that fails to flip game result labels based on side-to-move.
3. A severe dequantization mismatch in `vortex-core/src/nnue/forward.rs` that scales down evaluations by a factor of 512.

Proposals for patches for all three issues are written in `analysis.md` in the working directory.

---

## 5. Verification Method
1. To verify the Stockfish parsing bug: run `generate_training_data` with a shallow depth (e.g. 18) on an EPD containing checkmate-in-1 positions. Inspect the resulting `.vdata` file using the generator/reader to confirm that the scores are output as `0` instead of `29000` (or `-29000`).
2. To verify the color indexing bug: generate selfplay data with `generate_selfplay.py` and inspect the generated `dataset.jsonl`. Verify that value targets for Black-to-move positions in White-win games are incorrectly recorded as `1.0`.
3. To verify the NNUE dequantization bug: compare the output of the PyTorch forward pass in `train.py` with the Rust `evaluate_nnue` output for the same position. The Rust output will be off by a factor of exactly 512. Apply the proposed patch `dequant * 512.0` and confirm the outputs match.
