# Null Move Pruning for Explicit Threat Forecasting

## Overview
Null Move Pruning (NMP) is a classic forward-pruning heuristic used in modern chess programming to drastically reduce the size of the search tree. The fundamental logic is that if a side can pass their turn (play a "null move") and still maintain a position strong enough to cause a beta-cutoff, then the current position is overwhelmingly strong and the entire subtree can be safely pruned.

While standard NMP is used purely for speed and optimization, the mechanics of a null move can be adapted to serve a secondary, highly valuable purpose: **Explicit Threat Forecasting**.

## Mechanism of Threat Detection

When the engine passes its turn, it essentially asks the search algorithm: *"If the opponent had a free, uninterrupted move right now, what is the absolute worst damage they could inflict?"*

1. **The Threat Score (Delta):** The difference between the static evaluation of the current position and the evaluation returned after a null move search represents the "Threat Score." If the score drops massively (e.g., from +0.5 to -4.0), it indicates the presence of a severe, impending tactical threat.
2. **Identifying the Threat:** The Principal Variation (PV) returned by the null move search explicitly details the opponent's exact plan. The first move of this PV is the opponent's primary threat.
3. **Singular Extensions:** Once a severe threat is detected via NMP, the engine can utilize "Singular Extensions." This technique dynamically extends the search depth for candidate moves that effectively neutralize the discovered threat, ensuring the engine does not succumb to the horizon effect when defending complex tactical sequences.

## Limitations and Risks
- **Zugzwang:** Null Move Pruning inherently fails in zugzwang positions (endgames where the obligation to move is a disadvantage). NMP must be disabled in pawn endgames or positions with significantly reduced material.
- **In-Check States:** NMP cannot be executed when the King is in check, as passing the turn would result in an illegal pseudo-legal state (King capture).
- **Tactical Noise:** Explicitly programming "threat responses" outside of the standard alpha-beta framework can sometimes introduce noise, causing the engine to "see ghosts" and overreact to threats that standard search would naturally defend against.

## Application to Vortex
To implement Null Move Threat Forecasting in Vortex:
- Integrate a standard NMP condition within the `AlphaBeta.ts` search loop, executing a reduced depth search (`R=2` or `R=3`) after passing the turn.
- Capture the score and PV of the null search.
- If the score delta exceeds a critical threshold (e.g., > 200 centipawns), flag the position as `threatened`.
- Apply a depth extension (+1 ply) to candidate moves that successfully prevent the score drop, ensuring Vortex accurately calculates the prophylactic defense required to survive the attack.
