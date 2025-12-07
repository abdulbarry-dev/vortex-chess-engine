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
      const { board: newBoard, state: newState } = this.makeMove(board, state, move);
      nodes += this.perft(newBoard, newState, depth - 1);
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
      const { board: newBoard, state: newState } = this.makeMove(board, state, move);
      
      if (depth === 1) {
        result.nodes++;
        
        // Count move types
        if (move.captured) result.captures++;
        if (move.flags & MoveFlags.EnPassant) result.enPassants++;
        if (move.flags & MoveFlags.Castle) result.castles++;
        if (move.flags & MoveFlags.Promotion) result.promotions++;
        
        // TODO: Count checks and checkmates when we implement those checks
      } else {
        const subResult = this.perftDetailed(newBoard, newState, depth - 1);
        result.nodes += subResult.nodes;
        result.captures += subResult.captures;
        result.enPassants += subResult.enPassants;
        result.castles += subResult.castles;
        result.promotions += subResult.promotions;
        result.checks += subResult.checks;
        result.checkmates += subResult.checkmates;
      }
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
      const { board: newBoard, state: newState } = this.makeMove(board, state, move);
      const nodes = depth > 1 
        ? this.perft(newBoard, newState, depth - 1)
        : 1;
      
      const moveStr = this.moveToString(move);
      results.set(moveStr, nodes);
    }

    return results;
  }

  /**
   * Make a move and return new board/state
   * (Simplified version - doesn't handle all edge cases yet)
   * 
   * @param board Current board
   * @param state Current state
   * @param move Move to make
   * @returns New board and state
   */
  private makeMove(
    board: Board,
    state: GameState,
    move: Move
  ): { board: Board; state: GameState } {
    // Clone board and state
    const newBoard = board.clone();
    const newState = state.clone();

    // Make the move on the board
    newBoard.setPiece(move.to, move.piece);
    newBoard.setPiece(move.from, null);

    // Handle special moves
    if (move.flags & MoveFlags.EnPassant) {
      // Remove captured pawn (not on target square)
      const epSquare = state.enPassantSquare;
      if (epSquare !== null) {
        const epFile = epSquare % 8;
        const captureRank = Math.floor(move.from / 8);
        const captureSquare = captureRank * 8 + epFile;
        newBoard.setPiece(captureSquare, null);
      }
    }

    if (move.flags & MoveFlags.Castle) {
      // Move the rook
      const kingside = move.to > move.from;
      if (kingside) {
        const rookFrom = move.from + 3;
        const rookTo = move.from + 1;
        const rook = newBoard.getPiece(rookFrom);
        if (rook) {
          newBoard.setPiece(rookTo, rook);
          newBoard.setPiece(rookFrom, null);
        }
      } else {
        const rookFrom = move.from - 4;
        const rookTo = move.from - 1;
        const rook = newBoard.getPiece(rookFrom);
        if (rook) {
          newBoard.setPiece(rookTo, rook);
          newBoard.setPiece(rookFrom, null);
        }
      }
    }

    if (move.flags & MoveFlags.Promotion && move.promotion) {
      // Replace pawn with promoted piece
      newBoard.setPiece(move.to, {
        type: move.promotion,
        color: move.piece.color,
      });
    }

    // Update game state
    newState.switchTurn();
    
    // Update en passant square
    if (move.flags & MoveFlags.DoublePawnPush) {
      // En passant square is behind the pawn
      const direction = move.piece.color === 1 ? 1 : -1;
      newState.enPassantSquare = move.from + direction * 8;
    } else {
      newState.enPassantSquare = null;
    }

    // Update castling rights (simplified - should check rook/king moves)
    // TODO: Properly update castling rights when king or rook moves

    // Update move counters
    if (move.captured || move.piece.type === 1) {
      newState.halfmoveClock = 0;
    } else {
      newState.halfmoveClock++;
    }

    if (move.piece.color === -1) { // Black
      newState.fullmoveNumber++;
    }

    return { board: newBoard, state: newState };
  }

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
