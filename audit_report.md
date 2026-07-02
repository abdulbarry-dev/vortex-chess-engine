# Vortex Chess Engine — Comprehensive System Audit Report

## 1. Executive Summary

This report presents a comprehensive, deep architectural and code-level audit of the Vortex Chess Engine. The evaluation focuses on the engine's core components: Hand-Crafted Evaluation (HCE) defensive tuning, Efficiently Updatable Neural Network (NNUE) evaluation and forward inference, search logic, and the Reinforcement Learning (RL) selfplay training pipeline.

### Overarching Assessment

1. **Defensive Tuning & Philosophy**: Vortex demonstrates a unique, mathematically sound defensive approach. Features like **Fortress Scaling** (scaling down evaluations in opposite-colored bishop endgames to pull the engine toward draws when behind) and **Tablebase Magnetism/Piece Count Gravity** (dynamically incentivizing piece trades when losing to cross the 7-piece Syzygy tablebase threshold) are well-aligned with its defensive research guidelines. However, several critical flaws in the hand-crafted evaluation (HCE) severely undermine this philosophy, including a total sign reversal in pawn tension evaluation and a one-sided blockade evaluation.
2. **NNUE Architecture**: The NNUE inference engine is mathematically consistent with its PyTorch training configuration, specifically utilizing a `512.0` numerator in its dequantization factor to offset the right-shift operation of the SCReLU activation. However, there is a **critical state leakage and synchronization bug** in the incremental threat accumulator update inside `make_move` (`state.rs`). Because both the moving piece and the captured piece are removed from the board representation before threat updates are processed, mutual threats between these two pieces are missed during subtraction, leading to a permanent accumulator drift. Furthermore, accessing the network weights via `std::sync::RwLock` causes substantial atomic contention under parallel Lazy SMP search.
3. **Search & Move Ordering**: Search root TT bounds storage, quiescence quiet filtering, and move ordering function correctly in isolation. However, the search engine suffers from a massive performance degradation due to the **Untrained Policy Head**. Because policy targets are omitted from the selfplay datasets and trained with dummy values, the policy head outputs random logits. These random outputs add noise-based bonuses of up to $\pm 5000$ to quiet moves, completely drowning out history-based and tactical ordering heuristics, and severely degrading alpha-beta search efficiency.
4. **Selfplay & Training Pipeline**: The RL pipeline contains a **catastrophic argument mismatch** between the data labeling orchestrators (`run_training.sh` and `parallel_label.py`) and the rewritten binary (`generate_training_data`). Invoking the generator with 5 arguments instead of 2 causes it to treat the Stockfish path as the input EPD and the input EPD path as the output binary file, instantly truncating the entire training EPD dataset to 0 bytes and writing a binary header in its place.

---

## 2. NNUE Architecture Audit

### 2.1. The Dequantization Multiplier Math

In the NNUE L1 layer evaluation (`vortex-core/src/nnue/forward.rs`), the dequantization multiplier is calculated as:
$$\text{dequant} = \frac{512.0}{\text{FT\_QUANT} \times \text{FT\_QUANT} \times \text{w.l1\_quant}}$$
Using the constants defined in `vortex-core/src/types.rs`:
- $\text{FT\_QUANT} = 255$
- $\text{L1\_QUANT} = 64$
- $\text{FT\_SHIFT} = 9$ (equivalent to division/right-shift by $512$)

