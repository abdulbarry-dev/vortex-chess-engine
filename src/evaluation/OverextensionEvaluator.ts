/**
 * @file OverextensionEvaluator.ts
 * @description Evaluates whether a side has overextended its position,
 * typically by advancing pawns or pieces too far without adequate support.
 */

import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';
import { getRank } from '../core/Square';
import { getAttackedSquares, getAttackersOf } from '../move-generation/AttackDetector';
import { popCount } from '../bitboard/Bitboard';

const OVEREXTENDED_PAWN_PENALTY = -20;
const BRITTLE_PAWN_PENALTY = -10; // New: pawn storm supported by only 1 piece
const OVEREXTENDED_PIECE_PENALTY = -15;
const BRITTLE_PIECE_PENALTY = -8;

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
    const enemyColor = color === Color.White ? Color.Black : Color.White;
    
    // Find all attacked squares by the enemy to check if advanced pieces are safe
    const enemyAttacks = getAttackedSquares(board, enemyColor);
    const friendlyAttacks = getAttackedSquares(board, color);

    for (const [square, piece] of board.getAllPieces()) {
      if (piece.color !== color) continue;

      const rank = getRank(square);
      
      // Check if piece is advanced into enemy territory
      // White is advanced if rank >= 4 (ranks 5,6,7,8). Black if rank <= 3 (ranks 1,2,3,4)
      const isAdvanced = color === Color.White ? rank >= 4 : rank <= 3;
      
      if (!isAdvanced) continue;

      const isAttackedByEnemy = (enemyAttacks & (1n << BigInt(square))) !== 0n;
      const isDefendedByUs = (friendlyAttacks & (1n << BigInt(square))) !== 0n;

      if (piece.type === PieceType.Pawn) {
        // Advanced pawn without friendly pawn/piece support
        if (!isDefendedByUs) {
          penalty += Math.abs(OVEREXTENDED_PAWN_PENALTY);
        } else {
          // Brittleness Evaluation: Check if the advanced pawn storm is brittle (supported by exactly 1 piece)
          const defenders = getAttackersOf(board, square, color);
          if (popCount(defenders) === 1) {
            penalty += Math.abs(BRITTLE_PAWN_PENALTY);
          }
        }
      } else if (piece.type !== PieceType.King) {
        // Advanced piece that is attacked by the enemy
        if (isAttackedByEnemy) {
          if (!isDefendedByUs) {
            penalty += Math.abs(OVEREXTENDED_PIECE_PENALTY);
          } else {
            // Brittleness Evaluation for pieces
            const defenders = getAttackersOf(board, square, color);
            if (popCount(defenders) === 1) {
              penalty += Math.abs(BRITTLE_PIECE_PENALTY);
            }
          }
        }
      }
    }

    return penalty;
  }
}
