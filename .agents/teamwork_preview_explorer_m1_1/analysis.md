# Vortex Chess Engine Search Analysis Report

This report presents the findings from a deep read-only analysis of the search components in `vortex-core/src/search` (including `mod.rs`, `id.rs`, `aspiration.rs`, `swindle.rs`, and `variance.rs`). We have identified five distinct issues ranging from critical search correctness/stability bugs to severe algorithmic performance bottlenecks.

---

## Summary of Findings

1. **Incorrect TT Bounds stored at the Root (Critical Bug)**: Root search unconditionally stores transposition table entries as `TT_EXACT` even if the search failed low or failed high.
2. **Incorrect Pawn Tension Calculation for Black in Swindle Mode (Logic Bug)**: The complexity evaluation function in swindle mode always computes pawn attacks as if the side to move is White, corrupting evaluation for Black.
3. **Massive Algorithmic Bottleneck in Quiescence Search (Performance Bottleneck)**: Quiet moves are generated, scored (which runs the expensive NNUE policy neural network evaluations), and sorted, only to be immediately skipped inside the search loop.
4. **Missing TT Move Ordering at the Root (Performance Bottleneck)**: The root search does not probe the transposition table to get the best move from the previous iteration, severely degrading move ordering efficiency at the root.
5. **Dead Component `VarianceTracker` (Code Health/Missing Feature)**: An entire module `variance.rs` is defined for tracking move score stability to prevent blunders, but it is never updated or used.

---

## 1. Incorrect TT Bounds stored at the Root (Search Correctness)

### File & Line Number
* **File**: `vortex-core/src/search/mod.rs`
* **Region**: Lines 225–227 (within `search_root_internal`)

### Root Cause
At the end of the root search in `search_root_internal`, the best move and its score are stored in the transposition table:
```rust
    if best_move.0 != 0 {
        tt.store(state.hash, depth, best_score, TT_EXACT, best_move);
    }
```
However, since `search_root_internal` performs an alpha-beta search, the returned `best_score` is only exact if it lies strictly between the search window boundaries (`alpha < best_score < beta`).
* If `best_score <= original_alpha`, the search failed low, and `best_score` is only an upper bound (`TT_ALPHA`).
* If `best_score >= beta`, the search failed high, and `best_score` is only a lower bound (`TT_BETA`).

Unconditionally marking it as `TT_EXACT` corrupts the transposition table. When other search branches, threads, or subsequent search iterations transpose into the root position, they will retrieve the score as an exact value rather than a bound. This leads to search instability, incorrect evaluations, and potential blunders.

### Proposed Patch
Save the initial `alpha` value at the start of the function and calculate the correct bound type before storing the entry:

```rust
// Save original_alpha at the beginning of search_root_internal (around line 116)
let original_alpha = alpha;
```

```rust
// Replace lines 225-227:
    if best_move.0 != 0 {
        let bound = if best_score <= original_alpha { TT_ALPHA }
                   else if best_score >= beta { TT_BETA }
                   else { TT_EXACT };
        
        let mut score_to_store = best_score;
        if score_to_store > MATE_SCORE - 100 {
            score_to_store += 0; // ply is 0 at the root
        } else if score_to_store < -MATE_SCORE + 100 {
            score_to_store -= 0;
        }
        tt.store(state.hash, depth, score_to_store, bound, best_move);
    }
```

---

## 2. Incorrect Pawn Tension Calculation for Black in Swindle Mode (Logic Bug)

### File & Line Number
* **File**: `vortex-core/src/search/swindle.rs`
* **Region**: Lines 48–49 (within `complexity_bonus`)

### Root Cause
In `complexity_bonus`, the code approximates pawn tension for complexity calculation by shifting pawns:
```rust
        let left_attacks = (us_pawns & !0x0101010101010101) << 7;
        let right_attacks = (us_pawns & !0x8080808080808080) << 9;
```
Shifting left (`<<`) moves bits to higher ranks, which is only correct for White pawns. If Black is the side to move (the player trying to swindle), Black pawns attack down the board towards lower ranks (which requires right shifts `>> 9` and `>> 7`). The current code calculates fictitious White pawn moves for Black pawns, leading to a wrong complexity score and incorrect search decisions when Black is losing.

### Proposed Patch
Differentiate the shift direction based on `state.side_to_move`:

```rust
// Replace lines 48-49 with color-aware shifts:
        let (left_attacks, right_attacks) = if state.side_to_move == crate::types::Color::White {
            ((us_pawns & !0x0101010101010101) << 7, (us_pawns & !0x8080808080808080) << 9)
        } else {
            ((us_pawns & !0x0101010101010101) >> 9, (us_pawns & !0x8080808080808080) >> 7)
        };
```