#### Alignment with PyTorch
During PyTorch training, features are normalized to $[0, 1.0]$. The activation function used is Squared Clipped ReLU (SCReLU), defined as:
$$f(x) = \text{clamp}(x, 0, 1)^2$$
For friendly feature $x$ and opponent feature $y$, the joint activation is:
$$a(x, y) = x \times y$$
In the quantized Rust implementation, the accumulator accumulates integer features scaled by $\text{FT\_QUANT} = 255$. Let $X = x \times 255$ and $Y = y \times 255$ represent the quantized inputs. Their product is:
$$P = X \times Y = (x \times y) \times 255^2$$
To fit this activation product into a `u8` range $[0, 255]$, the engine right-shifts by $\text{FT\_SHIFT} = 9$ (dividing by $512$):
$$A_{\text{quant}} = P \gg 9 \approx \frac{(x \times y) \times 255^2}{512}$$
The L1 weights are quantized by $\text{L1\_QUANT} = 64$, meaning $W_{\text{quant}} = W_{\text{float}} \times 64$.
The L1 dot product accumulated in integers is:
$$\text{Sum} = \sum A_{\text{quant}} \times W_{\text{quant}} \approx \sum \left( (x \times y) \times \frac{255^2}{512} \right) \times (W_{\text{float}} \times 64)$$
$$\text{Sum} \approx \left( \sum x \times y \times W_{\text{float}} \right) \times \frac{255^2 \times 64}{512}$$
To recover the unquantized floating-point value, we must multiply the integer sum by the dequantization factor:
$$\text{dequant} = \frac{512}{255^2 \times 64} = \frac{512.0}{\text{FT\_QUANT}^2 \times \text{L1\_QUANT}}$$
This matches the Rust implementation. Without the `512.0` numerator, the evaluation output would be scaled down by a factor of 512, reducing typical evaluations of several centipawns to virtually zero, destroying the engine's positional awareness.

---

### 2.2. Threat Accumulator Updates & State Leakage Bug

#### Indexing and Perspective Symmetry
The threat accumulator mapping is defined in `ThreatMap` and uses an empty-board approximation where sliding attacks (bishops, rooks, queens) are computed using an empty occupancy mask (`all_pieces = 0`). This ensures the index mapping:
$$\text{index} = \text{get\_index}(\text{attacker}, \text{from\_sq}, \text{victim}, \text{to\_sq})$$
is static and independent of other pieces. Perspective symmetry is maintained across the PyTorch training bridge (`features.rs`) and the Rust search engine (`apply_threat_deltas`) by vertically flipping the squares for the Black perspective (`sq ^ 56`).

#### The Critical State Leakage Bug in `make_move`
In `vortex-core/src/state.rs`, the `make_move` function processes moves in the following order:
1. If the move is a capture, it queries the board, identifies the captured piece, and removes it from the board:
   ```rust
   self.board.remove_piece(them, pt, capture_sq);
   ```
2. The moving piece is removed from its original square `from`:
   ```rust
   self.board.remove_piece(us, moving_piece, from);
   ```
3. Incremental NNUE updates are executed:
   ```rust
   self.nnue.update_pst(&self.board, moving_piece, us, from, to);
   if let Some((color, pt)) = captured_piece {
       self.nnue.remove_pst(&self.board, pt, color, capture_sq);
       self.nnue.push_threats_on_change(&self.board, color, pt, capture_sq, false); // Subtraction
   }
   self.nnue.update_threats(&self.board, moving_piece, us, from, to); // Subtraction at from, Addition at to
   ```

#### The Mechanism of Failure
When `push_threats_on_change` is called to remove threats (`add = false`), the board state is queried to find the attacker/victim relationships:
* `push_threats_on_change` for the captured piece at `capture_sq` queries the board occupancies to identify which enemy pieces were attacked by it, or which enemy pieces were attacking it.
* However, because the moving piece has already been removed from the board at step 2, any mutual threats between the moving piece (which was at `from`) and the captured piece (which was at `capture_sq`) are **invisible** on the board.
* Consequently, the subtraction pass (`add = false`) fails to find the mutual threats between the moving piece and the captured piece.
* As the search progresses, these un-subtracted threats remain permanently stranded in the threat accumulator. This leads to a cumulative state drift (leakage) between the incremental accumulator and the actual board state, eventually corrupting the NNUE evaluations.

---

### 2.3. RwLock Thread Contention on Static WEIGHTS

