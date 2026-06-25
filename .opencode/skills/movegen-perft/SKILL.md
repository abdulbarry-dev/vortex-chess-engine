---
name: movegen-perft
description: Use when debugging move generation, adding new move types, fixing legality bugs, or running perft tests. Also use when modifying attack detection, sliding piece logic, or castling/en passant/promotion.
---

# Move Generation & Perft

## Relevant files

| Area | Files |
|---|---|
| Coordinator | `src/move-generation/MoveGenerator.ts` |
| Per-piece | `src/move-generation/PawnMoves.ts`, `src/move-generation/KnightMoves.ts`, `src/move-generation/BishopMoves.ts`, `src/move-generation/RookMoves.ts`, `src/move-generation/QueenMoves.ts`, `src/move-generation/KingMoves.ts` |
| Shared | `src/move-generation/SlidingMoves.ts` |
| Validation | `src/move-generation/LegalityChecker.ts`, `src/move-generation/AttackDetector.ts` |
| Board | `src/core/Board.ts`, `src/core/GameState.ts`, `src/core/Move.ts`, `src/core/Piece.ts`, `src/core/Square.ts` |
| Perft | `src/utils/PerftTester.ts` |
| Test positions | `src/constants/Positions.ts` |
| Tests | `tests/MoveGenerator.test.ts`, `tests/Perft.test.ts`, `tests/Move.test.ts`, `tests/Board.test.ts` |

## Verification

```bash
npm test -- tests/Perft.test.ts        # depth 1-4 starting pos + Kiwipete
npm test -- tests/MoveGenerator.test.ts
npm test -- tests/Board.test.ts
npm run typecheck
```

## Gotchas

- Board is a 64-element flat array. Square 0 = a1 (bottom-left), 63 = h8 (top-right). Rank = `square / 8`, File = `square % 8`.
- `MoveFlags` enum: `None=0, Capture=1, Castle=2, EnPassant=4, Promotion=8, DoublePawnPush=16`. Bitwise OR for combined flags.
- Perft tests compare against known node counts (starting pos: depth1=20, depth2=400, depth3=8902, depth4=197281). If counts change, the move generator regressed.
- Kiwipete position tests castling, en passant, and complex captures — the most sensitive perft case.
- `LegalityChecker` is separate from raw move generation. `MoveGenerator.generateLegalMoves()` wraps both. For raw pseudo-legal moves, dig into the per-piece modules directly.
- Edge cases that commonly break: en passant legality after check-reveal, castling through/into check, underpromotion, double-pawn-push en passant availability.
