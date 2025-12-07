/**
 * @file PieceSquareTables.ts
 * @description Piece-square tables for positional evaluation
 * 
 * These tables assign bonuses/penalties based on piece placement.
 * Values are from white's perspective (flip for black).
 */

import { Board } from '../core/Board';
import { Color, Piece, PieceType } from '../core/Piece';
import { Square } from '../core/Square';

/**
 * Pawn piece-square table
 * Encourages: center control, advancement, avoiding edges
 */
const PAWN_TABLE = [
  0,   0,   0,   0,   0,   0,   0,   0,   // Rank 1 (never reached)
  50,  50,  50,  50,  50,  50,  50,  50,  // Rank 2
  10,  10,  20,  30,  30,  20,  10,  10,  // Rank 3
  5,   5,   10,  25,  25,  10,  5,   5,   // Rank 4
  0,   0,   0,   20,  20,  0,   0,   0,   // Rank 5
  5,   -5,  -10, 0,   0,   -10, -5,  5,   // Rank 6
  5,   10,  10,  -20, -20, 10,  10,  5,   // Rank 7
  0,   0,   0,   0,   0,   0,   0,   0    // Rank 8 (promotion)
];

/**
 * Knight piece-square table
 * Encourages: center control, avoiding edges and corners
 */
const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50,  // Rank 1
  -40, -20, 0,   0,   0,   0,   -20, -40,  // Rank 2
  -30, 0,   10,  15,  15,  10,  0,   -30,  // Rank 3
  -30, 5,   15,  20,  20,  15,  5,   -30,  // Rank 4
  -30, 0,   15,  20,  20,  15,  0,   -30,  // Rank 5
  -30, 5,   10,  15,  15,  10,  5,   -30,  // Rank 6
  -40, -20, 0,   5,   5,   0,   -20, -40,  // Rank 7
  -50, -40, -30, -30, -30, -30, -40, -50   // Rank 8
];

/**
 * Bishop piece-square table
 * Encourages: long diagonals, center control
 */
const BISHOP_TABLE = [
  -20, -10, -10, -10, -10, -10, -10, -20,  // Rank 1
  -10, 0,   0,   0,   0,   0,   0,   -10,  // Rank 2
  -10, 0,   5,   10,  10,  5,   0,   -10,  // Rank 3
  -10, 5,   5,   10,  10,  5,   5,   -10,  // Rank 4
  -10, 0,   10,  10,  10,  10,  0,   -10,  // Rank 5
  -10, 10,  10,  10,  10,  10,  10,  -10,  // Rank 6
  -10, 5,   0,   0,   0,   0,   5,   -10,  // Rank 7
  -20, -10, -10, -10, -10, -10, -10, -20   // Rank 8
];

/**
 * Rook piece-square table
 * Encourages: 7th rank, open files, center files
 */
const ROOK_TABLE = [
  0,   0,   0,   0,   0,   0,   0,   0,    // Rank 1
  5,   10,  10,  10,  10,  10,  10,  5,    // Rank 2
  -5,  0,   0,   0,   0,   0,   0,   -5,   // Rank 3
  -5,  0,   0,   0,   0,   0,   0,   -5,   // Rank 4
  -5,  0,   0,   0,   0,   0,   0,   -5,   // Rank 5
  -5,  0,   0,   0,   0,   0,   0,   -5,   // Rank 6
  -5,  0,   0,   0,   0,   0,   0,   -5,   // Rank 7
  0,   0,   0,   5,   5,   0,   0,   0     // Rank 8
];

/**
 * Queen piece-square table
 * Encourages: center control, development
 */
const QUEEN_TABLE = [
  -20, -10, -10, -5,  -5,  -10, -10, -20,  // Rank 1
  -10, 0,   0,   0,   0,   0,   0,   -10,  // Rank 2
  -10, 0,   5,   5,   5,   5,   0,   -10,  // Rank 3
  -5,  0,   5,   5,   5,   5,   0,   -5,   // Rank 4
  0,   0,   5,   5,   5,   5,   0,   -5,   // Rank 5
  -10, 5,   5,   5,   5,   5,   0,   -10,  // Rank 6
  -10, 0,   5,   0,   0,   0,   0,   -10,  // Rank 7
  -20, -10, -10, -5,  -5,  -10, -10, -20   // Rank 8
];