The neural network weights are stored as a global static resource:
```rust
pub static WEIGHTS: std::sync::RwLock<VortexWeights> = std::sync::RwLock::new(VortexWeights::new());
```
During parallel search (Lazy SMP), search threads concurrently evaluate positions millions of times per second. Every single evaluation or incremental update calls:
```rust
let w = WEIGHTS.read().unwrap_or_else(|e| e.into_inner());
```
Although `RwLock` allows concurrent readers, the implementation of `std::sync::RwLock` requires executing atomic operations to track the reader count. When multiple CPU cores execute atomic operations on the same reader count field concurrently, they must constantly invalidate each other's cache lines (cache line bouncing). This results in severe memory bus contention, processor stalls, and a significant drop in multi-core scaling efficiency.

---

## 3. Search and Evaluation Audit

### 3.1. Root Transposition Table (TT) Bounds Storage
At the root of the search (`search_root_internal` in `mod.rs`), the search outcome is saved to the TT as follows:
```rust
let bound = if best_score <= original_alpha { TT_ALPHA }
           else if best_score >= beta { TT_BETA }
           else { TT_EXACT };
tt.store(state.hash, depth, score_to_store, bound, best_move);
```
During iterative deepening, search windows (alpha/beta bounds) are narrowed via aspiration search (`aspiration.rs`). If a search iteration fails high or low, storing bounds (`TT_ALPHA` or `TT_BETA`) at the root key is theoretically correct. Since `search_root_internal` does not prune based on TT probe score (it only probes to retrieve the `tt_move` for ordering), storing bounds does not cause premature root cut-offs.

---

### 3.2. Quiescence Search Quiet Move Filtering
In `quiescence_search` (`mod.rs`), moves are filtered immediately after generation:
```rust
let mut raw_move_list = generate_pseudo_legal_moves(&state.board, state.side_to_move, state.castling_rights, state.en_passant_sq);
let mut move_list = crate::movegen::MoveList { moves: [Move(0); 256], count: 0 };
for i in 0..raw_move_list.count {
    let m = raw_move_list.moves[i];
    if m.is_capture() || m.is_promotion() {
        move_list.moves[move_list.count] = m;
        move_list.count += 1;
    }
}
```
Only the filtered `move_list` is passed to `score_move` and sorted. This confirms that quiet (non-capture and non-promotion) moves are completely excluded from scoring and sorting. This is the correct design, ensuring the quiescence search only evaluates tactical changes and avoids exponential tree expansion.

---

### 3.3. Root TT Move Ordering Logic
At the start of the root search, the TT is probed for the best move:
```rust
let mut tt_move = Move(0);
if let Some(entry) = tt.probe(state.hash) {
    tt_move = Move(entry.best_move);
}
```
In `score_move`, if the move matches `tt_move`, it receives a maximum score:
```rust
if m == tt_move { return 10_000_000; }
```
The root loop then sorts candidate moves in descending order of their scores. This guarantees that the best move from the previous search depth is evaluated first, maximizing alpha-beta cut-off efficiency. The implementation is correct and complete.

---

### 3.4. Pawn Tension Sign Reversal Bug
In `evaluate_pawn_tension` (`evaluate.rs`), the engine evaluates the pressure exerted by pawns. By convention, positive values favor White, and negative values favor Black. The evaluation is calculated as follows:
```rust
// White pawn attacks intersecting Black pawns
score -= (count_bits(w_attacks_left & black_pawns) as i16) * 10;
score -= (count_bits(w_attacks_right & black_pawns) as i16) * 10;

// Black pawn attacks intersecting White pawns
score += (count_bits(b_attacks_left & white_pawns) as i16) * 10;
score += (count_bits(b_attacks_right & white_pawns) as i16) * 10;
```
* **The Bug**: White attacks on Black pawns represent White applying pressure to Black, which should increase the score (favor White). Instead, the code subtracts from the score (`score -=`). Conversely, Black attacks on White pawns represent Black applying pressure to White, which should decrease the score (favor Black). Instead, the code adds to the score (`score +=`).
* **Impact**: This is a total sign reversal. The engine actively penalizes itself for applying pressure and rewards itself for being attacked, leading to highly passive and strategically flawed pawn play under Hand-Crafted Evaluation.

