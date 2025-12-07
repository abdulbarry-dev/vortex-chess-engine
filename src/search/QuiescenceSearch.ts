/**
 * @file QuiescenceSearch.ts
 * @description Tactical extension search to avoid horizon effect
 * 
 * Quiescence search extends the main search by only considering
 * "noisy" moves (captures, checks, promotions) until a quiet position.
 * This prevents the engine from thinking a piece is "safe" when it's
 * actually about to be captured.
 */

import { MAX_QUIESCENCE_DEPTH } from '../constants/SearchConstants';
import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Evaluator } from '../evaluation/Evaluator';
import { MoveGenerator } from '../move-generation/MoveGenerator';
import { Move, MoveFlags } from '../types/Move.types';

/**
 * Quiescence search for tactical positions
 * 
 * Searches only captures and checks until a quiet position is reached.
 * Uses stand-pat pruning and delta pruning for efficiency.
 */
export class QuiescenceSearch {
  private readonly evaluator: Evaluator;
  private readonly moveGenerator: MoveGenerator;
  private nodes: number = 0;

  constructor(evaluator: Evaluator, moveGenerator: MoveGenerator) {
    this.evaluator = evaluator;
    this.moveGenerator = moveGenerator;
  }

  /**
   * Quiescence search
   * 
   * @param board Current board state
   * @param state Current game state
   * @param alpha Lower bound
   * @param beta Upper bound
   * @param depth Remaining quiescence depth
   * @returns Evaluation score
   */
  search(
    board: Board,
    state: GameState,
    alpha: number,
    beta: number,
    depth: number = 0
  ): number {
    this.nodes++;

    // Depth limit
    if (depth >= MAX_QUIESCENCE_DEPTH) {
      return this.evaluator.evaluate(board, state);
    }

    // Stand pat - evaluate current position
    const standPat = this.evaluator.evaluate(board, state);

    // Beta cutoff
    if (standPat >= beta) {
      return beta;
    }

    // Update alpha
    if (standPat > alpha) {
      alpha = standPat;
    }

    // Delta pruning - if we're so far behind that even capturing
    // the opponent's queen won't help, we can prune
    const DELTA_MARGIN = 900; // Queen value
    if (standPat + DELTA_MARGIN < alpha) {
      return alpha;
    }

    // Generate only tactical moves (captures, promotions)
    const captures = this.moveGenerator.generateCaptures(board, state);

    // Order captures by MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
    this.orderCaptures(captures);

    // Search captures
    for (const move of captures) {
      // SEE pruning - skip bad captures (TODO: implement SEE)
      // For now, search all captures

      // Make move (clone board and state)
      const boardCopy = board.clone();
      const stateCopy = state.clone();
      
      // Apply move manually
      boardCopy.setPiece(move.to, move.piece);
      boardCopy.setPiece(move.from, null);
      stateCopy.switchTurn();

      // Recursive quiescence search
      const score = -this.search(boardCopy, stateCopy, -beta, -alpha, depth + 1);

      // Beta cutoff
      if (score >= beta) {
        return beta;
      }

      // Update alpha
      if (score > alpha) {
        alpha = score;
      }
    }

    return alpha;
  }

  /**
   * Order captures by MVV-LVA
   */
  private orderCaptures(moves: Move[]): void {
    moves.sort((a, b) => {
      const scoreA = this.getCaptureScore(a);
      const scoreB = this.getCaptureScore(b);
      return scoreB - scoreA;
    });
  }

  /**
   * Get capture score for ordering
   */
  private getCaptureScore(move: Move): number {
    if (!(move.flags & MoveFlags.Capture) || !move.captured) {
      return 0;
    }

    // MVV-LVA: victim value * 10 - attacker value
    const victimValue = this.getPieceValue(move.captured.type);
    const attackerValue = this.getPieceValue(move.piece.type);
    return victimValue * 10 - attackerValue;
  }

  /**
   * Get piece value
   */
  private getPieceValue(type: number): number {
    const values = [0, 100, 320, 330, 500, 900, 0]; // P, N, B, R, Q, K
    return values[type] || 0;
  }

  /**
   * Get node count
   */
  getNodes(): number {
    return this.nodes;
  }

  /**
   * Reset node count
   */
  reset(): void {
    this.nodes = 0;
  }
}
