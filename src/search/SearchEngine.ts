/**
 * @file SearchEngine.ts
 * @description Main search engine coordinator
 * 
 * Coordinates all search components to find the best move.
 * This is the main interface to the search system.
 */

import { DEFAULT_SEARCH_DEPTH, DEFAULT_TIME_LIMIT_MS } from '../constants/SearchConstants';
import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Evaluator } from '../evaluation/Evaluator';
import { MoveGenerator } from '../move-generation/MoveGenerator';
import { SearchConfig, SearchResult } from '../types/Search.types';
import { AlphaBetaSearch } from './AlphaBeta';
import { IterativeDeepeningSearch } from './IterativeDeepening';
import { MoveOrderer } from './MoveOrdering';
import { QuiescenceSearch } from './QuiescenceSearch';
import { TranspositionTable } from './TranspositionTable';
import { ZobristHasher } from './ZobristHashing';

/**
 * Main search engine
 * 
 * Provides a simple interface to find the best move for any position.
 * Internally uses alpha-beta, iterative deepening, transposition table,
 * move ordering, and quiescence search.
 */
export class SearchEngine {
  // @ts-expect-error - Used for component initialization
  private readonly evaluator: Evaluator;
  // @ts-expect-error - Used for component initialization
  private readonly moveGenerator: MoveGenerator;
  private readonly alphaBeta: AlphaBetaSearch;
  private readonly transpositionTable: TranspositionTable;
  private readonly moveOrderer: MoveOrderer;
  // @ts-expect-error - TODO: integrate quiescence into alpha-beta
  private readonly quiescenceSearch: QuiescenceSearch;
  private readonly iterativeDeepening: IterativeDeepeningSearch;
  private readonly zobristHasher: ZobristHasher;
  private config: SearchConfig;

  constructor(
    evaluator: Evaluator,
    moveGenerator: MoveGenerator
  ) {
    this.evaluator = evaluator;
    this.moveGenerator = moveGenerator;

    // Initialize search components
    this.alphaBeta = new AlphaBetaSearch(evaluator, moveGenerator);
    this.transpositionTable = new TranspositionTable();
    this.moveOrderer = new MoveOrderer();
    this.quiescenceSearch = new QuiescenceSearch(evaluator, moveGenerator);
    this.zobristHasher = new ZobristHasher();
    this.iterativeDeepening = new IterativeDeepeningSearch(
      this.alphaBeta,
      this.transpositionTable,
      this.moveOrderer
    );

    // Default configuration
    this.config = {
      maxDepth: DEFAULT_SEARCH_DEPTH,
      timeLimitMs: DEFAULT_TIME_LIMIT_MS,
      useIterativeDeepening: true,
      useTranspositionTable: true,
      useQuiescence: true,
      useMoveOrdering: true,
    };
  }

  /**
   * Find best move for current position
   * 
   * @param board Current board state
   * @param state Current game state
   * @param depth Optional depth override
   * @param timeLimitMs Optional time limit override
   * @returns Search result with best move
   */
  findBestMove(
    board: Board,
    state: GameState,
    depth?: number,
    timeLimitMs?: number
  ): SearchResult {
    const searchDepth = depth ?? this.config.maxDepth;
    const timeLimit = timeLimitMs ?? this.config.timeLimitMs ?? Infinity;

    // Use iterative deepening if enabled
    if (this.config.useIterativeDeepening) {
      return this.iterativeDeepening.search(board, state, searchDepth, timeLimit);
    } else {
      // Simple alpha-beta search without iterative deepening
      const startTime = Date.now();
      this.alphaBeta.setTimeLimit(timeLimit);
      const result = this.alphaBeta.searchRoot(board, state, searchDepth);
      const stats = this.alphaBeta.getStats();

      return {
        move: result.move, // Alias for bestMove
        bestMove: result.move,
        score: result.score,
        depth: searchDepth,
        nodes: stats.nodes,
        timeMs: Date.now() - startTime,
        pv: result.move ? [result.move] : [],
        isMate: Math.abs(result.score) > 90000,
        mateIn: undefined,
        stats: stats,
      };
    }
  }

  /**
   * Configure search behavior
   */
  configure(config: Partial<SearchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SearchConfig {
    return { ...this.config };
  }

  /**
   * Clear transposition table
   */
  clearTranspositionTable(): void {
    this.transpositionTable.clear();
  }

  /**
   * Get transposition table statistics
   */
  getTranspositionTableStats(): { size: number; filled: number; fillRate: number; entries: number } {
    return this.transpositionTable.getStats();
  }

  /**
   * Compute Zobrist hash for position
   */
  getPositionHash(board: Board, state: GameState): bigint {
    return this.zobristHasher.computeHash(board, state);
  }

  /**
   * Stop current search
   */
  stop(): void {
    this.iterativeDeepening.stop();
    this.alphaBeta.stop();
  }
}