---

### 3.5. King Safety Raw Score Scaling Mathematical Anomaly
In `evaluate.rs`, king safety scores (`w_safety` and `b_safety`) are calculated and combined:
```rust
if w_safety < b_safety {
    score += (w_safety as f32 * 1.4) as i16 - b_safety;
} else if b_safety < w_safety {
    score += w_safety - (b_safety as f32 * 1.4) as i16;
}
```
* **The Anomaly**: The safety score consists of positive bonuses (pawn shields) and negative penalties (open files). Because the scaling factor of `1.4` is applied directly to the raw safety score rather than the difference, the behavior depends on the sign of the individual score:
  - If White safety is `10` and Black safety is `20` (White king is less safe), the scaled difference is $(10 \times 1.4) - 20 = -6$. The unscaled difference is $10 - 20 = -10$. White's penalty is *reduced* from $-10$ to $-6$ (a relative bonus).
  - If White safety is $-20$ and Black safety is $-10$ (White king is less safe), the scaled difference is $(-20 \times 1.4) - (-10) = -18$. The unscaled difference is $-20 - (-10) = -10$. White's penalty is *increased* from $-10$ to $-18$.
* **Impact**: Direct raw scaling creates inconsistent penalties. A side with a weak king shield (positive score) gets penalized less when its shield is degraded, whereas a side with open files (negative score) gets penalized more.

---

### 3.6. Swindle Complexity Tension Mask Asymmetry
In `complexity_bonus` (`search/swindle.rs`), the pawn tension mask is calculated from the side to move:
```rust
let us_pawns = state.board.get_pieces(state.side_to_move, PieceType::Pawn);
let them_pawns = state.board.get_pieces(state.side_to_move.opposite(), PieceType::Pawn);
// ... compute attacks for us_pawns ...
let tension_mask = (left_attacks | right_attacks) & them_pawns;
```
* **The Bug**: This tension mask only measures the attacks of the side-to-move's pawns targeting the opponent's pawns. It completely ignores the attacks of the opponent's pawns targeting the side-to-move's pawns.
* **Impact**: Pawn tension is inherently mutual. By calculating it asymmetrically based on `side_to_move`, the complexity metric fluctuates depending on whose turn it is, rather than representing the static tactical complexity of the position.

---

### 3.7. Alignment of HCE with Defensive Philosophy
Comparing the Hand-Crafted Evaluation (HCE) implementation to the research papers in `docs/research/`:

1. **Fortress Scaling**: Fully aligned. In opposite-colored bishop endgames, the score is scaled toward draw territory using `fortress_scale`, directly implementing the concepts in `fortress-recognition.md`.
2. **Tablebase Magnetism**: Fully aligned. `tablebase_magnetism` scales evaluations toward zero as pieces simplify and adds a flat `+50cp` bonus for crossing below the 7-piece threshold, matching the Piece Count Gravity strategy in `tablebase-magnetism.md`.
3. **Blockade Evaluation Asymmetry Bug**: The implementation of `evaluate_blockade` contains an asymmetry:
   ```rust
   score += (locked_files as i16) * 20;
   if locked_files >= 3 {
       score += 40; // Bonus for White blockading Black
   }
   ```
   If `locked_files <= -3` (Black is blockading White), there is no corresponding check to subtract 40 points, penalizing Black's successful blockades.
4. **Lack of Prophylaxis**: The HCE lacks any implementation of Aron Nimzowitsch's overprotection principles or opponent mobility restriction prophylaxis, both of which are strongly advocated in `defensive-philosophy.md`.

---

## 4. Reinforcement Learning & Selfplay Pipeline Audit

