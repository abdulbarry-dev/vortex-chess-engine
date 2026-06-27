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
  PROPHYLACTIC_MOVE_SCORE,
  QUIET_DEFENSE_SCORE,
} from '../constants/SearchConstants';
import { staticExchangeEvaluation } from './StaticExchangeEvaluation';
import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';
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
  private historyTable: number[][][]; // [color][from][to]
  private readonly maxPly: number = 64;

  constructor() {
    // Initialize killer moves array (2 killers per ply)
    this.killerMoves = Array.from({ length: this.maxPly }, () => []);
    
    // Initialize history table [color(0-1)][from(0-63)][to(0-63)]
    this.historyTable = [
      Array.from({ length: 64 }, () => new Array(64).fill(0)), // White (we will map 1 to 0)
      Array.from({ length: 64 }, () => new Array(64).fill(0)), // Black (we will map -1 to 1)
    ];
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
    ply: number = 0,
    threatMove: Move | null = null
  ): Move[] {
    // Score each move
    const scoredMoves = moves.map(move => ({
      move,
      score: this.scoreMove(move, board, hashMove, ply, threatMove),
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
    board: Board,
    hashMove: Move | null,
    ply: number,
    threatMove: Move | null
  ): number {
    // 1. Hash move (from TT) - highest priority
    if (hashMove && this.movesEqual(move, hashMove)) {
      return HASH_MOVE_SCORE;
    }

    // 1.5 Prophylactic moves
    if (threatMove && (move.to === threatMove.to || move.to === threatMove.from || move.captured !== undefined)) {
      return PROPHYLACTIC_MOVE_SCORE;
    }

    // 2. Captures - SEE + MVV-LVA
    if (move.flags & MoveFlags.Capture && move.captured) {
      const seeScore = staticExchangeEvaluation(board, move);
      if (seeScore < 0) {
        // Losing capture, lower priority than quiet moves
        return seeScore;
      }
      const victimValue = this.getPieceValue(move.captured.type);
      const attackerValue = this.getPieceValue(move.piece.type);
      return MVV_LVA_OFFSET + seeScore + (victimValue * 10 - attackerValue);
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

    // 5.5 Defensive Prophylaxis (Quiet Move Priority)
    // Reward quiet moves that retreat or maneuver pieces into the King's defensive zone.
    // Finding these prophylactic consolidation moves early improves alpha-beta cutoffs when defending.
    if (!(move.flags & MoveFlags.Capture) && move.piece.type !== PieceType.Pawn && move.piece.type !== PieceType.King) {
      const kingSq = board.findKing(move.piece.color);
      if (kingSq !== null) {
        const kingRank = Math.floor(kingSq / 8);
        const kingFile = kingSq % 8;
        const toRank = Math.floor(move.to / 8);
        const toFile = move.to % 8;
        
        // If the piece lands in the 5x5 zone around the king
        if (Math.abs(kingRank - toRank) <= 2 && Math.abs(kingFile - toFile) <= 2) {
            return QUIET_DEFENSE_SCORE;
        }
      }
    }

    // 6. Quiet moves - history heuristic
    const colorIndex = move.piece.color === Color.White ? 0 : 1;
    return this.historyTable[colorIndex]![move.from]![move.to]!;
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
   * Add a history move (quiet move caused beta cutoff)
   */
  addHistoryMove(move: Move, depth: number): void {
    // Only apply to quiet moves
    if (move.flags & MoveFlags.Capture || move.flags & MoveFlags.Promotion) return;

    const colorIndex = move.piece.color === Color.White ? 0 : 1;
    
    // Increment history score by depth squared
    // Cap at a reasonable maximum to avoid overflow/extreme bias
    const bonus = depth * depth;
    const currentScore = this.historyTable[colorIndex]![move.from]![move.to] || 0;
    this.historyTable[colorIndex]![move.from]![move.to] = currentScore + bonus;
    
    // Scale down history periodically if it gets too large
    if (this.historyTable[colorIndex]![move.from]![move.to]! > 1000000) {
      for (let c = 0; c < 2; c++) {
        for (let f = 0; f < 64; f++) {
          for (let t = 0; t < 64; t++) {
            this.historyTable[c]![f]![t] = Math.floor(this.historyTable[c]![f]![t]! / 2);
          }
        }
      }
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
