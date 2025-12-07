/**
 * @file PawnStructureEvaluator.ts
 * @description Evaluate pawn structure weaknesses and strengths
 */

import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';
import { Square, getFile, getRank } from '../core/Square';

/**
 * Penalties and bonuses for pawn structure
 */
const DOUBLED_PAWN_PENALTY = -10;
const ISOLATED_PAWN_PENALTY = -15;
const BACKWARD_PAWN_PENALTY = -8;
const PASSED_PAWN_BONUS = [0, 10, 20, 35, 60, 100, 150, 0]; // By rank (rank 0 and 7 unused)

/**
 * Evaluates pawn structure
 * Identifies weaknesses (doubled, isolated, backward) and strengths (passed pawns)
 */
export class PawnStructureEvaluator {
  /**
   * Evaluate pawn structure
   * Returns score from white's perspective
   * 
   * @param board Current board state
   * @returns Pawn structure score in centipawns
   */
  evaluate(board: Board): number {
    let score = 0;

    score += this.evaluateColor(board, Color.White);
    score -= this.evaluateColor(board, Color.Black);

    return score;
  }

  /**
   * Evaluate pawn structure for one color
   * 
   * @param board Current board state
   * @param color Color to evaluate
   * @returns Pawn structure score (positive = good)
   */
  private evaluateColor(board: Board, color: Color): number {
    let score = 0;
    const pawns = this.getPawns(board, color);

    // Analyze each pawn
    for (const square of pawns) {
      const file = getFile(square);

      // Check for doubled pawns
      if (this.isDoubled(pawns, square, file)) {
        score += DOUBLED_PAWN_PENALTY;
      }

      // Check for isolated pawns
      if (this.isIsolated(pawns, file)) {
        score += ISOLATED_PAWN_PENALTY;
      }

      // Check for backward pawns
      if (this.isBackward(pawns, board, square, color)) {
        score += BACKWARD_PAWN_PENALTY;
      }

      // Check for passed pawns
      if (this.isPassed(board, square, color)) {
        const rank = getRank(square);
        const adjustedRank = color === Color.White ? rank : 7 - rank;
        score += PASSED_PAWN_BONUS[adjustedRank] ?? 0;
      }
    }

    return score;
  }

  /**
   * Get all pawn positions for a color
   */
  private getPawns(board: Board, color: Color): Square[] {
    const pawns: Square[] = [];

    for (const [square, piece] of board.getAllPieces()) {
      if (piece.type === PieceType.Pawn && piece.color === color) {
        pawns.push(square);
      }
    }

    return pawns;
  }

  /**
   * Check if a pawn is doubled (another pawn on same file)
   */
  private isDoubled(pawns: Square[], square: Square, file: number): boolean {
    return pawns.some(otherSquare => {
      return otherSquare !== square && getFile(otherSquare) === file;
    });
  }

  /**
   * Check if a pawn is isolated (no friendly pawns on adjacent files)
   */
  private isIsolated(pawns: Square[], file: number): boolean {
    const adjacentFiles = [file - 1, file + 1].filter(f => f >= 0 && f < 8);

    return !pawns.some(square => {
      return adjacentFiles.includes(getFile(square));
    });
  }

  /**
   * Check if a pawn is backward
   * A pawn is backward if:
   * 1. It can't advance safely
   * 2. All friendly pawns on adjacent files are more advanced
   */
  private isBackward(pawns: Square[], _board: Board, square: Square, color: Color): boolean {
    const file = getFile(square);
    const rank = getRank(square);
    const direction = color === Color.White ? 1 : -1;

    // Check if advance square is attacked by enemy pawn
    const advanceSquare = square + (direction * 8);
    if (advanceSquare < 0 || advanceSquare > 63) return false;

    // Get friendly pawns on adjacent files
    const adjacentFiles = [file - 1, file + 1].filter(f => f >= 0 && f < 8);
    const adjacentPawns = pawns.filter(p => adjacentFiles.includes(getFile(p)));

    if (adjacentPawns.length === 0) return false; // Isolated pawns are handled separately

    // Check if all adjacent pawns are more advanced
    const allMoreAdvanced = adjacentPawns.every(pawn => {
      const pawnRank = getRank(pawn);
      return color === Color.White ? pawnRank > rank : pawnRank < rank;
    });

    return allMoreAdvanced;
  }

  /**
   * Check if a pawn is passed
   * A passed pawn has no enemy pawns blocking or controlling its path to promotion
   */
  private isPassed(board: Board, square: Square, color: Color): boolean {
    const file = getFile(square);
    const rank = getRank(square);
    const enemyColor = color === Color.White ? Color.Black : Color.White;

    // Check files: current file and adjacent files
    const filesToCheck = [file - 1, file, file + 1].filter(f => f >= 0 && f < 8);

    // Define ranks to check based on color
    const ranksToCheck = color === Color.White
      ? Array.from({ length: 8 - rank - 1 }, (_, i) => rank + i + 1) // Ranks ahead for white
      : Array.from({ length: rank }, (_, i) => rank - i - 1); // Ranks ahead for black

    // Check if any enemy pawn blocks or controls the path
    for (const [enemySquare, piece] of board.getAllPieces()) {
      if (piece.type === PieceType.Pawn && piece.color === enemyColor) {
        const enemyFile = getFile(enemySquare);
        const enemyRank = getRank(enemySquare);

        if (filesToCheck.includes(enemyFile) && ranksToCheck.includes(enemyRank)) {
          return false; // Blocked by enemy pawn
        }
      }
    }

    return true;
  }
}
