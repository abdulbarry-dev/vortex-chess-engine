/**
 * @file IterativeDeepening.ts
 * @description Iterative deepening search framework
 * 
 * Iterative deepening searches progressively deeper depths (1, 2, 3, ...)
 * until time runs out. Benefits:
 * 1. Better move ordering from shallow searches
 * 2. Time management (can stop anytime)
 * 3. Reliable within time constraints
 */

import { CHECKMATE_SCORE, TIME_BUFFER_MS } from '../constants/SearchConstants';
import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Move } from '../types/Move.types';
import { SearchResult } from '../types/Search.types';
import { AlphaBetaSearch } from './AlphaBeta';
import { MoveOrderer } from './MoveOrdering';
import { TranspositionTable } from './TranspositionTable';

/**
 * Iterative deepening framework
 * 
 * Progressively searches deeper until time limit reached.
 * Each iteration uses information from previous iterations
 * for better move ordering.
 */
export class IterativeDeepeningSearch {
  private readonly alphaBeta: AlphaBetaSearch;
  private readonly transpositionTable: TranspositionTable | null;
  private readonly moveOrderer: MoveOrderer;
  private startTime: number = 0;
  private timeLimitMs: number = Infinity;
  private stopped: boolean = false;

  constructor(
    alphaBeta: AlphaBetaSearch,
    transpositionTable: TranspositionTable | null,
    moveOrderer: MoveOrderer
  ) {
    this.alphaBeta = alphaBeta;
    this.transpositionTable = transpositionTable;
    this.moveOrderer = moveOrderer;
  }

  /**
   * Search with iterative deepening
   * 
   * @param board Current board state
   * @param state Current game state
   * @param maxDepth Maximum depth to search
   * @param timeLimitMs Time limit in milliseconds
   * @returns Best move and search result
   */
  search(
    board: Board,
    state: GameState,
    maxDepth: number,
    timeLimitMs: number = Infinity
  ): SearchResult {
    this.startTime = Date.now();
    this.timeLimitMs = timeLimitMs;
    this.stopped = false;

    let bestMove: Move | null = null;
    let bestScore = 0;
    let depth = 0;
    let totalNodes = 0;
    const pv: Move[] = [];

    // Clear killer moves for new search
    this.moveOrderer.clearKillers();

    // Increment TT age
    if (this.transpositionTable) {
      this.transpositionTable.incrementAge();
    }

    // Iteratively deepen
    for (depth = 1; depth <= maxDepth; depth++) {
      // Check if we should stop
      if (this.shouldStop(depth)) {
        depth--; // Last completed depth
        break;
      }

      // Set time limit for this iteration
      const remainingTime = this.timeLimitMs - (Date.now() - this.startTime);
      this.alphaBeta.setTimeLimit(remainingTime - TIME_BUFFER_MS);

      // Search at this depth
      const result = this.alphaBeta.searchRoot(board, state, depth);

      // Check if search was stopped early
      const elapsed = Date.now() - this.startTime;
      if (elapsed >= this.timeLimitMs - TIME_BUFFER_MS) {
        depth--; // Last completed depth
        break;
      }

      // Update best move
      bestMove = result.move;
      bestScore = result.score;

      // Get stats
      const stats = this.alphaBeta.getStats();
      totalNodes += stats.nodes;

      // Build PV (just the best move for now - full PV would use TT)
      pv.length = 0;
      if (bestMove) {
        pv.push(bestMove);
      }

      // Stop if we found a mate
      if (Math.abs(bestScore) > CHECKMATE_SCORE - 100) {
        break;
      }
    }

    const timeMs = Date.now() - this.startTime;

    // Determine if it's a mate
    const isMate = Math.abs(bestScore) > CHECKMATE_SCORE - 100;
    let mateIn: number | undefined;
    if (isMate) {
      const plies = CHECKMATE_SCORE - Math.abs(bestScore);
      mateIn = Math.ceil(plies / 2);
    }

    // Get final stats
    const finalStats = this.alphaBeta.getStats();
    finalStats.nodes = totalNodes; // Update with total from all iterations
    finalStats.nodesSearched = totalNodes;
    if (timeMs > 0) {
      finalStats.nodesPerSecond = Math.floor((totalNodes * 1000) / timeMs);
    }

    return {
      move: bestMove, // Alias for bestMove
      bestMove,
      score: bestScore,
      depth,
      nodes: totalNodes,
      timeMs,
      pv,
      isMate,
      mateIn,
      stats: finalStats,
    };
  }

  /**
   * Stop the search
   */
  stop(): void {
    this.stopped = true;
    this.alphaBeta.stop();
  }

  /**
   * Check if search should stop
   */
  private shouldStop(nextDepth: number): boolean {
    if (this.stopped) return true;

    const elapsed = Date.now() - this.startTime;
    const remaining = this.timeLimitMs - elapsed;

    // Stop if very little time remaining
    if (remaining < TIME_BUFFER_MS * 2) {
      return true;
    }

    // Estimate if we have time for next iteration
    // Simple heuristic: next iteration takes ~3x the time of current
    if (nextDepth > 1) {
      const avgTimePerDepth = elapsed / (nextDepth - 1);
      const estimatedNextTime = avgTimePerDepth * 3;
      if (estimatedNextTime > remaining) {
        return true;
      }
    }

    return false;
  }
}
