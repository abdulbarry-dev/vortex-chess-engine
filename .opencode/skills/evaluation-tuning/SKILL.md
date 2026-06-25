---
name: evaluation-tuning
description: Use when modifying or tuning position evaluation — material values, piece-square tables, pawn structure, king safety, mobility, phase detection, or endgame evaluation.
---

# Evaluation Tuning

## Relevant files

| Area | Files |
|---|---|
| Coordinator | `src/evaluation/Evaluator.ts` |
| Material | `src/evaluation/MaterialEvaluator.ts`, `src/constants/PieceValues.ts` |
| Position | `src/evaluation/PieceSquareTables.ts` |
| Pawn structure | `src/evaluation/PawnStructureEvaluator.ts` |
| King safety | `src/evaluation/KingSafetyEvaluator.ts` |
| Mobility | `src/evaluation/MobilityEvaluator.ts` |
| Endgame | `src/endgame/EndgameTablebase.ts` |
| Weights type | `src/types/Evaluation.types.ts` (interface `EvaluationWeights`) |
| Tests | `tests/Evaluator.test.ts`, `tests/Constants.test.ts` |

## Verification

```bash
npm test -- tests/Evaluator.test.ts   # eval correctness
npm test -- tests/Constants.test.ts   # piece values, MVV-LVA
npm run typecheck
```

## Gotchas

- There is **no `EvaluationWeights.ts` file** — the README is wrong. Weights are typed as `EvaluationWeights` interface in `src/types/Evaluation.types.ts`. If you need tunable weights, add a constants file or inline them in the evaluator.
- `PieceType` enum: Pawn=1, Knight=2, Bishop=3, Rook=4, Queen=5, King=6.
- `Color` enum: White=1, Black=-1. Multiply scores by `color` to flip eval sign.
- `GamePhase` enum in `Evaluation.types.ts`: `Opening`, `Middlegame`, `Endgame`.
- Piece-square tables in `PieceSquareTables.ts` are indexed `[square][pieceType]`. Square 0 = a1.
- `MaterialEvaluator` sums piece values from `PIECE_VALUES` (in centipawns: P=100, N=320, B=330, R=500, Q=900, K=0).
- Expect subtle eval changes to alter search behavior. Run `npm test` after numeric changes.