### 4.1. Stockfish Search Early Cutoff Bug (Older Commit)
In commit `626a62c` of `generate_training_data`, the Stockfish stdout parser loop expected `"info depth 18 "` or `"info depth 19 "` lines to capture the search evaluation. If Stockfish terminated its search early (due to a transposition table hit, immediate mate detection, or tablebase adjudication), it would emit `bestmove` without printing the expected depth information. As a result, the parser exited the loop with `final_score` at its default value of `0i16`. This mistakenly labeled clearly won/lost positions as draws ($0.00$ centipawns), corrupting the value targets.

---

### 4.2. Pipeline Argument Mismatch & Dataset Truncation Bug
In the latest commit `7f2e6fd` of `tools/generate_training_data/src/main.rs`, the program was simplified to accept exactly two positional arguments:
```rust
let args: Vec<String> = std::env::args().collect();
if args.len() < 3 {
    eprintln!("Usage: {} <input.epd> <output.vdata>", args[0]);
    std::process::exit(1);
}
let input_path = &args[1];
let output_path = &args[2];
```
However, the orchestrating scripts were not updated:
* `tools/train/run_training.sh` (line 173):
  ```bash
  "$GEN_BIN" "$SF_BIN" "$EPD_FILE" "$VDATA_FILE" "$SF_DEPTH"
  ```
* `tools/train/parallel_label.py` (line 49):
  ```python
  cmd = [gen_bin, sf_bin, epd, vdata, str(depth)]
  ```

#### The Impact
Because the generator binary expects only 2 arguments, it maps:
- `args[1]` (which is `sf_bin`, the Stockfish binary path) $\rightarrow$ `input_path`
- `args[2]` (which is `epd`, the input EPD dataset path) $\rightarrow$ `output_path`

Upon execution, the generator:
1. Opens `sf_bin` (the Stockfish executable) for reading.
2. Creates `output_path` (the input EPD dataset) for writing, which **instantly truncates the input EPD file to 0 bytes**.
3. Writes the binary header (`"VDAT\x02\x00\x00\x00\x00"`) into the EPD file.
4. Attempts to parse the binary Stockfish executable as FEN strings, encounters invalid UTF-8 bytes or parsing failures, and crashes.
This completely destroys the training dataset.

---

### 4.3. Selfplay Value Target Perspective Flip Handling
In `generate_selfplay.py`, the variable `relative_value` (which implements the side-to-move perspective flip) is computed but never written to the EPD:
```python
relative_value = value_target if board.turn == chess.WHITE else (1.0 - value_target)
dataset.append(f'{fen} c9 "{result}"') # Writes absolute result, relative_value is unused
```
Although this is dead code in the selfplay generation script, it is **not** a functional correctness bug. The PyTorch training loader in `train.py` dynamically handles the perspective flip of the absolute result string during data loading:
```python
if result == 0:
    result_stm = 0.5
elif result == 1:
    result_stm = 1.0 if stm == 0 else 0.0
else:
    result_stm = 0.0 if stm == 0 else 1.0
```
This dynamic mapping ensures that the model is trained on correct side-to-move value targets.

---

### 4.4. Untrained Policy Head & Search Move Ordering Degradation
In `generate_selfplay.py`, the target move `uci_move` is never written to the EPD dataset. In `train.py` (line 373), the policy target tensor is filled with dummy values:
```python
"target_policy": torch.full((batch["stm"].shape[0],), -1, dtype=torch.long, device=device)
```
In `combined_loss` (`train.py`), when the policy targets are `-1`, the policy head loss is completely bypassed. Consequently, the Policy Head is never trained and retains its random initialization weights.

During the search in `vortex-core/src/search/mod.rs`, the engine queries the policy head to obtain a prior probability for move ordering:
```rust
let policy_logit = crate::nnue::evaluate_policy_move(state, &state.nnue, m.to_policy_index());
let policy_bonus = (policy_logit * 5000.0) as i32;
base_score += policy_bonus;
```
Because the policy head is untrained, it outputs random logits. Multiplying these by `5000.0` adds a random bonus of up to $\pm 5000$ points to quiet moves. This completely drowns out history-based and tactical move ordering heuristics, causing the engine to search moves in an essentially random order, which drastically degrades search efficiency and increases node counts.

