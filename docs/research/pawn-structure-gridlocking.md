# Pawn Structure Gridlocking (Blockade Evaluator)

## Epic: vortex-chess-engine-cvv

---

## 1. Theoretical Foundation

The concept of the blockade is one of the most profound contributions to chess theory, articulated most rigorously by Aron Nimzowitsch in his 1925 work "My System." Nimzowitsch observed that the correct way to fight against a passed pawn or a strong pawn chain is not necessarily to capture it, but to **blockade it** — to place a piece directly in front of it so it cannot advance, while systematically restricting the opponent's entire position.

The strategic principle extends beyond individual passed pawns. In closed pawn structures, when two pawn chains interlock — for example, White pawns on d4 and e5 facing Black pawns on d5 and e6 — the position is said to be "gridlocked." Neither side can open the position without making a major structural concession. In these configurations, long-range pieces such as rooks and bishops lose much of their power, while knights and kings become more active. The game naturally extends in length because tactical solutions (open files, direct attacks) become unavailable.

For a defensive engine like Vortex, actively steering the position into such gridlocked structures is a core strategic objective. A locked pawn structure:

- Prevents the opponent from creating open files for rook attacks.
- Eliminates diagonal bishop trajectories, reducing the potency of the opponent's bishops.
- Extends the game far beyond the typical 40-move heuristic, creating more opportunities for draw by attrition.
- Forces the game into the kind of strategic, maneuvering battle where Vortex's other defensive systems (Threat Heatmaps, Variance Minimization) are most effective.

---

## 2. Technical Background: How Engines Handle Blockades

### 2.1 Classical Approaches (Handcrafted Evaluation)

Classical engines like early Crafty and Fruit implemented explicit blockade heuristics in their evaluation functions:

- **Rammed Pawn Detection:** A pawn is "rammed" when a pawn of the opposite color occupies the directly adjacent square in the direction of advance. Engines detect this using simple square arithmetic: if `board[square + direction * 8]` contains an enemy pawn, the pawn is rammed.
- **Pawn Break Detection:** A pawn break is a pawn capture that opens a file. On file `f`, a pawn break exists if a pawn on `f` can legally capture diagonally to file `f-1` or `f+1`. If no such break exists for either side on a given file, that file is permanently closed.
- **Pawn Hash Tables:** Because pawn structures change slowly (typically one pawn capture every several moves), engines store pawn evaluations in a dedicated hash table keyed on a Zobrist hash of pawn positions only. This allows the engine to avoid recomputing the pawn evaluation on every node.

### 2.2 Modern Approaches (NNUE)

Modern engines like Stockfish with NNUE do not use explicit blockade rules. Instead, the neural network learns the positional value of locked structures from millions of training positions. The NNUE implicitly encodes the strategic value of closed positions through its weight matrices.

For Vortex, which uses handcrafted evaluation, an explicit `BlockadeEvaluator` is the correct architectural choice. It is transparent, tunable, and consistent with the engine's existing evaluator pattern.

---

## 3. Implementation Plan

### 3.1 File Structure

```
src/evaluation/BlockadeEvaluator.ts    -- New evaluator
src/evaluation/Evaluator.ts            -- Integrate with weight BLOCKADE
src/constants/SearchConstants.ts       -- Add BLOCKADE weight constant
```

### 3.2 Core Algorithm

The `BlockadeEvaluator` operates on the flat `Board` array (0 = a1, 63 = h8). It performs two passes:

**Pass 1 — Detect Locked Files:**

For each file `f` in 0..7:
1. Locate the most advanced White pawn on file `f` (highest rank).
2. Locate the most advanced Black pawn on file `f` (lowest rank, i.e., closest to rank 1).
3. If a White pawn at rank `r` faces a Black pawn at rank `r+1`, the file is "locked" (the pawns are directly interlocked).
4. Additionally verify no pawn break is available: check if White has a pawn on file `f-1` or `f+1` that can capture diagonally into `f`, and similarly for Black.

**Pass 2 — Score the Gridlock:**

- Award `+LOCKED_FILE_BONUS` (20cp) per locked file detected.
- If 3 or more files are simultaneously locked, award an additional `+GRIDLOCK_MULTIPLIER` bonus (40cp) to reward wide-scale structural closure.
- The score is returned from White's perspective (positive = White benefits). However, note that the bonus is awarded to whoever the current player is, since a locked structure benefits the *defender*, not necessarily White.

### 3.3 TypeScript Implementation

