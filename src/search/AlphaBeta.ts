/**
 * @file AlphaBeta.ts
 * @description Alpha-beta pruning search algorithm with negamax framework
 */

import { CHECKMATE_SCORE, MAX_SEARCH_DEPTH } from '../constants/SearchConstants';
import { PieceType } from '../core/Piece';
import { Move, MoveFlags } from '../types/Move.types';
import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Evaluator } from '../evaluation/Evaluator';
import { isInCheck, isMoveLegal } from '../move-generation/LegalityChecker';
import { MoveGenerator } from '../move-generation/MoveGenerator';
import { SearchStats, TTEntryType } from '../types/Search.types';
import { MoveExecutor } from '../core/MoveExecutor';

import { MovePicker } from './MovePicker';
import { MoveOrderer } from './MoveOrdering';
import { TranspositionTable } from './TranspositionTable';
import { ZobristHasher } from './ZobristHashing';
import { NullMovePruning } from './NullMovePruning';

/**
 * Alpha-beta pruning search with negamax
 * 
 * Negamax is a variant of minimax that simplifies implementation by
 * using the fact that max(a,b) = -min(-a,-b)
 */
export class AlphaBetaSearch {
  private readonly evaluator: Evaluator;
  private readonly moveGenerator: MoveGenerator;
  private readonly moveOrderer: MoveOrderer;
  private transpositionTable: TranspositionTable | null;
  private zobristHasher: ZobristHasher | null;
  private readonly nullMovePruning: NullMovePruning;
  private stats: SearchStats;
  private startTime: number = 0;
  private timeLimitMs: number = Infinity;
  private stopped: boolean = false;
  private currentVolatility: number = 0;

  constructor(
    evaluator: Evaluator,
    moveGenerator: MoveGenerator,
    moveOrderer: MoveOrderer = new MoveOrderer(),
    transpositionTable: TranspositionTable | null = null,
    zobristHasher: ZobristHasher | null = null
  ) {
    this.evaluator = evaluator;
    this.moveGenerator = moveGenerator;
    this.moveOrderer = moveOrderer;
    this.transpositionTable = transpositionTable;
    this.zobristHasher = zobristHasher;
    this.nullMovePruning = new NullMovePruning();
    this.stats = this.createEmptyStats();
  }

  setTranspositionTable(tt: TranspositionTable, hasher: ZobristHasher) {
    this.transpositionTable = tt;
    this.zobristHasher = hasher;
  }