---

## 5. Actionable Recommendations & Code Patches

### 5.1. Swap Capture Update Order in `make_move`
To resolve the threat accumulator state leakage bug, the threat updates should be processed **before** the pieces are removed from the board, utilizing the original board state.

#### Patch for `vortex-core/src/state.rs`
```rust
<<<<
        self.hash ^= z.piece_keys[us as usize][moving_piece as usize][from as usize];
        self.board.remove_piece(us, moving_piece, from);
        
        // NNUE Incremental Update
        if crate::nnue::serialize::is_vortex_loaded() {
            self.nnue.push();
            self.nnue.update_pst(&self.board, moving_piece, us, from, to);
            if let Some((color, pt)) = captured_piece {
                let capture_sq = if flag == crate::move_core::FLAG_EP_CAPTURE {
                    if us == Color::White { to - 8 } else { to + 8 }
                } else {
                    to
                };
                // Remove captured piece from PST accumulator (I1 fix).
                self.nnue.remove_pst(&self.board, pt, color, capture_sq);
                // Record threat delta for the disappearing piece.
                self.nnue.push_threats_on_change(&self.board, color, pt, capture_sq, false);
            }
            self.nnue.update_threats(&self.board, moving_piece, us, from, to);
        }
====
        // NNUE Incremental Update (Before Board Modification to Prevent Desync)
        if crate::nnue::serialize::is_vortex_loaded() {
            self.nnue.push();
            
            // Subtract threats of the moving piece using the original board state
            self.nnue.push_threats_on_change(&self.board, us, moving_piece, from, false);
            
            if let Some((color, pt)) = captured_piece {
                let capture_sq = if flag == crate::move_core::FLAG_EP_CAPTURE {
                    if us == Color::White { to - 8 } else { to + 8 }
                } else {
                    to
                };
                // Subtract threats of the captured piece using the original board state
                self.nnue.push_threats_on_change(&self.board, color, pt, capture_sq, false);
            }
        }

        self.hash ^= z.piece_keys[us as usize][moving_piece as usize][from as usize];
        self.board.remove_piece(us, moving_piece, from);
        
        if let Some((color, pt)) = captured_piece {
            let capture_sq = if flag == crate::move_core::FLAG_EP_CAPTURE {
                if us == Color::White { to - 8 } else { to + 8 }
            } else {
                to
            };
            
            if crate::nnue::serialize::is_vortex_loaded() {
                // Remove captured piece from PST accumulator
                self.nnue.remove_pst(&self.board, pt, color, capture_sq);
            }
        }

        // Apply board additions / promotions / castling
        let final_moving_piece = if m.is_promotion() {
            let promo_piece = match flag {
                FLAG_PROMO_KNIGHT | FLAG_PROMO_CAPTURE_KNIGHT => PieceType::Knight,
                FLAG_PROMO_BISHOP | FLAG_PROMO_CAPTURE_BISHOP => PieceType::Bishop,
                FLAG_PROMO_ROOK | FLAG_PROMO_CAPTURE_ROOK => PieceType::Rook,
                FLAG_PROMO_QUEEN | FLAG_PROMO_CAPTURE_QUEEN | _ => PieceType::Queen,
            };
            self.board.add_piece(us, promo_piece, to);
            self.hash ^= z.piece_keys[us as usize][promo_piece as usize][to as usize];
            promo_piece
        } else if flag == FLAG_KING_CASTLE {
            self.board.add_piece(us, PieceType::King, to);
            self.board.remove_piece(us, PieceType::Rook, to + 1);
            self.board.add_piece(us, PieceType::Rook, to - 1);
            self.hash ^= z.piece_keys[us as usize][PieceType::King as usize][to as usize];
            self.hash ^= z.piece_keys[us as usize][PieceType::Rook as usize][(to + 1) as usize];
            self.hash ^= z.piece_keys[us as usize][PieceType::Rook as usize][(to - 1) as usize];
            PieceType::King
        } else if flag == FLAG_QUEEN_CASTLE {
            self.board.add_piece(us, PieceType::King, to);
            self.board.remove_piece(us, PieceType::Rook, to - 2);
            self.board.add_piece(us, PieceType::Rook, to + 1);
            self.hash ^= z.piece_keys[us as usize][PieceType::King as usize][to as usize];
            self.hash ^= z.piece_keys[us as usize][PieceType::Rook as usize][(to - 2) as usize];
            self.hash ^= z.piece_keys[us as usize][PieceType::Rook as usize][(to + 1) as usize];
            PieceType::King
        } else {
            self.board.add_piece(us, moving_piece, to);
            self.hash ^= z.piece_keys[us as usize][moving_piece as usize][to as usize];
            moving_piece
        };

        if crate::nnue::serialize::is_vortex_loaded() {
            // Update PST accumulator based on final board positions
            self.nnue.update_pst(&self.board, moving_piece, us, from, to);
            
            // Add threats of the moving piece (or promotion piece) on its destination square
            self.nnue.push_threats_on_change(&self.board, us, final_moving_piece, to, true);
            
            // Handle castling rook threat updates incrementally
            if flag == FLAG_KING_CASTLE {
                self.nnue.push_threats_on_change(&self.board, us, PieceType::Rook, to + 1, false);
                self.nnue.push_threats_on_change(&self.board, us, PieceType::Rook, to - 1, true);
            } else if flag == FLAG_QUEEN_CASTLE {
                self.nnue.push_threats_on_change(&self.board, us, PieceType::Rook, to - 2, false);
                self.nnue.push_threats_on_change(&self.board, us, PieceType::Rook, to + 1, true);
            }
        }
>>>>
```

