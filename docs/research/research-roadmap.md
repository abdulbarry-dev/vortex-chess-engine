# Vortex Research Roadmap: A Prioritized Learning Path

## Executive Summary
This roadmap outlines a structured, phased approach to researching, developing, and refining Vortex into a world-class defensive chess engine. By progressing from fundamental engine techniques to highly experimental AI models, this roadmap ensures a solid foundation before pursuing novel research directions.

---

## Phase 1: Essential Knowledge
**Goal:** Understand the fundamental principles of defensive chess and positional play.
1. **Classical Defense:** Study the games of Petrosian, Smyslov, and Andersson. Identify recurring prophylactic and blockade motifs.
2. **Positional Weaknesses:** Codify exactly what constitutes an overextended attack, a brittle pawn structure, and loose piece coordination.
3. **Fortress Theory:** Review endgame manuals (e.g., Müller & Pajeken) to catalog standard drawing mechanisms and opposite-colored bishop setups.

---

## Phase 2: Engine Fundamentals
**Goal:** Master the core search and evaluation techniques that drive traditional chess engines.
1. **Search Mechanics:** Deep dive into Alpha-Beta, Negamax, and Iterative Deepening. Understand how engines handle the horizon effect.
2. **Tactical Safety:** Master Quiescence Search (QSearch) to ensure the engine never falls for shallow tactical combinations.
3. **Pruning & Reductions:** Analyze Null Move Pruning (NMP) and Late Move Reductions (LMR). **Critical research point:** How to implement these without accidentally pruning brilliant quiet defensive moves.
4. **Caching:** Implement and optimize Zobrist Hashing and Transposition Tables (TT).

---

## Phase 3: Defensive Specialization
**Goal:** Begin tuning standard algorithms to exhibit defensive behavior.
1. **Threat Forecasting:** Utilize NMP to actively detect opponent threats (the "Null Move Threat Score") and aggressively prioritize prophylactic responses.
2. **Defensive Evaluation Weights:** Hand-craft or tune evaluation functions to heavily reward piece coordination, solid pawn shields, and lack of weaknesses.
3. **Overextension Penalties:** Implement heuristics that punish the opponent for pushing pawns too far without sufficient piece support.

---

## Phase 4: Advanced Experimentation
**Goal:** Push the boundaries of traditional engine design with defensive innovations.
1. **Stability Score Implementation:** Track the variance of evaluations across depths. Implement a bias toward "stable" positions to grind down opponents.
2. **Swindle Mode:** When losing, modify the search to maximize position complexity (maximizing the number of reasonable responses for the opponent) to induce human error.
3. **Fortress Mode:** When slightly losing, shift the evaluation focus entirely away from material towards structural impenetrability and blockade squares.

---

## Phase 5: Novel Research Directions
**Goal:** Integrate modern machine learning techniques tailored specifically for defense.
1. **Draw Probability Networks:** Train an auxiliary neural network that classifies positions purely by draw percentage, overriding standard material evaluation in defensive scenarios.
2. **Threat Prediction Networks (TPN):** Develop models that output heatmaps of the opponent's likely future targets, guiding the engine's prophylactic maneuvering.
3. **Elasticity Metrics:** Research algorithms capable of calculating the "breaking point" of a position dynamically.

---

## References & Further Reading
1. *Chess Programming Wiki* (Core algorithms and heuristics).
2. DeepMind publications on AlphaZero (For insights into probabilistic MCTS approaches).
3. ICGA Journal (International Computer Games Association) for historical context on engine evaluation techniques.