  setVolatility(volatility: number) {
    this.currentVolatility = volatility;
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

    const movePicker = new MovePicker(board, state, this.moveGenerator, this.moveOrderer, null, 0);

    let bestMove: Move | null = null;
    let bestScore = -Infinity;
    let legalMovesFound = 0;

    let move = movePicker.nextMove();
    while (move !== null) {
      // Ensure pseudo-legal move is actually legal
      if (!isMoveLegal(board, state, move)) {
        move = movePicker.nextMove();
        continue;
      }
      legalMovesFound++;
      
      // Fallback to the first legal move in case we stop immediately
      if (bestMove === null) {
        bestMove = move;
      }
      
      if (this.shouldStop()) break;

      // Make move in place
      const history = MoveExecutor.makeMove(board, state, move);

      // Search
      const score = -this.search(board, state, depth - 1, -beta, -alpha, 1);
      
      // Unmake move
      MoveExecutor.unmakeMove(board, state, history);

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
      
      move = movePicker.nextMove();
    }

    if (legalMovesFound === 0) {
      // No legal moves - checkmate or stalemate
      const inCheck = isInCheck(board, state.currentPlayer);
      return {
        move: null,
        score: inCheck ? -CHECKMATE_SCORE : 0,
      };
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
      return this.quiescenceSearch(board, state, alpha, beta, ply);
    }

    // Check maximum depth
    if (ply >= MAX_SEARCH_DEPTH) {
      return this.evaluator.evaluate(board, state, this.currentVolatility) * state.currentPlayer;
    }

    // Transposition Table Probe
    const originalAlpha = alpha;
    let hash = 0n;
    let hashMove: Move | null = null;
    
    if (this.transpositionTable && this.zobristHasher) {
      hash = this.zobristHasher.computeHash(board, state);
      const ttEntry = this.transpositionTable.probe(hash);
      
      if (ttEntry) {
        const score = this.transpositionTable.getScore(ttEntry, depth, alpha, beta);
        if (score !== null) {
          return score;
        }
        
        if (ttEntry.bestMove) {
          hashMove = ttEntry.bestMove;
        }
      }
    }

    // Null Move Pruning (NMP)
    // If we can pass (do nothing) and still cause beta cutoff, position is too good
    let threatMove: Move | null = null;
    const inCheck = isInCheck(board, state.currentPlayer);
    const canDoNullMove = this.nullMovePruning.shouldTryNullMove(board, state, depth, beta, inCheck, false);
    
    // Cache static eval to avoid redundant expensive calls
    let staticEval: number | null = null;
    
    if (canDoNullMove) {
      this.nullMovePruning.recordAttempt();
      
      // Make null move (just switch turns and clear ep)
      const epSquare = state.enPassantSquare;
      state.enPassantSquare = null;
      state.switchTurn();
      
      const reduction = this.nullMovePruning.getReduction(depth);
      
      // Search with reduced depth
      const nullScore = -this.search(board, state, depth - 1 - reduction, -beta, -beta + 1, ply + 1);
      
      // Extract threat move BEFORE unmaking null move so hash is correct
      if (nullScore < beta && this.transpositionTable && this.zobristHasher) {
        threatMove = this.nullMovePruning.extractThreat(board, state, this.transpositionTable, this.zobristHasher);
      }
      
      // Unmake null move
      state.switchTurn();
      state.enPassantSquare = epSquare;
      
      // Explicit Threat Forecasting: Only consider it a threat if the score drops massively
      if (threatMove !== null) {
        if (staticEval === null) {
          staticEval = this.evaluator.evaluate(board, state, this.currentVolatility) * state.currentPlayer;
        }
        if (staticEval - nullScore < 200) {
          // The threat is not severe enough to warrant expensive prophylactic extensions
          threatMove = null; 
        }
      }
      
      // If null move causes cutoff, prune this branch
      if (nullScore >= beta) {
        this.nullMovePruning.recordCutoff();
        return beta; // Fail-high
      }
    }

    // Futility Pruning
    // If static evaluation is significantly below alpha, quiet moves are unlikely to raise alpha
    let futilityPruningActive = false;
    let futilityMargin = 0;
    
    if (depth <= 3 && !inCheck && Math.abs(alpha) < CHECKMATE_SCORE - 100) {
      if (staticEval === null) {
        staticEval = this.evaluator.evaluate(board, state, this.currentVolatility) * state.currentPlayer;
      }
      futilityMargin = depth * 200; // 200, 400, 600 margin depending on depth
      
      if (staticEval + futilityMargin <= alpha) {
        futilityPruningActive = true;
      }
    }

    const movePicker = new MovePicker(board, state, this.moveGenerator, this.moveOrderer, hashMove, ply, threatMove);

    let bestScore = -Infinity;
    let bestMove: Move | null = null;
    let moveCount = 0;
    let legalMovesFound = 0;

    // Track move clusters for Plan-Based Search (SCT)
    const clusterBestScores = new Map<number, number>();
    const clusterCounts = new Map<number, number>();

    // Helper to determine the strategic cluster of a move
    // Groups by piece type and kingside/queenside/center
    const getMoveCluster = (m: Move): number => {
      const file = m.to % 8;
      let region = 0; // Center (files c, d, e, f)
      if (file < 2) region = 1; // Queenside (files a, b)
      else if (file > 5) region = 2; // Kingside (files g, h)
      return (m.piece.type << 4) | region;
    };

    let move = movePicker.nextMove();
    while (move !== null) {
      // Futility pruning: skip quiet moves if condition is met
      if (futilityPruningActive && legalMovesFound > 0 && !move.captured && !move.promotion) {
        move = movePicker.nextMove();
        continue;
      }

      // Ensure pseudo-legal move is actually legal
      if (!isMoveLegal(board, state, move)) {
        move = movePicker.nextMove();
        continue;
      }
      legalMovesFound++;
      moveCount++;
      
      // Check if move is prophylactic
      let isProphylactic = false;
      let extension = 0;

      if (threatMove !== null) {
        isProphylactic = (move.to === threatMove.to || move.to === threatMove.from || move.captured !== undefined);
        
        if (isProphylactic && depth < MAX_SEARCH_DEPTH - 1) {
          extension = 1; // Prophylactic Extension
          
          // Evaluate if the threat move is a dangerous attack near our king
          const ourKingSquare = board.findKing(state.currentPlayer);
          if (ourKingSquare !== null) {
            const kingFile = ourKingSquare % 8;
            const kingRank = Math.floor(ourKingSquare / 8);
            const threatFile = threatMove.to % 8;
            const threatRank = Math.floor(threatMove.to / 8);
            const distance = Math.max(Math.abs(kingFile - threatFile), Math.abs(kingRank - threatRank));
            
            if (distance <= 2 && depth < MAX_SEARCH_DEPTH - 2) {
              extension = 2; // Dangerous Threat Extension - look even deeper to defend the king
            }
          }
        }
      }
      
      // Check for defensive structure moves
      let isDefensiveRetreat = false;
      if (!(move.flags & MoveFlags.Capture) && move.piece.type !== PieceType.Pawn && move.piece.type !== PieceType.King) {
        const kingSq = board.findKing(state.currentPlayer);
        if (kingSq !== null) {
          const kingRank = Math.floor(kingSq / 8);
          const kingFile = kingSq % 8;
          const toRank = Math.floor(move.to / 8);
          const toFile = move.to % 8;
          if (Math.abs(kingRank - toRank) <= 2 && Math.abs(kingFile - toFile) <= 2) {
            isDefensiveRetreat = true;
          }
        }
      }

      // Defensive Search Depth Adaptation
      if (staticEval === null && depth >= 3) {
        staticEval = this.evaluator.evaluate(board, state, this.currentVolatility) * state.currentPlayer;
      }
      
      let isStructuralSacrifice = false;
      if (staticEval !== null && staticEval < -50) {
        if (isDefensiveRetreat && depth < MAX_SEARCH_DEPTH - 1) {
          extension = Math.max(extension, 1); // Extra ply to verify defense holds
        } else if ((move.flags & MoveFlags.Capture)) {
          // Reduce depth slightly for captures when defending (more likely to be mistakes)
          isStructuralSacrifice = true;
          extension -= 1; // Direct depth reduction for structural sacrifices
        }
      }

      // Make move in place
      const history = MoveExecutor.makeMove(board, state, move);

      // Check if move gives check (now that the move is made, opponent is in check if currentPlayer is in check)
      const givesCheck = isInCheck(board, state.currentPlayer);
      if (givesCheck && depth < MAX_SEARCH_DEPTH - 1) {
        extension = Math.max(extension, 1);
      }

      let score: number;

      // Late Move Reductions (LMR)
      // Search later moves with reduced depth first
      const canReduceDepth = 
        depth >= 3 &&
        moveCount > 4 &&
        !move.captured &&
        !move.promotion &&
        !givesCheck && // Do not reduce if it gives check
        !isProphylactic; // Do not reduce prophylactic moves

      if (canReduceDepth) {
        // Plan-Based Search: Cluster penalty
        // If the first move of this cluster (the representative) didn't raise alpha,
        // we penalize subsequent moves in the same cluster with an extra reduction.
        const cluster = getMoveCluster(move);
        const countInCluster = clusterCounts.get(cluster) || 0;
        const bestInCluster = clusterBestScores.get(cluster) || -Infinity;
        
        clusterCounts.set(cluster, countInCluster + 1);
        
        let clusterPenalty = 0;
        if (countInCluster > 0 && bestInCluster <= alpha) {
          clusterPenalty = 1; // The strategic plan failed, reduce other implementations
        }

        // Search with reduced depth first
        let defensiveReduction = isStructuralSacrifice ? 1 : 0;
        const reduction = (moveCount > 8 ? 2 : 1) + clusterPenalty + defensiveReduction;
        score = -this.search(board, state, depth - 1 + extension - reduction, -alpha - 1, -alpha, ply + 1);
        
        // If reduced search failed high, re-search at full depth
        if (score > alpha) {
          score = -this.search(board, state, depth - 1 + extension, -beta, -alpha, ply + 1);
        }
      } else {
        // Normal search at full depth
        score = -this.search(board, state, depth - 1 + extension, -beta, -alpha, ply + 1);
      }

      // Update cluster best score
      if (!move.captured && !move.promotion) {
        const cluster = getMoveCluster(move);
        const currentClusterBest = clusterBestScores.get(cluster) || -Infinity;
        if (score > currentClusterBest) {
          clusterBestScores.set(cluster, score);
        }
      }

      // Unmake move in place
      MoveExecutor.unmakeMove(board, state, history);

      // Update best score
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }

      // Update alpha
      if (score > alpha) {
        alpha = score;
      }

      // Beta cutoff (pruning)
      if (alpha >= beta) {
        this.stats.betaCutoffs++;
        // Add to killers and history (if quiet move)
        if (!move.captured && !move.promotion) {
          this.moveOrderer.addKillerMove(move, ply);
          this.moveOrderer.addHistoryMove(move, depth);
        }
        break;
      }
      
      move = movePicker.nextMove();
    }

