/**
 * @file NnueEvaluator.ts
 * @description Uses the incrementally updated Accumulator to compute position evaluation
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color } from '../core/Piece';
import { globalNetwork, HIDDEN_SIZE } from './Network';

export class NnueEvaluator {
  /**
   * Evaluates the board position using the neural network
   * @param board The current board (which holds the accumulator)
   * @param state The current game state
   * @returns Evaluation score from the perspective of the side to move
   */
  public evaluate(board: Board, state: GameState): number {
    const acc = board.getAccumulator();
    const hidden = state.currentPlayer === Color.White ? acc.white : acc.black;
    
    let sum = globalNetwork.outputBias;
    const outputWeights = globalNetwork.outputWeights;
    
    // In our simplified HalfKP-like network, we use a clipped ReLU
    // or just standard ReLU for the hidden layer.
    for (let i = 0; i < HIDDEN_SIZE; i++) {
      const activation = Math.max(0, hidden[i]!); // ReLU
      // Capped ReLU is often used in NNUE (e.g. SCReLU), but plain ReLU works for this toy implementation
      sum += activation * outputWeights[i]!;
    }

    return sum;
  }
}
