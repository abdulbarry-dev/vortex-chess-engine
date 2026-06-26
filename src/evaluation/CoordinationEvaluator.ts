/**
 * @file CoordinationEvaluator.ts
 * @description Evaluates the "Cluster Bonus" for pieces that compactly defend each other.
 * This encourages solid, prophylactic formations where pieces are not loose.
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color, PieceType } from '../core/Piece';
import { getAttackersOf } from '../move-generation/AttackDetector';
import { forEachBit } from '../bitboard/Bitboard';

export class CoordinationEvaluator {
  /**
   * Evaluate the cluster bonus
   * Returns score from white's perspective
   * 
   * @param board Current board state
   * @param state Current game state
   * @param isEndgame Whether position is endgame
   * @returns Coordination score in centipawns
   */
  evaluate(board: Board, _state: GameState, isEndgame: boolean): number {
    let score = 0;
    // Clustering is slightly less critical in endgame where pieces must become active and dispersed
    const weight = isEndgame ? 0.5 : 1.0;

    for (const [square, piece] of board.getAllPieces()) {
      const defendersBB = getAttackersOf(board, square, piece.color);
      let clusterScore = 0;

      forEachBit(defendersBB, (defenderSq) => {
        // Calculate Chebyshev distance
        const rank1 = Math.floor(square / 8);
        const file1 = square % 8;
        const rank2 = Math.floor(defenderSq / 8);
        const file2 = defenderSq % 8;
        const distance = Math.max(Math.abs(rank1 - rank2), Math.abs(file1 - file2));

        // Bonus is inversely proportional to distance to reward *compact* clusters
        if (distance === 1) clusterScore += 5;
        else if (distance === 2) clusterScore += 3;
        else if (distance === 3) clusterScore += 1;
      });

      // Scale by the defended piece's type
      // Defending minor pieces in a cluster is heavily rewarded to prevent tactical drops
      let pieceWeight = 1.0;
      if (piece.type === PieceType.Knight || piece.type === PieceType.Bishop) {
        pieceWeight = 2.0;
      } else if (piece.type === PieceType.Rook) {
        pieceWeight = 1.5;
      } else if (piece.type === PieceType.Queen) {
        pieceWeight = 1.0; 
      } else if (piece.type === PieceType.Pawn) {
        pieceWeight = 0.5;
      } else if (piece.type === PieceType.King) {
        pieceWeight = 0.5; // King safety handles king defense primarily
      }

      const finalBonus = clusterScore * pieceWeight;

      if (piece.color === Color.White) {
        score += finalBonus * weight;
      } else {
        score -= finalBonus * weight;
      }
    }
    
    return Math.round(score);
  }
}
