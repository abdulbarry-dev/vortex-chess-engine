# Threat Prediction in Chess Engines

## Executive Summary
Threat prediction is the ability to anticipate what the opponent is trying to achieve. In traditional engine architecture, threats are usually discovered implicitly during the minimax search. However, explicit threat forecasting can significantly enhance defensive play by allowing the engine to allocate more search time to dangerous branches.

## Key Concepts

### 1. Opponent Plan Recognition
Identifying the long-term strategic goals of the opponent (e.g., launching a kingside attack, preparing a pawn break, or maneuvering to an outpost).

### 2. Threat Forecasting
Detecting tactical and positional threats before they become immediate. This involves analyzing candidate moves that the opponent *would* play if they had a free move.

### 3. Null Move Pruning (NMP) as a Threat Detector
NMP allows the engine to "pass" its turn. If the opponent's score jumps significantly after a null move, it indicates a severe impending threat.

## Existing Research
- **Null Move Observation:** Modern engines like Stockfish use Null Move Pruning primarily to save time (pruning branches where even skipping a turn wins). However, the *threat score* (the score difference before and after a null move) is a well-known heuristic for threat detection.
- **Multi-ProbCut:** Techniques to cut search spaces by estimating the probability of threats.
- **Singular Extensions:** Extending the search depth when there is only one valid response to a severe threat.

## Application to Vortex
How can Vortex estimate what the opponent is trying to achieve?
- **Null Move Threat Extraction:** Vortex can log the principal variation (PV) of the opponent *after* a null move. This PV represents the opponent's idealized plan. Vortex can then prioritize candidate moves that directly disrupt this plan.
- **Target Profiling:** By analyzing the opponent's mobility map, Vortex can identify which of its own pieces or squares the opponent is converging upon.

## Research Gaps
- **Strategic Plan Prediction:** Current engines predict tactical threats well, but predicting multi-move positional plans (like a slow pawn storm) without massive search depths remains challenging.
- **Human vs. Engine Threats:** Engines often foresee threats that humans miss, but they may underestimate "swindles" or practical human attacks that are technically unsound but practically dangerous.

## Future Ideas
- **Threat Heatmaps:** Maintaining a bitboard heatmap of squares the opponent is increasingly controlling over successive plies.
- **Prophylactic Extensions:** Extending the search not just for tactical recaptures, but when a prophylactic move effectively neutralizes the opponent's highest-scoring null-move response.

## References & Further Reading
1. Chess Programming Wiki: [Null Move Pruning](https://www.chessprogramming.org/Null_Move_Pruning)
2. Chess Programming Wiki: [Threats](https://www.chessprogramming.org/Threats)
3. Beal, D. F. (1989). *Experiments with the Null Move*. Advances in Computer Chess 5.