---

## 3. Massive Algorithmic Bottleneck in Quiescence Search (Performance Bottleneck)

### File & Line Number
* **File**: `vortex-core/src/search/mod.rs`
* **Region**: Lines 536–558 (within `quiescence_search`)

### Root Cause
In `quiescence_search`, the engine generates all pseudo-legal moves:
```rust
    let mut move_list = generate_pseudo_legal_moves(&state.board, state.side_to_move, state.castling_rights, state.en_passant_sq);
```
It then loops over all of them, calls `score_move` (which evaluates neural network policy head logits for each move), and sorts the entire list of moves. Only after all of this does the search loop skip quiet moves:
```rust
    for i in 0..move_list.count {
        ...
        let m = move_list.moves[i];
        if !m.is_capture() && !m.is_promotion() { continue; }
```
Because quiet moves constitute 70-80% of all generated moves, computing the expensive NNUE policy head logit and sorting them is extremely wasteful and drastically degrades the nodes-per-second (NPS) speed of the engine.

### Proposed Patch
Filter the moves list to keep only captures and promotions *before* doing any scoring or sorting:

```rust
// Replace lines 536-551 with filtered move list preparation:
    let mut raw_move_list = generate_pseudo_legal_moves(&state.board, state.side_to_move, state.castling_rights, state.en_passant_sq);
    let mut move_list = crate::movegen::MoveList { moves: [Move(0); 256], count: 0 };
    
    // Filter to captures and promotions first to avoid scoring/sorting quiet moves
    for i in 0..raw_move_list.count {
        let m = raw_move_list.moves[i];
        if m.is_capture() || m.is_promotion() {
            move_list.moves[move_list.count] = m;
            move_list.count += 1;
        }
    }

    let swindle = SwindleMode::new(stand_pat);
    let contempt = crate::contempt::compute_contempt(stand_pat);
    let mut move_scores = [0i32; 256];
    for i in 0..move_list.count {
        move_scores[i] = score_move(move_list.moves[i], state, Move(0), 0, killers, history, &swindle, contempt);
    }
    for i in 1..move_list.count {
        let mut j = i;
        while j > 0 && move_scores[j] > move_scores[j - 1] {
            move_scores.swap(j, j - 1);
            move_list.moves.swap(j, j - 1);
            j -= 1;
        }
    }
```
*(Note: Since castling moves are never captures or promotions, the castling safety check at lines 561-571 can also be safely bypassed/removed).*

---

## 4. Missing TT Move Ordering at the Root (Performance Bottleneck)

### File & Line Number
* **File**: `vortex-core/src/search/mod.rs`
* **Region**: Lines 158–161 (within `search_root_internal`)

### Root Cause
In `search_root_internal`, the move-ordering scoring loop passes `Move(0)` as the transposition table move (`tt_move`):
```rust
    let mut move_scores = [0i32; 256];
    for i in 0..move_list.count {
        move_scores[i] = score_move(move_list.moves[i], state, Move(0), 0, &killers, &history, &swindle, contempt);
    }
```
Because it doesn't probe the TT at the root, the best move from the previous iteration of iterative deepening (or transposition table) is not evaluated or searched first. This defeats the primary benefit of iterative deepening (highly efficient alpha-beta cutoffs from searching the best move first).

### Proposed Patch
Probe the transposition table at the start of `search_root_internal` to fetch `tt_move`:

```rust
// Replace line 115-116 in search_root_internal:
    ctrl.nodes = 0;
    tt.new_search();
    
    // Probe the TT for root move ordering
    let mut tt_move = Move(0);
    if let Some(entry) = tt.probe(state.hash) {
        tt_move = Move(entry.best_move);
    }
```
And pass `tt_move` in the scoring loop on line 160:
```rust
        move_scores[i] = score_move(move_list.moves[i], state, tt_move, 0, &killers, &history, &swindle, contempt);
```

---

## 5. Dead Component `VarianceTracker` (Code Health / Missing Feature)

### File & Line Number
* **File**: `vortex-core/src/search/variance.rs` and `vortex-core/src/search/mod.rs` (Line 156)

### Root Cause
`VarianceTracker` is defined in `variance.rs` to track move score volatility and choose stable lines in close positions (a key prophylaxis technique). However, in `search_root_internal`, the instance is created as `_variance_tracker` and never updated or used anywhere in the search flow:
```rust
    let _variance_tracker = VarianceTracker::new();
```

### Proposed Patch
Either fully integrate `VarianceTracker` into `search_root_id` to evaluate candidates at the end of the search, or prune it if it was deemed unnecessary.
