/**
 * @file AttackDetector.ts
 * @description Detect if a square is under attack
 */

import { Board } from '../core/Board';
import { Color, Piece, PieceType } from '../core/Piece';
import { coordsToSquare, Square, squareToCoords } from '../core/Square';
import { DIAGONAL_DIRECTIONS, Direction, ORTHOGONAL_DIRECTIONS } from './SlidingMoves';

/**
 * Check if a square is attacked by the given color
 * This is used for king safety checks and castling validation
 * 
 * @param board Current board state
 * @param square Square to check
 * @param attackingColor Color of the attacking pieces
 * @returns True if the square is under attack
 */
export function isSquareAttacked(
  board: Board,
  square: Square,
  attackingColor: Color
): boolean {
  // Check for pawn attacks
  if (isAttackedByPawn(board, square, attackingColor)) {
    return true;
  }

  // Check for knight attacks
  if (isAttackedByKnight(board, square, attackingColor)) {
    return true;
  }

  // Check for sliding piece attacks (bishops, rooks, queens)
  if (isAttackedBySlidingPiece(board, square, attackingColor)) {
    return true;
  }

  // Check for king attacks
  if (isAttackedByKing(board, square, attackingColor)) {
    return true;
  }

  return false;
}

/**
 * Check if square is attacked by an enemy pawn
 */
function isAttackedByPawn(
  board: Board,
  square: Square,
  attackingColor: Color
): boolean {
  const { rank, file } = squareToCoords(square);
  
  // Pawns attack diagonally one square
  // White pawns attack upward (rank+1), black pawns attack downward (rank-1)
  const pawnDirection = attackingColor === Color.White ? 1 : -1;
  const pawnRank = rank - pawnDirection; // Reverse direction to find attacking pawn

  // Check both diagonal positions
  for (const fileDelta of [-1, 1]) {
    const pawnFile = file + fileDelta;
    
    if (pawnFile < 0 || pawnFile > 7 || pawnRank < 0 || pawnRank > 7) {
      continue;
    }
    
    const pawnSquare = coordsToSquare(pawnRank, pawnFile);
    const piece = board.getPiece(pawnSquare);
    
    if (piece && piece.type === PieceType.Pawn && piece.color === attackingColor) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if square is attacked by a knight
 */
function isAttackedByKnight(
  board: Board,
  square: Square,
  attackingColor: Color
): boolean {
  const { rank, file } = squareToCoords(square);
  
  // Knight move offsets
  const knightOffsets: readonly [number, number][] = [
    [-2, -1], [-2, 1],
    [-1, -2], [-1, 2],
    [1, -2],  [1, 2],
    [2, -1],  [2, 1],
  ];
  
  for (const [rankDelta, fileDelta] of knightOffsets) {
    const knightRank = rank + rankDelta;
    const knightFile = file + fileDelta;
    
    if (knightRank < 0 || knightRank > 7 || knightFile < 0 || knightFile > 7) {
      continue;
    }
    
    const knightSquare = coordsToSquare(knightRank, knightFile);
    const piece = board.getPiece(knightSquare);
    
    if (piece && piece.type === PieceType.Knight && piece.color === attackingColor) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if square is attacked by a sliding piece (bishop, rook, or queen)
 */
function isAttackedBySlidingPiece(
  board: Board,
  square: Square,
  attackingColor: Color
): boolean {
  // Check diagonal directions (bishops and queens)
  for (const direction of DIAGONAL_DIRECTIONS) {
    const attacker = findSlidingAttacker(board, square, direction, attackingColor);
    if (attacker && (attacker.type === PieceType.Bishop || attacker.type === PieceType.Queen)) {
      return true;
    }
  }
  
  // Check orthogonal directions (rooks and queens)
  for (const direction of ORTHOGONAL_DIRECTIONS) {
    const attacker = findSlidingAttacker(board, square, direction, attackingColor);
    if (attacker && (attacker.type === PieceType.Rook || attacker.type === PieceType.Queen)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Find a sliding attacker in a specific direction
 * Returns the first piece encountered in that direction
 */
function findSlidingAttacker(
  board: Board,
  square: Square,
  direction: Direction,
  attackingColor: Color
): Piece | null {
  const { rank: startRank, file: startFile } = squareToCoords(square);
  const [rankDelta, fileDelta] = direction;
  
  let currentRank = startRank + rankDelta;
  let currentFile = startFile + fileDelta;
  
  // Slide in direction until we hit a piece or board edge
  while (currentRank >= 0 && currentRank < 8 && currentFile >= 0 && currentFile < 8) {
    const currentSquare = coordsToSquare(currentRank, currentFile);
    const piece = board.getPiece(currentSquare);
    
    if (piece !== null) {
      // Found a piece - return it if it's the attacking color
      return piece.color === attackingColor ? piece : null;
    }
    
    currentRank += rankDelta;
    currentFile += fileDelta;
  }
  
  return null;
}

/**
 * Check if square is attacked by a king
 */
function isAttackedByKing(
  board: Board,
  square: Square,
  attackingColor: Color
): boolean {
  const { rank, file } = squareToCoords(square);
  
  // King can attack one square in any direction
  const kingOffsets: readonly [number, number][] = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];
  
  for (const [rankDelta, fileDelta] of kingOffsets) {
    const kingRank = rank + rankDelta;
    const kingFile = file + fileDelta;
    
    if (kingRank < 0 || kingRank > 7 || kingFile < 0 || kingFile > 7) {
      continue;
    }
    
    const kingSquare = coordsToSquare(kingRank, kingFile);
    const piece = board.getPiece(kingSquare);
    
    if (piece && piece.type === PieceType.King && piece.color === attackingColor) {
      return true;
    }
  }
  
  return false;
}