---

### 5.2. Replace `RwLock` with Lock-Free Pointer References
To eliminate thread contention on static network weights, replace `std::sync::RwLock` with an atomic pointer or a static leaked reference once loaded, as weights are read-only during the search.

#### Recommendation
We can define weight retrieval via an atomic pointer:
```rust
use std::sync::atomic::{AtomicPtr, Ordering};
static WEIGHTS_PTR: AtomicPtr<VortexWeights> = AtomicPtr::new(std::ptr::null_mut());

pub fn get_weights() -> &'static VortexWeights {
    let ptr = WEIGHTS_PTR.load(Ordering::Acquire);
    if ptr.is_null() {
        // Fallback or panic if weights not loaded
    }
    unsafe { &*ptr }
}
```
During initialization, compile weights on the heap, and leak them using `Box::leak` to obtain a stable `'static` reference:
```rust
let weights = VortexWeights::new(); // ... loaded from file ...
let leaked = Box::leak(Box::new(weights));
WEIGHTS_PTR.store(leaked, Ordering::Release);
```
All reading operations in the hot path can then access the reference dereferenced from the atomic pointer completely lock-free, removing memory bus contention.

---

### 5.3. Swap Operators in `evaluate_pawn_tension`
Correct the pawn tension evaluation signs to reward attacks and penalize being attacked.

#### Patch for `vortex-core/src/evaluate.rs`
```rust
<<<<
    score -= (count_bits(w_attacks_left & black_pawns) as i16) * 10;
    score -= (count_bits(w_attacks_right & black_pawns) as i16) * 10;
    
    let b_attacks_left = (black_pawns & !0x0101010101010101u64) >> 9;
    let b_attacks_right = (black_pawns & !0x8080808080808080u64) >> 7;
    
    score += (count_bits(b_attacks_left & white_pawns) as i16) * 10;
    score += (count_bits(b_attacks_right & white_pawns) as i16) * 10;
====
    score += (count_bits(w_attacks_left & black_pawns) as i16) * 10;
    score += (count_bits(w_attacks_right & black_pawns) as i16) * 10;
    
    let b_attacks_left = (black_pawns & !0x0101010101010101u64) >> 9;
    let b_attacks_right = (black_pawns & !0x8080808080808080u64) >> 7;
    
    score -= (count_bits(b_attacks_left & white_pawns) as i16) * 10;
    score -= (count_bits(b_attacks_right & white_pawns) as i16) * 10;
>>>>
```

