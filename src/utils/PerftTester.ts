/**
 * @file PerftTester.ts
 * @description Performance testing for move generation (Perft)
 * 
 * Perft (Performance Test) is the standard way to validate chess move generation.
 * It counts all possible moves to a given depth and compares against known values.
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { MoveGenerator } from '../move-generation/MoveGenerator';
import { Move, MoveFlags } from '../types/Move.types';
import { MoveExecutor } from '../core/MoveExecutor';

/**
 * Perft result with detailed breakdown
 */
export interface PerftResult {
  nodes: number;
  captures: number;
  enPassants: number;
  castles: number;
  promotions: number;
  checks: number;
  checkmates: number;
}

/**
 * Perft tester for move generation validation
 */
export class PerftTester {
  private moveGen: MoveGenerator;

  constructor() {
    this.moveGen = new MoveGenerator();
  }

  /**
   * Count all possible positions at a given depth
   * 
   * @param board Current board state
   * @param state Game state
   * @param depth Depth to search
   * @returns Total number of leaf nodes
   */
  perft(board: Board, state: GameState, depth: number): number {
    if (depth === 0) {
      return 1;
    }

    const moves = this.moveGen.generateLegalMoves(board, state);
    
    if (depth === 1) {
      return moves.length;
    }

    let nodes = 0;
    for (const move of moves) {
      const history = MoveExecutor.makeMove(board, state, move);
      nodes += this.perft(board, state, depth - 1);
      MoveExecutor.unmakeMove(board, state, history);
    }

    return nodes;
  }

  /**
   * Detailed perft with move type breakdown
   * 
   * @param board Current board state
   * @param state Game state
   * @param depth Depth to search
   * @returns Detailed perft result
   */
  perftDetailed(board: Board, state: GameState, depth: number): PerftResult {
    const result: PerftResult = {
      nodes: 0,
      captures: 0,
      enPassants: 0,
      castles: 0,
      promotions: 0,
      checks: 0,
      checkmates: 0,
    };

    if (depth === 0) {
      result.nodes = 1;
      return result;
    }

    const moves = this.moveGen.generateLegalMoves(board, state);

    for (const move of moves) {
      const history = MoveExecutor.makeMove(board, state, move);

      if (depth === 1) {
        // Evaluate leaf node
        result.nodes++;
        if (move.captured) result.captures++;
        if (move.flags & MoveFlags.EnPassant) {
          result.enPassants++;
          result.captures++;
        }
        if (move.flags & MoveFlags.Castle) result.castles++;
        if (move.flags & MoveFlags.Promotion) result.promotions++;

        // We'd need an inCheck function to evaluate checks/mates accurately at leaf nodes
        // Simplified for this implementation
      } else {
        const subResult = this.perftDetailed(board, state, depth - 1);
        result.nodes += subResult.nodes;
        result.captures += subResult.captures;
        result.enPassants += subResult.enPassants;
        result.castles += subResult.castles;
        result.promotions += subResult.promotions;
        result.checks += subResult.checks;
        result.checkmates += subResult.checkmates;
      }
      
      MoveExecutor.unmakeMove(board, state, history);
    }

    return result;
  }

  /**
   * Divide - show move breakdown at root
   * Useful for debugging specific moves
   * 
   * @param board Current board state
   * @param state Game state
   * @param depth Depth to search
   * @returns Map of move notation to node count
   */
  divide(board: Board, state: GameState, depth: number): Map<string, number> {
    const moves = this.moveGen.generateLegalMoves(board, state);
    const results = new Map<string, number>();

    for (const move of moves) {
      const history = MoveExecutor.makeMove(board, state, move);
      const nodes = depth > 1 
        ? this.perft(board, state, depth - 1)
        : 1;
      MoveExecutor.unmakeMove(board, state, history);
      
      const moveStr = this.moveToString(move);
      results.set(moveStr, nodes);
    }

    return results;
  }

  /**
   * Make a move and return new board/state
   * (Simplified version - doesn't handle all edge cases yet)
   * 
  /**
   * Convert move to string notation
   */
  private moveToString(move: Move): string {
    const fromFile = String.fromCharCode(97 + (move.from % 8));
    const fromRank = Math.floor(move.from / 8) + 1;
    const toFile = String.fromCharCode(97 + (move.to % 8));
    const toRank = Math.floor(move.to / 8) + 1;
    
    let str = `${fromFile}${fromRank}${toFile}${toRank}`;
    
    if (move.promotion) {
      const promotionChar = ['', 'p', 'n', 'b', 'r', 'q', 'k'][move.promotion];
      str += promotionChar;
    }
    
    return str;
  }
}
