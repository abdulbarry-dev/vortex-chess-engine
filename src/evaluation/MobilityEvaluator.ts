/**
 * @file MobilityEvaluator.ts
 * @description Evaluate piece mobility (number of legal moves)
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color } from '../core/Piece';
import { MoveGenerator } from '../move-generation/MoveGenerator';
import { getAttackedSquares } from '../move-generation/AttackDetector';

/**
 * Mobility bonus per safe legal move
 * Encourages piece activity and flexibility
 */
const MOBILITY_BONUS = 2; // Increased to prioritize Strategic Entropy

/**
 * Evaluates piece mobility
 * More legal moves = better position (more options)
 */
export class MobilityEvaluator {
  private readonly moveGenerator: MoveGenerator;

  constructor(moveGenerator: MoveGenerator) {
    this.moveGenerator = moveGenerator;
  }

  /**
   * Evaluate mobility
   * Returns score from white's perspective
   * 
   * @param board Current board state
   * @param state Current game state
   * @param isEndgame Whether position is endgame
   * @returns Mobility score in centipawns
   */
  evaluate(board: Board, state: GameState, isEndgame: boolean): number {
    // Mobility is less important in endgame
    const weight = isEndgame ? 0.5 : 1.0;

    let score = 0;

    // Count safe moves for white
    const whiteMoves = this.countSafeMoves(board, state, Color.White);
    score += whiteMoves * MOBILITY_BONUS * weight;

    // Count safe moves for black
    const blackMoves = this.countSafeMoves(board, state, Color.Black);
    score -= blackMoves * MOBILITY_BONUS * weight;

    return Math.round(score);
  }

  /**
   * Count safe legal moves for a color (Strategic Entropy / Mobility Variance)
   * 
   * @param board Current board state
   * @param state Current game state
   * @param color Color to count moves for
   * @returns Number of safe legal moves
   */
  private countSafeMoves(board: Board, state: GameState, color: Color): number {
    // Temporarily switch turn
    const originalPlayer = state.currentPlayer;
    state.currentPlayer = color;

    const moves = this.moveGenerator.generateLegalMoves(board, state);
    const opponentColor = color === Color.White ? Color.Black : Color.White;
    const attackedSquares = getAttackedSquares(board, opponentColor);
    
    let safeMoves = 0;
    for (const move of moves) {
      if ((attackedSquares & (1n << BigInt(move.to))) === 0n) {
        safeMoves++;
      }
    }
    
    // Restore turn
    state.currentPlayer = originalPlayer;
    return safeMoves;
  }
}