```typescript
/**
 * @file BlockadeEvaluator.ts
 * @description Detects and rewards locked pawn structures (gridlocks).
 *
 * A "locked file" is a file where a White pawn directly faces a Black pawn
 * with no pawn break available on adjacent files. Gridlocked positions
 * extend game length and reduce the opponent's attacking options.
 */

import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';
import { getFile, getRank } from '../core/Square';

const LOCKED_FILE_BONUS = 20;      // centipawns per locked file
const GRIDLOCK_BONUS = 40;         // extra bonus for 3+ locked files simultaneously

export class BlockadeEvaluator {
  /**
   * Evaluate pawn structure gridlocking.
   * Returns score from White's perspective.
   *
   * @param board - Current board state
   * @returns Score in centipawns (positive = White benefits from the gridlock)
   */
  evaluate(board: Board): number {
    const lockedFiles = this.detectLockedFiles(board);
    let score = lockedFiles * LOCKED_FILE_BONUS;
    if (lockedFiles >= 3) score += GRIDLOCK_BONUS;
    return score;
  }

  private detectLockedFiles(board: Board): number {
    let lockedCount = 0;

    for (let file = 0; file < 8; file++) {
      if (this.isFileLocked(board, file)) lockedCount++;
    }

    return lockedCount;
  }

  private isFileLocked(board: Board, file: number): boolean {
    // Find the most advanced White pawn on this file (highest rank number)
    let whitePawnRank = -1;
    let blackPawnRank = -1;

    for (let rank = 0; rank < 8; rank++) {
      const sq = rank * 8 + file;
      const piece = board.getPiece(sq);
      if (piece && piece.type === PieceType.Pawn) {
        if (piece.color === Color.White) whitePawnRank = rank;
        if (piece.color === Color.Black) blackPawnRank = rank;
      }
    }

    // A file is locked when a White pawn directly faces a Black pawn
    if (whitePawnRank === -1 || blackPawnRank === -1) return false;
    if (blackPawnRank !== whitePawnRank + 1) return false;

    // Confirm no pawn break exists on adjacent files
    return !this.hasPawnBreak(board, file, whitePawnRank, blackPawnRank);
  }

  private hasPawnBreak(board: Board, file: number, whiteRank: number, blackRank: number): boolean {
    const adjacentFiles = [file - 1, file + 1].filter(f => f >= 0 && f < 8);

    for (const adjFile of adjacentFiles) {
      // White pawn break: White pawn on adjFile at whiteRank that can capture diagonally
      const wpSq = whiteRank * 8 + adjFile;
      const wp = board.getPiece(wpSq);
      if (wp && wp.type === PieceType.Pawn && wp.color === Color.White) return true;

      // Black pawn break: Black pawn on adjFile at blackRank that can capture diagonally
      const bpSq = blackRank * 8 + adjFile;
      const bp = board.getPiece(bpSq);
      if (bp && bp.type === PieceType.Pawn && bp.color === Color.Black) return true;
    }

    return false;
  }
}
```

### 3.4 Integration in Evaluator.ts

Add to `EVALUATION_WEIGHTS`:
```typescript
BLOCKADE: 1.0,  // Pawn structure gridlocking (closed positions)
```

Add the call in `evaluate()` after pawn structure:
```typescript
if (EVALUATION_WEIGHTS.BLOCKADE > 0) {
  score += this.blockade.evaluate(board) * EVALUATION_WEIGHTS.BLOCKADE;
}
```

---

## 4. Tuning Guidance

| Parameter | Default | Effect of Increasing |
|---|---|---|
| `LOCKED_FILE_BONUS` | 20cp | Engine more aggressively avoids opening files |
| `GRIDLOCK_BONUS` | 40cp | Engine more aggressively seeks total closure |
| `EVALUATION_WEIGHTS.BLOCKADE` | 1.0 | Scales entire blockade contribution |

Start with these defaults. If the engine becomes too passive in open positions, reduce `LOCKED_FILE_BONUS` to 12cp.

---

## 5. Expected Behavioral Impact

- The engine will refuse to capture pawns if doing so opens a file, even at material gain.
- In French Defense or Caro-Kann structures, Vortex will aggressively maintain the central pawn tension (e4-e5 vs d5) rather than releasing it.
- Combined with the Marathon Time Allocator, this produces games that routinely exceed 60 moves.
- The Swindle Mode and Variance Minimization systems become far more effective in locked structures where evaluation uncertainty is naturally lower.

---

## 6. References

- Nimzowitsch, A. (1925). *My System*. — Chapter on Blockade.
- Chessprogramming Wiki: [Pawn Structure](https://www.chessprogramming.org/Pawn_Structure)
- Chessprogramming Wiki: [Blockade](https://www.chessprogramming.org/Blockade)
- Chessprogramming Wiki: [Pawn Hash Table](https://www.chessprogramming.org/Pawn_Hash_Table)
