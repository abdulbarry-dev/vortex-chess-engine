/**
 * @file MoveGenerator.ts
 * @description Main move generation coordinator - generates all legal moves
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color, PieceType } from '../core/Piece';
import { Move } from '../types/Move.types';
import { generateCastlingMoves, generateKingMoves } from './KingMoves';
import { generateKnightMoves } from './KnightMoves';
import { filterLegalMoves } from './LegalityChecker';
import { generatePawnMoves } from './PawnMoves';
import { generateBishopMoves, generateQueenMoves, generateRookMoves } from './SlidingMoves';

export enum MoveGenType {
  All,
  Captures,
  Quiets
}

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
   * @param type Type of moves to generate
   * @returns Array of legal moves
   */
  generateLegalMoves(board: Board, state: GameState, type: MoveGenType = MoveGenType.All): Move[] {
    const pseudoLegalMoves = this.generatePseudoLegalMoves(board, state, type);
    return filterLegalMoves(board, state, pseudoLegalMoves);
  }

  /**
   * Generate all pseudo-legal moves (may leave king in check)
   * These moves follow piece movement rules but don't check king safety
   * 
   * @param board Current board state
   * @param state Game state
   * @param type Type of moves to generate
   * @returns Array of pseudo-legal moves
   */
  generatePseudoLegalMoves(board: Board, state: GameState, type: MoveGenType = MoveGenType.All): Move[] {
    const moves: Move[] = [];
    const currentPlayer = state.currentPlayer;
    const enemyColor = currentPlayer === Color.White ? Color.Black : Color.White;

    let targetMask = 0xFFFFFFFFFFFFFFFFn;
    if (type === MoveGenType.Captures) {
      targetMask = board.getColorOccupancy(enemyColor);
    } else if (type === MoveGenType.Quiets) {
      targetMask = ~(board.getColorOccupancy(Color.White) | board.getColorOccupancy(Color.Black));
    }

    const capturesOnly = type === MoveGenType.Captures;
    const quietsOnly = type === MoveGenType.Quiets;

    // Use bitboard to find all pieces without allocating arrays
    let occupancy = board.getColorOccupancy(currentPlayer);

    while (occupancy !== 0n) {
      // Find the next piece's square
      let isolated = occupancy & -occupancy;
      // Faster bitscan for local usage:
      let sq = 0;
      if ((isolated & 0xFFFFFFFF00000000n) !== 0n) sq += 32;
      if ((isolated & 0xFFFF0000FFFF0000n) !== 0n) sq += 16;
      if ((isolated & 0xFF00FF00FF00FF00n) !== 0n) sq += 8;
      if ((isolated & 0xF0F0F0F0F0F0F0F0n) !== 0n) sq += 4;
      if ((isolated & 0xCCCCCCCCCCCCCCCCn) !== 0n) sq += 2;
      if ((isolated & 0xAAAAAAAAAAAAAAAAn) !== 0n) sq += 1;
      
      const piece = board.getPiece(sq);
      if (piece) {
        switch (piece.type) {
          case PieceType.Pawn:
            generatePawnMoves(board, state, sq, piece, moves, capturesOnly, quietsOnly);
            break;
          
          case PieceType.Knight:
            generateKnightMoves(board, sq, piece, moves, targetMask);
            break;
          
          case PieceType.Bishop:
            generateBishopMoves(board, sq, piece, moves, targetMask);
            break;
          
          case PieceType.Rook:
            generateRookMoves(board, sq, piece, moves, targetMask);
            break;
          
          case PieceType.Queen:
            generateQueenMoves(board, sq, piece, moves, targetMask);
            break;
          
          case PieceType.King:
            generateKingMoves(board, sq, piece, moves, targetMask);
            if (!capturesOnly) {
              generateCastlingMoves(board, state, sq, piece, moves);
            }
            break;
        }
      }

      occupancy &= occupancy - 1n;
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
    return this.generateLegalMoves(board, state, MoveGenType.Captures);
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
