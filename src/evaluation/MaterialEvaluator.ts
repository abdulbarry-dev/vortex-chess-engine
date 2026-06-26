/**
 * @file MaterialEvaluator.ts
 * @description Evaluate material balance (piece values)
 */

import { PIECE_VALUES } from '../constants/PieceValues';
import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';

/**
 * Evaluates material balance between players
 * Most important evaluation component (~80-90% of evaluation)
 */
export class MaterialEvaluator {
  /**
   * Evaluate material balance
   * Returns score from white's perspective (positive = white advantage)
   * 
   * @param board Current board state
   * @returns Material score in centipawns
   */
  evaluate(board: Board): number {
    let score = 0;

    // Count all pieces and apply values
    for (let _square = 0; _square < 64; _square++) {
      const piece = board.getPiece(_square);
      if (!piece) continue;
      const value = this.getPieceValue(piece.type);
      score += piece.color === Color.White ? value : -value;
    }

    return score;
  }

  /**
   * Get the value of a piece type
   * 
   * @param type Piece type
   * @returns Value in centipawns
   */
  private getPieceValue(type: PieceType): number {
    return PIECE_VALUES[type];
  }

  /**
   * Count material for a specific color
   * 
   * @param board Current board state
   * @param color Color to count
   * @returns Total material value in centipawns
   */
  countMaterial(board: Board, color: Color): number {
    let material = 0;

    for (let _square = 0; _square < 64; _square++) {
      const piece = board.getPiece(_square);
      if (!piece) continue;
      if (piece.color === color) {
        material += this.getPieceValue(piece.type);
      }
    }

    return material;
  }

  /**
   * Get material difference
   * 
   * @param board Current board state
   * @returns Material advantage for white (positive) or black (negative)
   */
  getMaterialDifference(board: Board): number {
    return this.countMaterial(board, Color.White) - this.countMaterial(board, Color.Black);
  }
}