---

### 5.4. Scale Safety Difference in King Safety
Scale the combined safety score difference rather than individual raw safety scores to avoid sign-dependent penalties.

#### Patch for `vortex-core/src/evaluate.rs`
```rust
<<<<
        if w_safety < b_safety {
            score += (w_safety as f32 * 1.4) as i16 - b_safety;
        } else if b_safety < w_safety {
            score += w_safety - (b_safety as f32 * 1.4) as i16;
        } else {
            score += w_safety - b_safety;
        }
====
        let safety_diff = w_safety - b_safety;
        score += (safety_diff as f32 * 1.4) as i16;
>>>>
```

---

### 5.5. Add Symmetric Blockade Bonuses in `evaluate_blockade`
Ensure that Black blockades are rewarded symmetrically.

#### Patch for `vortex-core/src/evaluate.rs`
```rust
<<<<
    score += (locked_files as i16) * 20; 
    if locked_files >= 3 {
        score += 40; 
    }
====
    score += (locked_files as i16) * 20; 
    if locked_files >= 3 {
        score += 40; 
    } else if locked_files <= -3 {
        score -= 40;
    }
>>>>
```

---

### 5.6. Fix Arguments in `parallel_label.py` and `run_training.sh`
To prevent the catastrophic truncation of the input EPD dataset, modify the calls to `generate_training_data` to match its new 2-argument requirement.

#### Patch for `tools/train/run_training.sh`
```bash
<<<<
    "$GEN_BIN" "$SF_BIN" "$EPD_FILE" "$VDATA_FILE" "$SF_DEPTH"
====
    # generate_training_data now parses EPD directly to VDATA (version 2) in two arguments
    "$GEN_BIN" "$EPD_FILE" "$VDATA_FILE"
>>>>
```

#### Patch for `tools/train/parallel_label.py`
```python
<<<<
def run_generator(sf_bin: str, gen_bin: str, epd: str, vdata: str, depth: int, job_id: int,
                  progress: dict, lock: threading.Lock):
    """Run a single generate_training_data process and track progress."""
    cmd = [gen_bin, sf_bin, epd, vdata, str(depth)]
====
def run_generator(sf_bin: str, gen_bin: str, epd: str, vdata: str, depth: int, job_id: int,
                  progress: dict, lock: threading.Lock):
    """Run a single generate_training_data process and track progress."""
    # generate_training_data now accepts only input EPD and output VDATA
    cmd = [gen_bin, epd, vdata]
>>>>
```

---

### 5.7. Export Policy Moves to EPD and Enable Policy Head Training

1. **Selfplay Policy Export**: Modify `generate_selfplay.py` to write the policy target move (the move played) as a part of the EPD metadata (e.g., using standard EPD formats or appending the move index to the line):
   ```python
   dataset.append(f'{fen} c9 "{result}" pm {uci_move}')
   ```
2. **Parser Updates**: Update `generate_training_data` to parse the `pm` field (policy move) and encode the move to its target policy index.
3. **Training Updates**: In `train.py`, replace the dummy policy targets with the loaded policy indices from `.vdata` and enable policy head training:
   ```python
   # In train.py, replace torch.full with the actual loaded batch targets
   "target_policy": batch["policy_targets"]
   ```
This will allow the neural network policy head to be trained, replacing random search bonuses with strong, learned heuristics, thereby optimizing alpha-beta move ordering.
