/**
 * @file KingSafetyEvaluator.ts
 * @description Evaluate king safety
 */

import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';
import { Square, getFile, getRank } from '../core/Square';

/**
 * King safety scoring
 */
const PAWN_SHIELD_BONUS = 10; // Per pawn in front of king
const OPEN_FILE_NEAR_KING_PENALTY = -20; // Per open file near king
const SEMI_OPEN_FILE_NEAR_KING_PENALTY = -10; // Per semi-open file near king

/**
 * Evaluates king safety
 * Focuses on pawn shield and open files near king
 */
export class KingSafetyEvaluator {
  /**
   * Evaluate king safety
   * Returns score from white's perspective
   * 
   * @param board Current board state
   * @param isEndgame Whether position is endgame (king safety less important)
   * @returns King safety score in centipawns
   */
  evaluate(board: Board, isEndgame: boolean): number {
    // King safety is less important in endgame
    if (isEndgame) {
      return 0;
    }

    let score = 0;

    score += this.evaluateKingSafety(board, Color.White);
    score -= this.evaluateKingSafety(board, Color.Black);

    return score;
  }

  /**
   * Evaluate king safety for one color
   * 
   * @param board Current board state
   * @param color Color to evaluate
   * @returns King safety score (positive = safe)
   */
  private evaluateKingSafety(board: Board, color: Color): number {
    let score = 0;

    const kingSquare = this.findKing(board, color);
    if (kingSquare === null) return 0; // No king (shouldn't happen in legal position)

    // Evaluate pawn shield
    score += this.evaluatePawnShield(board, kingSquare, color);

    // Evaluate open files near king
    score += this.evaluateOpenFiles(board, kingSquare, color);

    return score;
  }

  /**
   * Find king position
   */
  private findKing(board: Board, color: Color): Square | null {
    for (const [square, piece] of board.getAllPieces()) {
      if (piece.type === PieceType.King && piece.color === color) {
        return square;
      }
    }
    return null;
  }

  /**
   * Evaluate pawn shield in front of king
   * Checks the three files around the king
   */
  private evaluatePawnShield(board: Board, kingSquare: Square, color: Color): number {
    const file = getFile(kingSquare);
    const rank = getRank(kingSquare);
    const direction = color === Color.White ? 1 : -1;

    let shieldScore = 0;

    // Check three files: king file and adjacent files
    const filesToCheck = [file - 1, file, file + 1].filter(f => f >= 0 && f < 8);

    for (const f of filesToCheck) {
      // Check one and two ranks in front of king
      for (let rankOffset = 1; rankOffset <= 2; rankOffset++) {
        const checkRank = rank + (direction * rankOffset);
        if (checkRank < 0 || checkRank > 7) continue;

        const checkSquare = checkRank * 8 + f;
        const piece = board.getPiece(checkSquare);

        if (piece && piece.type === PieceType.Pawn && piece.color === color) {
          // Bonus for pawn in shield, more for closer pawns
          shieldScore += PAWN_SHIELD_BONUS * (3 - rankOffset);
        }
      }
    }

    return shieldScore;
  }

  /**
   * Evaluate open and semi-open files near king
   * Open files are dangerous for king safety
   */
  private evaluateOpenFiles(board: Board, kingSquare: Square, color: Color): number {
    const file = getFile(kingSquare);
    let penalty = 0;

    // Check three files: king file and adjacent files
    const filesToCheck = [file - 1, file, file + 1].filter(f => f >= 0 && f < 8);

    for (const f of filesToCheck) {
      const fileStatus = this.getFileStatus(board, f, color);

      if (fileStatus === 'open') {
        penalty += OPEN_FILE_NEAR_KING_PENALTY;
      } else if (fileStatus === 'semi-open') {
        penalty += SEMI_OPEN_FILE_NEAR_KING_PENALTY;
      }
    }

    return penalty;
  }

  /**
   * Determine if a file is open, semi-open, or closed
   */
  private getFileStatus(board: Board, file: number, color: Color): 'open' | 'semi-open' | 'closed' {
    let hasFriendlyPawn = false;
    let hasEnemyPawn = false;
    const enemyColor = color === Color.White ? Color.Black : Color.White;

    // Check entire file
    for (let rank = 0; rank < 8; rank++) {
      const square = rank * 8 + file;
      const piece = board.getPiece(square);

      if (piece && piece.type === PieceType.Pawn) {
        if (piece.color === color) {
          hasFriendlyPawn = true;
        } else if (piece.color === enemyColor) {
          hasEnemyPawn = true;
        }
      }
    }

    if (!hasFriendlyPawn && !hasEnemyPawn) return 'open';
    if (!hasFriendlyPawn && hasEnemyPawn) return 'semi-open';
    return 'closed';
  }
}
