# Stability Scores and Variance Minimization

## Overview
In the context of chess engine performance and evaluation, "stability" refers to the consistency of a position's evaluation as the search depth increases. An unstable position suffers from the "horizon effect," where the engine's evaluation fluctuates wildly between depths (e.g., jumping from +1.2 at depth 4 to -3.5 at depth 5, then +2.0 at depth 6). 

Variance Minimization is a strategy—often utilized implicitly through Quiescence Search, but sometimes applied explicitly as a heuristic—designed to reduce this "noise." By prioritizing stable, low-variance positions, a chess engine can systematically avoid sharp, highly tactical lines where a single miscalculation could prove fatal.

## The Concept of a "Stability Score"
While an evaluation score defines *who is winning*, a stability score defines *how trustworthy the evaluation is*. 

If Vortex is evaluating two candidate moves that both return an evaluation of +0.50:
- **Move A** leads to a volatile tactical sequence where evaluations swing wildly depending on the exact depth calculated.
- **Move B** leads to a locked pawn structure with very few legal pawn breaks and a closed center, where the evaluation remains consistently at +0.50 across all depths.

A defensive engine like Vortex should inherently prefer Move B. The Stability Score quantifies this by measuring the variance of the evaluation delta across successive iterations in the iterative deepening framework.

## Variance Minimization Techniques

### 1. Quiescence Search
The most widespread method for variance minimization is the Quiescence Search (QS). QS dynamically extends the search depth in "noisy" positions (positions with active captures, promotions, and sometimes checks) until a "quiet" state is reached. This ensures that the static evaluation is only applied when the position's material balance is stable.

### 2. Bayesian Smoothing and Harmonic Means
Experimental approaches use statistical smoothing to evaluate nodes. Instead of strictly taking the absolute minimax value backed up from the leaves, the engine applies a harmonic mean or Bayesian probability distribution to the scores of the candidate moves, heavily discounting lines that display massive evaluation variance.

### 3. "Grind" Mode
When an engine is playing against a significantly stronger opponent (e.g., a 1600 engine playing a 2400 engine), engaging in highly complex tactical calculations is a losing proposition, as the stronger engine will always out-calculate it. Variance minimization acts as a "Grind Mode"—actively dragging the game into slow, positional maneuvering where the search branching factor is low, and the risk of immediate tactical blunders is minimized.

## Application to Vortex
To implement Variance Minimization in Vortex:
- **Depth-Delta Tracking:** During `IterativeDeepening.ts`, track the score of the principal variation (PV) at depth N and depth N-1.
- **Volatility Metric:** If the delta between `score(N)` and `score(N-1)` is consistently high, mark the root move as highly volatile.
- **Defensive Preference:** When selecting between top candidate moves that have similar objective evaluations (e.g., within 20 centipawns of each other), adjust the move ordering to select the move with the lowest volatility metric, favoring closed structures and safe pawn formations.
