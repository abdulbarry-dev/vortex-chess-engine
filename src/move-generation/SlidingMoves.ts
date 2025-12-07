/**
 * @file SlidingMoves.ts
 * @description Shared logic for generating sliding piece moves (bishops, rooks, queens)
 */

import { Board } from '../core/Board';
import { Piece } from '../core/Piece';
import { coordsToSquare, Square, squareToCoords } from '../core/Square';
import { Move, MoveFlags } from '../types/Move.types';

/**
 * Direction vectors for sliding pieces
 * [rankDelta, fileDelta]
 */
export const ORTHOGONAL_DIRECTIONS = [
  [-1, 0], // North
  [1, 0],  // South
  [0, -1], // West
  [0, 1],  // East
] as const;

export const DIAGONAL_DIRECTIONS = [
  [-1, -1], // Northwest
  [-1, 1],  // Northeast
  [1, -1],  // Southwest
  [1, 1],   // Southeast
] as const;

export const ALL_DIRECTIONS = [
  ...ORTHOGONAL_DIRECTIONS,
  ...DIAGONAL_DIRECTIONS,
] as const;

export type Direction = readonly [number, number];

/**
 * Generate sliding moves in a specific direction
 * Continues until hitting edge of board or another piece
 * 
 * @param board Current board state
 * @param from Starting square
 * @param piece Piece being moved
 * @param direction Direction vector [rankDelta, fileDelta]
 * @param moves Array to populate with generated moves
 */
export function generateSlidingMovesInDirection(
  board: Board,
  from: Square,
  piece: Piece,
  direction: Direction,
  moves: Move[]
): void {
  const { rank: startRank, file: startFile } = squareToCoords(from);
  const [rankDelta, fileDelta] = direction;

  let currentRank = startRank + rankDelta;
  let currentFile = startFile + fileDelta;

  // Slide in direction until we hit edge of board or another piece
  while (currentRank >= 0 && currentRank < 8 && currentFile >= 0 && currentFile < 8) {
    const targetSquare = coordsToSquare(currentRank, currentFile);
    const targetPiece = board.getPiece(targetSquare);

    if (targetPiece === null) {
      // Empty square - can move here
      moves.push({
        from,
        to: targetSquare,
        piece,
        flags: MoveFlags.None,
      });
    } else if (targetPiece.color !== piece.color) {
      // Enemy piece - can capture
      moves.push({
        from,
        to: targetSquare,
        piece,
        captured: targetPiece,
        flags: MoveFlags.Capture,
      });
      // Can't continue past this piece
      break;
    } else {
      // Own piece - can't move here or past it
      break;
    }

    // Continue in same direction
    currentRank += rankDelta;
    currentFile += fileDelta;
  }
}

/**
 * Generate all sliding moves in multiple directions
 * 
 * @param board Current board state
 * @param from Starting square
 * @param piece Piece being moved
 * @param directions Array of direction vectors
 * @param moves Array to populate with generated moves
 */
export function generateSlidingMoves(
  board: Board,
  from: Square,
  piece: Piece,
  directions: readonly Direction[],
  moves: Move[]
): void {
  for (const direction of directions) {
    generateSlidingMovesInDirection(board, from, piece, direction, moves);
  }
}

/**
 * Generate bishop moves (diagonal directions only)
 * 
 * @param board Current board state
 * @param from Starting square
 * @param piece Bishop piece
 * @param moves Array to populate with generated moves
 */
export function generateBishopMoves(
  board: Board,
  from: Square,
  piece: Piece,
  moves: Move[]
): void {
  generateSlidingMoves(board, from, piece, DIAGONAL_DIRECTIONS, moves);
}

/**
 * Generate rook moves (orthogonal directions only)
 * 
 * @param board Current board state
 * @param from Starting square
 * @param piece Rook piece
 * @param moves Array to populate with generated moves
 */
export function generateRookMoves(
  board: Board,
  from: Square,
  piece: Piece,
  moves: Move[]
): void {
  generateSlidingMoves(board, from, piece, ORTHOGONAL_DIRECTIONS, moves);
}

/**
 * Generate queen moves (all directions)
 * 
 * @param board Current board state
 * @param from Starting square
 * @param piece Queen piece
 * @param moves Array to populate with generated moves
 */
export function generateQueenMoves(
  board: Board,
  from: Square,
  piece: Piece,
  moves: Move[]
): void {
  generateSlidingMoves(board, from, piece, ALL_DIRECTIONS, moves);
}
