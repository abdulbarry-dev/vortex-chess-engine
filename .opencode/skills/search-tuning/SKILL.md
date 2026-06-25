---
name: search-tuning
description: Use when optimizing or modifying search algorithms — LMR, futility pruning, null-move pruning, aspiration windows, check extensions, PVS, MultiPV, pondering, or time management. Also use when debugging search depth, node counts, or move ordering.
---

# Search Tuning

## Relevant files

| Area | Files |
|---|---|
| Core search | `src/search/SearchEngine.ts`, `src/search/AlphaBeta.ts`, `src/search/IterativeDeepening.ts`, `src/search/QuiescenceSearch.ts` |
| Pruning extensions | `src/search/FutilityPruning.ts`, `src/search/NullMovePruning.ts`, `src/search/LateMoveReduction.ts`, `src/search/CheckExtensions.ts` |
| Move ordering | `src/search/MoveOrdering.ts`, `src/search/KillerMoves.ts`, `src/search/HistoryHeuristic.ts` |
| PV / MultiPV | `src/search/PrincipalVariation.ts`, `src/search/PrincipalVariationSearch.ts`, `src/search/MultiPV.ts` |
| TT | `src/search/TranspositionTable.ts`, `src/search/ZobristHashing.ts` |
| Pondering | `src/search/Pondering.ts` |
| Time manager | `src/time/TimeManager.ts` |
| Search constants | `src/constants/SearchConstants.ts` |
| Tests | `tests/Search.test.ts`, `tests/AlphaBeta.test.ts`, `tests/AspirationWindows.test.ts`, `tests/FutilityPruning.test.ts`, `tests/KillerMoves.test.ts`, `tests/LateMoveReduction.test.ts`, `tests/NullMovePruning.test.ts`, `tests/PrincipalVariation.test.ts`, `tests/PrincipalVariationSearch.test.ts`, `tests/MultiPV.test.ts`, `tests/HashTable.test.ts`, `tests/Pondering.test.ts`, `tests/TimeManager.test.ts` |

## Verification

```bash
npm test -- tests/Search.test.ts      # main search tests
npm test -- tests/AspirationWindows.test.ts
npm test -- tests/FutilityPruning.test.ts
npm run typecheck                      # ensure strict TS passes
```

## Gotchas

- `noUnusedLocals` and `noUnusedParameters` are on — dead params or variables break the build. Comment them out with `_` prefix or remove them.
- Quiescence search is **integrated into `AlphaBeta.ts`**, not standalone — modify both together.
- The transposition table stores `zobristKey: bigint` — ensure your hashing is consistent.
- Time limits are passed down the call chain from `SearchEngine.findBestMove()` → `IterativeDeepeningSearch.search()` → `AlphaBetaSearch`. Changes to time management must propagate through all three.
- `AlphaBetaSearch` has a `stop()` method checked periodically — new loops must check `this.stopped`.
- Default search depth is 5 (`DEFAULT_SEARCH_DEPTH` in `SearchConstants.ts`).
