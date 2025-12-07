/**
 * @file MoveOrdering.ts
 * @description Order moves to improve alpha-beta pruning efficiency
 * 
 * Good move ordering is critical for alpha-beta performance.
 * Best moves should be searched first to maximize cutoffs.
 */

import { PIECE_VALUES } from '../constants/PieceValues';
import {
  CASTLING_SCORE,
  HASH_MOVE_SCORE,
  KILLER_MOVE_SCORE,
  MVV_LVA_OFFSET,
  PROMOTION_SCORE,
} from '../constants/SearchConstants';
import { Board } from '../core/Board';
import { PieceType } from '../core/Piece';
import { Move, MoveFlags } from '../types/Move.types';

/**
 * Move ordering heuristics
 * 
 * Priority (highest to lowest):
 * 1. Hash move (from transposition table)
 * 2. Captures (MVV-LVA - Most Valuable Victim, Least Valuable Attacker)
 * 3. Killer moves (moves that caused beta cutoffs at same depth)
 * 4. Promotions
 * 5. Castling
 * 6. Other quiet moves (history heuristic in future)
 */
export class MoveOrderer {
  private killerMoves: Move[][];
  private readonly maxPly: number = 64;

  constructor() {
    // Initialize killer moves array (2 killers per ply)
    this.killerMoves = Array.from({ length: this.maxPly }, () => []);
  }

  /**
   * Order moves for better alpha-beta performance
   * 
   * @param moves Moves to order
   * @param board Current board state
   * @param hashMove Best move from transposition table
   * @param ply Current ply from root
   * @returns Ordered moves (best first)
   */
  orderMoves(
    moves: Move[],
    board: Board,
    hashMove: Move | null = null,
    ply: number = 0
  ): Move[] {
    // Score each move
    const scoredMoves = moves.map(move => ({
      move,
      score: this.scoreMove(move, board, hashMove, ply),
    }));

    // Sort by score (descending)
    scoredMoves.sort((a, b) => b.score - a.score);

    return scoredMoves.map(sm => sm.move);
  }

  /**
   * Score a single move for ordering
   * Higher score = search first
   */
  private scoreMove(
    move: Move,
    _board: Board, // Reserved for future SEE evaluation
    hashMove: Move | null,
    ply: number
  ): number {
    // 1. Hash move (from TT) - highest priority
    if (hashMove && this.movesEqual(move, hashMove)) {
      return HASH_MOVE_SCORE;
    }

    // 2. Captures - MVV-LVA
    if (move.flags & MoveFlags.Capture && move.captured) {
      const victimValue = this.getPieceValue(move.captured.type);
      const attackerValue = this.getPieceValue(move.piece.type);
      return MVV_LVA_OFFSET + victimValue * 10 - attackerValue;
    }

    // 3. Killer moves
    if (ply < this.maxPly && this.isKillerMove(move, ply)) {
      return KILLER_MOVE_SCORE;
    }

    // 4. Promotions
    if (move.flags & MoveFlags.Promotion) {
      return PROMOTION_SCORE + (move.promotion ? this.getPieceValue(move.promotion) : 0);
    }

    // 5. Castling
    if (move.flags & MoveFlags.Castle) {
      return CASTLING_SCORE;
    }

    // 6. Quiet moves - no special ordering (yet)
    return 0;
  }

  /**
   * Add a killer move (caused beta cutoff)
   */
  addKillerMove(move: Move, ply: number): void {
    if (ply >= this.maxPly) return;

    // Don't add captures as killers
    if (move.flags & MoveFlags.Capture) return;

    const killers = this.killerMoves[ply];
    if (!killers) return; // Safety check

    // Check if already a killer
    if (killers.some(k => this.movesEqual(k, move))) return;

    // Add to front, keep max 2 killers
    killers.unshift(move);
    if (killers.length > 2) {
      killers.pop();
    }
  }

  /**
   * Check if move is a killer move
   */
  private isKillerMove(move: Move, ply: number): boolean {
    if (ply >= this.maxPly) return false;
    const killers = this.killerMoves[ply];
    if (!killers) return false;
    return killers.some(k => this.movesEqual(k, move));
  }

  /**
   * Get piece value for MVV-LVA
   */
  private getPieceValue(type: PieceType): number {
    return PIECE_VALUES[type];
  }

  /**
   * Check if two moves are equal
   */
  private movesEqual(a: Move, b: Move): boolean {
    return a.from === b.from && a.to === b.to && a.promotion === b.promotion;
  }

  /**
   * Clear killer moves (e.g., for new search)
   */
  clearKillers(): void {
    this.killerMoves = Array.from({ length: this.maxPly }, () => []);
  }
}
