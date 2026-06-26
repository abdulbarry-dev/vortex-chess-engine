# Endgame Tablebase Magnetism

## Epic: vortex-chess-engine-3iy

---

## 1. Theoretical Foundation

Syzygy tablebases are precomputed databases containing the perfect mathematical
outcome of every possible chess position with 7 or fewer pieces on the board
(including kings). For any such position, the tablebase provides:
1. **WDL (Win/Draw/Loss):** The exact game outcome with perfect play.
2. **DTZ (Distance to Zeroing move):** The exact number of plies until a pawn
   push or capture (which resets the 50-move rule).

When a chess engine's search tree reaches a position found in a tablebase, it can
instantly stop searching that branch, replacing heuristic evaluation with absolute
truth. This creates a "gravity" effect: the search naturally gravitates toward
favourable tablebase positions because their scores are mathematically certain and
propagate up the minimax tree, overriding uncertain heuristic evaluations.

From a defensive standpoint, Tablebase Gravity is the ultimate tool. If the engine
is losing a middlegame, it knows that the only way to save the game is to steer
the position into a mathematically drawn endgame.

---

## 2. The Vortex Approach (Piece Count Gravity)

Vortex does not yet have native Syzygy bindings to read `.rtbw` or `.rtbz` files.
However, we can simulate the strategic effect of Tablebase Magnetism using a
heuristic proxy: **Piece Count Gravity**.

We know that a draw is exponentially more likely when the board simplifies toward
the 7-piece tablebase threshold. A position with K+R vs K+R+P is notoriously
drawish, whereas a middlegame down a pawn is usually a loss.

Therefore, we mathematically incentivise the losing side to trade down aggressively
toward endgame territory where the draw is more likely.

### 2.1 Implementation Details

**Component 1 — Simplification Gravity:**
- Track the total number of non-pawn, non-king pieces on the board.
- When `evaluation < -50` (Vortex is losing), apply a bonus of `+8cp` per piece
  already traded off the board (compared to the game start of 14 non-pawn pieces).
- This grows as pieces are traded: 0 trades = 0 bonus, 7 trades = +56cp bonus.

*(Note: This logic is partially shared with the Snake Protocol piece simplification,
but Tablebase Magnetism activates much earlier, at -50cp, reflecting a long-term
gravitational pull rather than an emergency reaction.)*

**Component 2 — Tablebase Threshold Anchor:**
- Count the total number of all pieces on the board (including pawns and kings).
- If `totalPieces <= 7` (the Syzygy threshold), and the engine is losing
  (`evaluation < -50cp`), apply a flat **Tablebase Reached Bonus** of `+50cp`.
- This creates an artificial "cliff" in the evaluation space: a massive artificial
  incentive to cross the 7-piece boundary when defending.

### 2.2 Integration in `Evaluator.ts`

```typescript
/**
 * Calculate the Tablebase Magnetism bonus.
 *
 * Simulates Syzygy tablebase gravity by heavily rewarding the defending side
 * for reaching 7-piece endgames, and providing a steady gravitational pull
 * toward simplification.
 *
 * @param board      - Current board state
 * @param finalScore - Current evaluation (White's perspective)
 * @returns Bonus in centipawns (positive = helps White, negative = helps Black)
 */
private calculateTablebaseMagnetism(board: Board, finalScore: number): number {
  if (Math.abs(finalScore) < 50) return 0; // Only activates when tangibly behind

  let totalPieces = 0;
  let nonPawnPieces = 0;

  for (const [_sq, piece] of board.getAllPieces()) {
    totalPieces++;
    if (piece.type !== PieceType.Pawn && piece.type !== PieceType.King) {
      nonPawnPieces++;
    }
  }

  // 1. Simplification Gravity (+8cp per traded non-pawn piece)
  let bonus = (14 - nonPawnPieces) * 8;

  // 2. Tablebase Threshold Anchor (+50cp flat if <= 7 pieces total)
  if (totalPieces <= 7) {
    bonus += 50;
  }

  if (finalScore < -50) {
    return bonus;   // White is losing
  } else if (finalScore > 50) {
    return -bonus;  // Black is losing
  }

  return 0;
}
```

---

## 3. Expected Behavioral Impact

- **Middlegame:** When down -75cp (less than a full pawn), Vortex will gladly
  exchange a pair of knights to gain +16cp from Simplification Gravity,
  mitigating the material deficit in the engine's eyes.
- **Endgame Transition:** The engine will actively sacrifice positional evaluation
  to force exchanges that cross the 7-piece threshold, aiming for theoretical draws.
- **Synergy:** When combined with 50-Move Rule Gravity (Epic 5ol), the engine
  seeks a perfectly dual-pronged defence: trade pieces to reach tablebases, but
  never trade pawns to keep the 50-move clock ticking.

---

## 4. Future Roadmap

While Piece Count Gravity is a powerful heuristic proxy, the ultimate goal for
Vortex is full mathematical certainty.

The next evolutionary step for Tablebase Magnetism will be:
1. Native integration of the `Fathom` C library (via Node native addons) or a pure
   TypeScript Syzygy prober.
2. Indexing `.rtbw` (WDL) files at the root of the AlphaBeta search.
3. Completely pruning any search branch that hits a known drawn tablebase position
   when the engine is otherwise losing.

---

## 5. References

- Chessprogramming Wiki: [Syzygy Bases](https://www.chessprogramming.org/Syzygy_Bases)
- Ronald de Man: *Syzygy endgame tablebases*.
- Müller, K., & Lamprecht, F. (2001). *Fundamental Chess Endings*.
