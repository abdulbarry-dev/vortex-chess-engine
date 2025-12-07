/**
 * @file MoveGenerator.ts
 * @description Main move generation coordinator - generates all legal moves
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { PieceType } from '../core/Piece';
import { Move } from '../types/Move.types';
import { generateCastlingMoves, generateKingMoves } from './KingMoves';
import { generateKnightMoves } from './KnightMoves';
import { filterLegalMoves } from './LegalityChecker';
import { generatePawnMoves } from './PawnMoves';
import { generateBishopMoves, generateQueenMoves, generateRookMoves } from './SlidingMoves';

/**
 * Main move generator class
 * Coordinates all piece-specific move generators and filters for legality
 */
export class MoveGenerator {
  /**
   * Generate all legal moves for the current position
   * 
   * @param board Current board state
   * @param state Game state
   * @returns Array of legal moves
   */
  generateLegalMoves(board: Board, state: GameState): Move[] {
    const pseudoLegalMoves = this.generatePseudoLegalMoves(board, state);
    return filterLegalMoves(board, state, pseudoLegalMoves);
  }

  /**
   * Generate all pseudo-legal moves (may leave king in check)
   * These moves follow piece movement rules but don't check king safety
   * 
   * @param board Current board state
   * @param state Game state
   * @returns Array of pseudo-legal moves
   */
  generatePseudoLegalMoves(board: Board, state: GameState): Move[] {
    const moves: Move[] = [];
    const currentPlayer = state.currentPlayer;

    // Get all pieces for current player
    const pieces = board.getPiecesByColor(currentPlayer);

    for (const [square, piece] of pieces) {
      switch (piece.type) {
        case PieceType.Pawn:
          generatePawnMoves(board, state, square, piece, moves);
          break;
        
        case PieceType.Knight:
          generateKnightMoves(board, square, piece, moves);
          break;
        
        case PieceType.Bishop:
          generateBishopMoves(board, square, piece, moves);
          break;
        
        case PieceType.Rook:
          generateRookMoves(board, square, piece, moves);
          break;
        
        case PieceType.Queen:
          generateQueenMoves(board, square, piece, moves);
          break;
        
        case PieceType.King:
          generateKingMoves(board, square, piece, moves);
          generateCastlingMoves(board, state, square, piece, moves);
          break;
      }
    }

    return moves;
  }

  /**
   * Generate only capture moves (for quiescence search)
   * 
   * @param board Current board state
   * @param state Game state
   * @returns Array of legal capture moves
   */
  generateCaptures(board: Board, state: GameState): Move[] {
    const allMoves = this.generateLegalMoves(board, state);
    return allMoves.filter(move => move.captured !== undefined);
  }

  /**
   * Check if current player has any legal moves
   * More efficient than generating all moves when we just need to know if any exist
   * 
   * @param board Current board state
   * @param state Game state
   * @returns True if at least one legal move exists
   */
  hasLegalMoves(board: Board, state: GameState): boolean {
    const pseudoLegalMoves = this.generatePseudoLegalMoves(board, state);
    
    // Check if any pseudo-legal move is actually legal
    for (const move of pseudoLegalMoves) {
      const legalMoves = filterLegalMoves(board, state, [move]);
      if (legalMoves.length > 0) {
        return true;
      }
    }
    
    return false;
  }
}
