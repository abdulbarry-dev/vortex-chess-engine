# Threat Heatmaps and Influence Convergence

## Overview
Threat Heatmaps represent a visual and mathematical approach to understanding spatial control in chess. While traditional engines evaluate piece placement using static Piece-Square Tables (PSTs), a Threat Heatmap calculates dynamic "influence fields." It tracks which squares are actively controlled, attacked, or defended by the pieces on the board at any given moment.

By aggregating this data over multiple plies during the search, an engine can identify "hot zones"—sectors of the board where the opponent is rapidly converging their forces, allowing the engine to deploy prophylactic defenses before the attack even crystallizes.

## Implementation Mechanics

### 1. Influence Bitboards
Most engines natively utilize bitboards to represent the board state. An attack bitboard contains all the squares a specific piece type can move to. 
A Threat Heatmap aggregates these individual piece attacks into a global 2D grid or comprehensive integer array representing the entire board.
- A square defended by two pawns and a knight gets a positive influence score (+3).
- A square attacked by an enemy rook and queen gets a negative influence score (-2).

### 2. Convergence Detection
A static influence map only tells the engine who controls a square *right now*. To implement prophylactic threat detection, the engine must track the delta (change) in influence over successive plies during the search.
If the engine detects that the opponent's influence on the Kingside (squares f2, g2, h2) is increasing over the depth of the search tree, it indicates a mathematical convergence of enemy forces. The engine has successfully detected a pawn storm or a piece onslaught without needing to calculate the specific resulting checkmate line.

### 3. Prophylactic Incentives
Once a "hot zone" or convergence is detected, the engine modifies its evaluation heuristics to heavily incentivize prophylactic piece placement.
- It grants evaluation bonuses for moving defensive pieces (Knights, Bishops) into the "hot zone" to neutralize the negative influence.
- It penalizes king movement into the hot zone.
- It encourages pawn breaks on the opposite side of the board to generate counter-play against the flank attack.

## Application to Vortex
For a defensive engine like Vortex, Threat Heatmaps serve as the ultimate early-warning system.
- **Data Aggregation:** Modify the `AttackDetector.ts` to output an aggregated 64-square influence array.
- **Integration:** Feed this array into the `Evaluator.ts`. Instead of just evaluating static piece placement, Vortex evaluates *control*. 
- **Defensive Personality:** If the influence map shows the opponent controls the center (d4/e4), Vortex's brittleness detection can be triggered to actively target the pawns supporting that center. If the heatmap shows convergence on the Vortex King, the engine can grant artificial evaluation bonuses for moving defenders near the King, creating a structural "Fortress" before the tactical calculation even begins.