/**
 * King piece-square table (middlegame)
 * Encourages: castled position, safety
 */
const KING_MIDDLEGAME_TABLE = [
  -30, -40, -40, -50, -50, -40, -40, -30,  // Rank 1
  -30, -40, -40, -50, -50, -40, -40, -30,  // Rank 2
  -30, -40, -40, -50, -50, -40, -40, -30,  // Rank 3
  -30, -40, -40, -50, -50, -40, -40, -30,  // Rank 4
  -20, -30, -30, -40, -40, -30, -30, -20,  // Rank 5
  -10, -20, -20, -20, -20, -20, -20, -10,  // Rank 6
  20,  20,  0,   0,   0,   0,   20,  20,   // Rank 7
  20,  30,  10,  0,   0,   10,  30,  20    // Rank 8 (castled)
];

/**
 * King piece-square table (endgame)
 * Encourages: centralization, activity
 */
const KING_ENDGAME_TABLE = [
  -50, -40, -30, -20, -20, -30, -40, -50,  // Rank 1
  -30, -20, -10, 0,   0,   -10, -20, -30,  // Rank 2
  -30, -10, 20,  30,  30,  20,  -10, -30,  // Rank 3
  -30, -10, 30,  40,  40,  30,  -10, -30,  // Rank 4
  -30, -10, 30,  40,  40,  30,  -10, -30,  // Rank 5
  -30, -10, 20,  30,  30,  20,  -10, -30,  // Rank 6
  -30, -30, 0,   0,   0,   0,   -30, -30,  // Rank 7
  -50, -30, -30, -30, -30, -30, -30, -50   // Rank 8
];

/**
 * Evaluates piece placement using piece-square tables
 */
export class PieceSquareEvaluator {
  /**
   * Evaluate piece placement
   * Returns score from white's perspective
   * 
   * @param board Current board state
   * @param isEndgame Whether position is endgame (affects king table)
   * @returns Positional score in centipawns
   */
  evaluate(board: Board, isEndgame: boolean): number {
    let score = 0;

    for (const [square, piece] of board.getAllPieces()) {
      const tableValue = this.getTableValue(square, piece, isEndgame);
      score += piece.color === Color.White ? tableValue : -tableValue;
    }

    return score;
  }

  /**
   * Get piece-square table value for a piece
   * 
   * @param square Square index
   * @param piece Piece at square
   * @param isEndgame Whether position is endgame
   * @returns Table value in centipawns
   */
  private getTableValue(square: Square, piece: Piece, isEndgame: boolean): number {
    // Flip square for black pieces (tables are from white's perspective)
    const adjustedSquare = piece.color === Color.White ? square : this.flipSquare(square);

    switch (piece.type) {
      case PieceType.Pawn:
        return PAWN_TABLE[adjustedSquare] ?? 0;
      case PieceType.Knight:
        return KNIGHT_TABLE[adjustedSquare] ?? 0;
      case PieceType.Bishop:
        return BISHOP_TABLE[adjustedSquare] ?? 0;
      case PieceType.Rook:
        return ROOK_TABLE[adjustedSquare] ?? 0;
      case PieceType.Queen:
        return QUEEN_TABLE[adjustedSquare] ?? 0;
      case PieceType.King:
        return isEndgame 
          ? (KING_ENDGAME_TABLE[adjustedSquare] ?? 0)
          : (KING_MIDDLEGAME_TABLE[adjustedSquare] ?? 0);
      default:
        return 0;
    }
  }

  /**
   * Flip square vertically (for black pieces)
   * Square 0 (a1) becomes 56 (a8), etc.
   * 
   * @param square Square to flip
   * @returns Flipped square
   */
  private flipSquare(square: Square): Square {
    const rank = Math.floor(square / 8);
    const file = square % 8;
    const flippedRank = 7 - rank;
    return flippedRank * 8 + file;
  }
}
