/**
 * @file MobilityEvaluator.ts
 * @description Evaluate piece mobility (number of legal moves)
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color } from '../core/Piece';
import { MoveGenerator } from '../move-generation/MoveGenerator';

/**
 * Mobility bonus per legal move
 * Encourages piece activity and flexibility
 */
const MOBILITY_BONUS = 1;

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

    // Count moves for white
    const whiteMoves = this.countMoves(board, state, Color.White);
    score += whiteMoves * MOBILITY_BONUS * weight;

    // Count moves for black
    const blackMoves = this.countMoves(board, state, Color.Black);
    score -= blackMoves * MOBILITY_BONUS * weight;

    return Math.round(score);
  }

  /**
   * Count legal moves for a color
   * 
   * @param board Current board state
   * @param state Current game state
   * @param color Color to count moves for
   * @returns Number of legal moves
   */
  private countMoves(board: Board, state: GameState, color: Color): number {
    // Create temporary state with correct turn
    const tempState = state.clone();
    tempState.currentPlayer = color;

    const moves = this.moveGenerator.generateLegalMoves(board, tempState);
    return moves.length;
  }
}