    if (legalMovesFound === 0) {
      // No legal moves - checkmate or stalemate
      const inCheck = isInCheck(board, state.currentPlayer);
      if (inCheck) {
        // Checkmate - prefer shorter mates
        return -CHECKMATE_SCORE + ply;
      } else {
        // Stalemate
        return 0;
      }
    }

    // Store to Transposition Table
    if (this.transpositionTable && hash !== 0n) {
      let ttType = TTEntryType.Exact;
      if (bestScore <= originalAlpha) {
        ttType = TTEntryType.Alpha;
      } else if (bestScore >= beta) {
        ttType = TTEntryType.Beta;
      }
      this.transpositionTable.store(hash, depth, bestScore, ttType, bestMove);
    }

    return bestScore;
  }

  /**
   * Quiescence search to resolve captures and avoid horizon effect
   */
  private quiescenceSearch(
    board: Board,
    state: GameState,
    alpha: number,
    beta: number,
    ply: number
  ): number {
    this.stats.nodes++;
    
    // Check limits
    if (this.shouldStop() || ply >= MAX_SEARCH_DEPTH) {
      return this.evaluator.evaluate(board, state, this.currentVolatility) * state.currentPlayer;
    }
    
    // Stand pat score
    const standPat = this.evaluator.evaluate(board, state, this.currentVolatility) * state.currentPlayer;
    if (standPat >= beta) {
      return beta; // Fail-hard beta cutoff
    }
    if (standPat > alpha) {
      alpha = standPat;
    }
    
    // Delta Pruning
    // If standPat + value of Queen + margin < alpha, we can't possibly raise alpha
    const BIG_DELTA = 900 + 200; // Queen value + safety margin
    if (standPat + BIG_DELTA < alpha) {
      return alpha;
    }
    
    // Transposition Table Probe
    let hash = 0n;
    let hashMove: Move | null = null;
    
    if (this.transpositionTable && this.zobristHasher) {
      hash = this.zobristHasher.computeHash(board, state);
      const ttEntry = this.transpositionTable.probe(hash);
      
      if (ttEntry) {
        // We only use exact scores in QS, or bounds if they cause a cutoff
        // Note: depth is essentially 0 for QS
        const ttScore = this.transpositionTable.getScore(ttEntry, 0, alpha, beta);
        if (ttScore !== null) {
          return ttScore;
        }
        
        if (ttEntry.bestMove) {
          hashMove = ttEntry.bestMove;
        }
      }
    }

    const movePicker = new MovePicker(board, state, this.moveGenerator, this.moveOrderer, hashMove, ply, null, true);
    
    let move = movePicker.nextMove();
    let bestScore = alpha;
    let bestMove: Move | null = null;
    const originalAlpha = alpha;

    while (move !== null) {
      // Ensure pseudo-legal move is actually legal
      if (!isMoveLegal(board, state, move)) {
        move = movePicker.nextMove();
        continue;
      }
      
      // Make move in place
      const history = MoveExecutor.makeMove(board, state, move);
      
      const score = -this.quiescenceSearch(board, state, -beta, -alpha, ply + 1);
      
      // Unmake move in place
      MoveExecutor.unmakeMove(board, state, history);
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
        if (score > alpha) {
          alpha = score;
        }
      }
      
      if (alpha >= beta) {
        this.stats.betaCutoffs++;
        break;
      }
      
      move = movePicker.nextMove();
    }
    
    // Store QS result in TT (depth 0)
    if (this.transpositionTable && hash !== 0n) {
      let ttType = TTEntryType.Exact;
      if (bestScore <= originalAlpha) {
        ttType = TTEntryType.Alpha;
      } else if (bestScore >= beta) {
        ttType = TTEntryType.Beta;
      }
      this.transpositionTable.store(hash, 0, bestScore, ttType, bestMove);
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
   * Check if the search was stopped early (e.g. due to time limit)
   */
  hasStopped(): boolean {
    return this.shouldStop();
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
