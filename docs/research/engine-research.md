# Engine Fundamentals and Defensive Adjustments

## Executive Summary
This document reviews core chess engine search techniques and explores how each can be specifically tuned or interpreted to support a defensive engine philosophy for Vortex.

## Core Techniques & Defensive Tuning

### 1. Alpha-Beta Search & Negamax
**Concept:** The foundational minimax search algorithm with pruning.
**Defensive Angle:** Alpha-Beta inherently assumes perfect play from the opponent (pessimistic search). This is inherently defensive! The engine always assumes the opponent will find their strongest reply.

### 2. Iterative Deepening (ID)
**Concept:** Searching depth 1, then depth 2, then depth 3, etc., to manage time and improve move ordering.
**Defensive Angle:** ID ensures the engine always has a fallback move if time runs out. In complex defensive positions, ID allows the engine to quickly identify "safe" moves at shallow depths to fall back on if deeper search indicates danger.

### 3. Quiescence Search (QSearch)
**Concept:** Extending the search at leaf nodes by analyzing all captures and forcing moves until the position is "quiet."
**Defensive Angle:** QSearch is the ultimate defender against tactical blunders. For Vortex, QSearch must be incredibly robust. Expanding QSearch to include checks (and evading checks) ensures the engine never falls for a forced mate combination just beyond the search horizon.

### 4. Null Move Pruning (NMP)
**Concept:** Giving the opponent a free move to see if the position is so good that we still beat alpha.
**Defensive Angle:** As discussed in `threat-prediction.md`, NMP is a powerful threat detector. If NMP fails low (meaning giving the opponent a free move destroys our position), it alerts Vortex to a severe impending threat.

### 5. Late Move Reductions (LMR)
**Concept:** Searching moves that are ordered late in the list at a shallower depth to save time.
**Defensive Angle:** **CRITICAL:** Standard LMR can be dangerous for a defensive engine. Quiet, prophylactic moves (like a king step `Kh1`) are often ordered very late because they aren't captures or checks. If LMR aggressively prunes these, the engine will miss brilliant defensive ideas. Vortex must tune its Move Ordering and LMR to avoid overly reducing quiet prophylactic moves.

### 6. Transposition Tables (TT) & Zobrist Hashing
**Concept:** Caching evaluated positions to avoid redundant search.
**Defensive Angle:** TT is vital for endgames and fortresses. Recognizing transpositional draws (threefold repetition) is a massive defensive weapon. Vortex must actively seek threefold repetitions when its evaluation is negative.

## Research Gaps
- **Defensive Move Ordering:** How to score quiet prophylactic moves highly enough in the move ordering phase so they aren't pruned by LMR.
- **Asymmetric Evaluation:** Should the engine use a different evaluation threshold when searching its own moves vs the opponent's moves?

## References & Further Reading
1. Chess Programming Wiki: [Search](https://www.chessprogramming.org/Search)
2. Slate, D. J., & Atkin, L. R. (1977). *CHESS 4.5 - The Northwestern University Chess Program*.
