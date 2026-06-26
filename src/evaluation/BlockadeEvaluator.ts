/**
 * @file BlockadeEvaluator.ts
 * @description Detects and rewards locked pawn structures (gridlocks).
 *
 * A "locked file" is a file where a White pawn directly faces a Black pawn
 * with no pawn break available on adjacent files. Gridlocked positions
 * extend game length and reduce the opponent's attacking options, which
 * aligns with Vortex's core defensive philosophy of forcing long, grinding games.
 *
 * Theoretical basis: Nimzowitsch's blockade principle from "My System" (1925).
 * A locked pawn structure eliminates open files for rook attacks, restricts
 * bishop diagonals, and forces maneuvering play where defensive technique
 * excels over brute-force tactical calculation.
 */

import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';

/**
 * Reward per locked file detected.
 * Tuning: Increase to make engine more aggressively avoid pawn captures.
 * Decrease to 12cp if engine becomes too passive in genuinely open positions.
 */
const LOCKED_FILE_BONUS = 20;

/**
 * Extra bonus when 3 or more files are simultaneously locked.
 * This rewards achieving a wide-scale structural closure, not just a single blockade.
 */
const GRIDLOCK_BONUS = 40;

/**
 * Evaluates pawn structure gridlocking.
 *
 * Scans each file for interlocked White and Black pawns with no available
 * pawn break on adjacent files. Awards a positional bonus for each locked file
 * and an additional multiplier bonus when the entire center is closed.
 */
export class BlockadeEvaluator {
  /**
   * Evaluate pawn structure gridlocking.
   *
   * Returns a score from White's perspective. Since locked structures benefit
   * the defender in general (they prevent open-file attacks), the engine's
   * alpha-beta search will naturally favour moves that increase this score
   * regardless of which side is the "defender" in a given position.
   *
   * @param board - Current board state
   * @returns Score in centipawns (positive = White benefits from the gridlock)
   */
  evaluate(board: Board): number {
    const lockedFiles = this.detectLockedFiles(board);
    let score = lockedFiles * LOCKED_FILE_BONUS;

    // Gridlock Multiplier: reward total closure of 3 or more files simultaneously
    if (lockedFiles >= 3) {
      score += GRIDLOCK_BONUS;
    }

    return score;
  }

  /**
   * Count the number of locked files on the board.
   *
   * @param board - Current board state
   * @returns Number of files that are structurally locked
   */
  private detectLockedFiles(board: Board): number {
    let lockedCount = 0;

    for (let file = 0; file < 8; file++) {
      if (this.isFileLocked(board, file)) {
        lockedCount++;
      }
    }

    return lockedCount;
  }

  /**
   * Determine if a specific file is locked.
   *
   * A file is locked when:
   * 1. A White pawn at rank R directly faces a Black pawn at rank R+1
   *    (they are interlocked and cannot advance past each other).
   * 2. No pawn break exists on adjacent files that would allow either side
   *    to open the file via a diagonal capture.
   *
   * @param board - Current board state
   * @param file  - File index (0 = a-file, 7 = h-file)
   * @returns True if the file is structurally locked
   */
  private isFileLocked(board: Board, file: number): boolean {
    let whitePawnRank = -1;
    let blackPawnRank = -1;

    // Scan the file from rank 0 to rank 7 to find pawns.
    // We want the MOST ADVANCED pawn of each colour:
    // - White advances toward higher ranks, so we want the highest rank White pawn.
    // - Black advances toward lower ranks, so we want the lowest rank Black pawn.
    for (let rank = 0; rank < 8; rank++) {
      const sq = rank * 8 + file;
      const piece = board.getPiece(sq);

      if (piece && piece.type === PieceType.Pawn) {
        if (piece.color === Color.White) {
          whitePawnRank = rank; // Keep updating — last (highest rank) wins
        } else if (piece.color === Color.Black) {
          if (blackPawnRank === -1) {
            blackPawnRank = rank; // First Black pawn found is most advanced (lowest rank)
          }
        }
      }
    }

    // Both sides must have a pawn on this file
    if (whitePawnRank === -1 || blackPawnRank === -1) return false;

    // The pawns must be directly interlocked: White at rank R, Black at rank R+1
    if (blackPawnRank !== whitePawnRank + 1) return false;

    // Verify no pawn break is available on adjacent files
    return !this.hasPawnBreak(board, file, whitePawnRank, blackPawnRank);
  }

  /**
   * Check if a pawn break is available that could open the locked file.
   *
   * A pawn break exists when either side has a pawn on an adjacent file
   * at the same rank as the opposing pawn, enabling a diagonal capture
   * that would open the locked file.
   *
   * @param board       - Current board state
   * @param file        - The file being checked
   * @param whiteRank   - Rank of the White pawn on this file
   * @param blackRank   - Rank of the Black pawn on this file
   * @returns True if a pawn break is available for either side
   */
  private hasPawnBreak(
    board: Board,
    file: number,
    whiteRank: number,
    blackRank: number
  ): boolean {
    const adjacentFiles = [file - 1, file + 1].filter(f => f >= 0 && f < 8);

    for (const adjFile of adjacentFiles) {
      // White pawn break: a White pawn on the adjacent file at White's pawn rank
      // can capture diagonally into the locked file's Black pawn
      const whitePawnBreakSq = whiteRank * 8 + adjFile;
      const wp = board.getPiece(whitePawnBreakSq);
      if (wp && wp.type === PieceType.Pawn && wp.color === Color.White) {
        return true;
      }

      // Black pawn break: a Black pawn on the adjacent file at Black's pawn rank
      // can capture diagonally into the locked file's White pawn
      const blackPawnBreakSq = blackRank * 8 + adjFile;
      const bp = board.getPiece(blackPawnBreakSq);
      if (bp && bp.type === PieceType.Pawn && bp.color === Color.Black) {
        return true;
      }
    }

    return false;
  }

  /**
   * Utility: return the raw number of locked files for use by other systems
   * (e.g., TimeManager complexity heuristic, Variance Minimization).
   *
   * @param board - Current board state
   * @returns Number of locked files (0-8)
   */
  getLockedFileCount(board: Board): number {
    return this.detectLockedFiles(board);
  }
}
