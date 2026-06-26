/**
 * @file OverextensionEvaluator.ts
 * @description Evaluates whether a side has overextended its position,
 * typically by advancing pawns or pieces too far without adequate support.
 */

import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';
import { getRank } from '../core/Square';

const OVEREXTENDED_PAWN_PENALTY = -20;
const OVEREXTENDED_PIECE_PENALTY = -15;

export class OverextensionEvaluator {
  /**
   * Evaluate overextension.
   * Returns a score from white's perspective.
   * Positive score means Black is overextended (White benefits).
   * Negative score means White is overextended (Black benefits).
   * 
   * @param board Current board state
   * @returns Overextension score in centipawns
   */
  evaluate(board: Board): number {
    let score = 0;
    
    // Evaluate White's overextension (penalty for White, so we subtract)
    score -= this.evaluateColor(board, Color.White);
    
    // Evaluate Black's overextension (penalty for Black, so we add to White's score)
    score += this.evaluateColor(board, Color.Black);
    
    return score;
  }

  /**
   * Calculate the overextension penalty for a specific color.
   * A higher returned value means the color is MORE overextended.
   */
  public evaluateColor(board: Board, color: Color): number {
    let penalty = 0;
    
    // (Simplified for performance: we no longer use getAttackedSquares or getAttackersOf in leaf nodes)
    for (let square = 0; square < 64; square++) {
      const piece = board.getPiece(square);
      if (!piece) continue;
      if (piece.color !== color) continue;

      const rank = getRank(square);
      
      // Check if piece is advanced into enemy territory
      // White is advanced if rank >= 5 (ranks 6,7,8). Black if rank <= 2 (ranks 1,2,3)
      // Note: Ranks are 0-indexed (0-7).
      const isAdvanced = color === Color.White ? rank >= 5 : rank <= 2;
      
      if (!isAdvanced) continue;

      if (piece.type === PieceType.Pawn) {
        // Flank pawns (a, b, g, h files) pushed aggressively are highly brittle
        const file = square % 8;
        const isFlank = file < 2 || file > 5;
        const multiplier = isFlank ? 1.5 : 1.0;

        // Simply penalize very advanced pawns (they might be strong, but this is a defensive engine)
        penalty += Math.round(Math.abs(OVEREXTENDED_PAWN_PENALTY) * multiplier);
      } else if (piece.type !== PieceType.King) {
        // Penalize very advanced pieces
        penalty += Math.abs(OVEREXTENDED_PIECE_PENALTY);
      }
    }

    return penalty;
  }
}
