/**
 * @file AlphaBeta.ts
 * @description Alpha-beta pruning search algorithm with negamax framework
 */

import { CHECKMATE_SCORE, MAX_SEARCH_DEPTH } from '../constants/SearchConstants';
import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Evaluator } from '../evaluation/Evaluator';
import { isInCheck } from '../move-generation/LegalityChecker';
import { MoveGenerator } from '../move-generation/MoveGenerator';
import { Move } from '../types/Move.types';
import { SearchStats } from '../types/Search.types';

/**
 * Alpha-beta pruning search with negamax
 * 
 * Negamax is a variant of minimax that simplifies implementation by
 * using the fact that max(a,b) = -min(-a,-b)
 */
export class AlphaBetaSearch {
  private readonly evaluator: Evaluator;
  private readonly moveGenerator: MoveGenerator;
  private stats: SearchStats;
  private startTime: number = 0;
  private timeLimitMs: number = Infinity;
  private stopped: boolean = false;

  constructor(
    evaluator: Evaluator,
    moveGenerator: MoveGenerator
  ) {
    this.evaluator = evaluator;
    this.moveGenerator = moveGenerator;
    this.stats = this.createEmptyStats();
  }

  /**
   * Search from root position
   * 
   * @param board Current board state
   * @param state Current game state
   * @param depth Maximum search depth
   * @param alpha Lower bound
   * @param beta Upper bound
   * @returns Best move and score
   */
  searchRoot(
    board: Board,
    state: GameState,
    depth: number,
    alpha: number = -Infinity,
    beta: number = Infinity
  ): { move: Move | null; score: number } {
    this.resetStats();
    this.startTime = Date.now();

    const moves = this.moveGenerator.generateLegalMoves(board, state);

    if (moves.length === 0) {
      // No legal moves - checkmate or stalemate
      const inCheck = isInCheck(board, state.currentPlayer);
      return {
        move: null,
        score: inCheck ? -CHECKMATE_SCORE : 0,
      };
    }

    let bestMove: Move | null = null;
    let bestScore = -Infinity;

    // Search each move
    for (const move of moves) {
      if (this.shouldStop()) break;

      // Make move (clone board and state)
      const boardCopy = board.clone();
      const stateCopy = state.clone();
      
      // Apply move manually
      boardCopy.setPiece(move.to, move.piece);
      boardCopy.setPiece(move.from, null);
      stateCopy.switchTurn();

      // Search
      const score = -this.search(boardCopy, stateCopy, depth - 1, -beta, -alpha, 1);

      // Update best
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }

      // Update alpha
      if (score > alpha) {
        alpha = score;
      }

      // Beta cutoff
      if (alpha >= beta) {
        this.stats.betaCutoffs++;
        break;
      }
    }

    return { move: bestMove, score: bestScore };
  }

  /**
   * Main alpha-beta search with negamax
   * 
   * @param board Current board state
   * @param state Current game state
   * @param depth Remaining search depth
   * @param alpha Lower bound
   * @param beta Upper bound
   * @param ply Distance from root
   * @returns Best score from this position
   */
  search(
    board: Board,
    state: GameState,
    depth: number,
    alpha: number,
    beta: number,
    ply: number
  ): number {
    // Update stats
    this.stats.nodes++;
    if (!this.stats.nodesByDepth[ply]) {
      this.stats.nodesByDepth[ply] = 0;
    }
    this.stats.nodesByDepth[ply]++;

    // Check time limit
    if (this.shouldStop()) {
      return 0;
    }

    // Check depth limit
    if (depth <= 0) {
      // TODO: Call quiescence search here in future
      return this.evaluator.evaluate(board, state);
    }

    // Check maximum depth
    if (ply >= MAX_SEARCH_DEPTH) {
      return this.evaluator.evaluate(board, state);
    }

    // Null Move Pruning (NMP)
    // If we can pass (do nothing) and still cause beta cutoff, position is too good
    const canDoNullMove = depth >= 3 && !isInCheck(board, state.currentPlayer) && ply > 0;
    if (canDoNullMove) {
      // Make null move (just switch turns)
      const stateCopy = state.clone();
      stateCopy.switchTurn();
      
      // Search with reduced depth (R=2)
      const nullScore = -this.search(board, stateCopy, depth - 3, -beta, -beta + 1, ply + 1);
      
      // If null move causes cutoff, prune this branch
      if (nullScore >= beta) {
        return beta; // Fail-high
      }
    }

    // Generate legal moves
    const moves = this.moveGenerator.generateLegalMoves(board, state);

    // No legal moves - checkmate or stalemate
    if (moves.length === 0) {
      const inCheck = isInCheck(board, state.currentPlayer);
      if (inCheck) {
        // Checkmate - prefer shorter mates
        return -CHECKMATE_SCORE + ply;
      } else {
        // Stalemate
        return 0;
      }
    }

    let bestScore = -Infinity;
    let moveCount = 0;

    // Search each move
    for (const move of moves) {
      moveCount++;
      
      // Make move (clone board and state)
      const boardCopy = board.clone();
      const stateCopy = state.clone();
      
      // Apply move manually
      boardCopy.setPiece(move.to, move.piece);
      boardCopy.setPiece(move.from, null);
      stateCopy.switchTurn();

      let score: number;

      // Late Move Reductions (LMR)
      // Search later moves with reduced depth first
      const canReduceDepth = 
        depth >= 3 &&
        moveCount > 4 &&
        !move.captured &&
        !move.promotion &&
        !isInCheck(boardCopy, stateCopy.currentPlayer);

      if (canReduceDepth) {
        // Search with reduced depth first
        const reduction = moveCount > 8 ? 2 : 1;
        score = -this.search(boardCopy, stateCopy, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1);
        
        // If reduced search failed high, re-search at full depth
        if (score > alpha) {
          score = -this.search(boardCopy, stateCopy, depth - 1, -beta, -alpha, ply + 1);
        }
      } else {
        // Normal search at full depth
        score = -this.search(boardCopy, stateCopy, depth - 1, -beta, -alpha, ply + 1);
      }

      // Update best score
      if (score > bestScore) {
        bestScore = score;
      }

      // Update alpha
      if (score > alpha) {
        alpha = score;
      }

      // Beta cutoff (pruning)
      if (alpha >= beta) {
        this.stats.betaCutoffs++;
        break;
      }
    }

    return bestScore;
  }

  /**
   * Set time limit for search
   */
  setTimeLimit(timeLimitMs: number): void {
    this.timeLimitMs = timeLimitMs;
  }

  /**
   * Stop search
   */
  stop(): void {
    this.stopped = true;
  }

  /**
   * Check if search should stop
   */
  private shouldStop(): boolean {
    if (this.stopped) return true;
    
    const elapsed = Date.now() - this.startTime;
    return elapsed >= this.timeLimitMs;
  }

  /**
   * Get search statistics
   */
  getStats(): SearchStats {
    const elapsed = Date.now() - this.startTime;
    return {
      ...this.stats,
      nodesSearched: this.stats.nodes,
      timeMs: elapsed,
      nodesPerSecond: elapsed > 0 ? Math.floor((this.stats.nodes * 1000) / elapsed) : 0,
    };
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = this.createEmptyStats();
    this.stopped = false;
  }

  /**
   * Create empty statistics object
   */
  private createEmptyStats(): SearchStats {
    return {
      nodes: 0,
      nodesSearched: 0,
      nodesByDepth: [],
      ttHits: 0,
      ttMisses: 0,
      betaCutoffs: 0,
      quiescenceNodes: 0,
      timeMs: 0,
      nodesPerSecond: 0,
    };
  }
}
