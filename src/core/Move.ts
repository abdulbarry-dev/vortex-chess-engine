/**
 * @file Move.ts
 * @description Move representation and utility functions
 */

import { Move, MoveFlags } from '../types/Move.types';
import { Piece, getPieceChar, getPieceTypeName } from './Piece';
import { Square, squareToAlgebraic } from './Square';

/**
 * Convert a move to a human-readable string for debugging
 * @param move The move to convert
 * @returns String representation of the move
 * @example moveToString(move) // returns "Ne2-f4 (capture)"
 */
export function moveToString(move: Move): string {
  const pieceChar = getPieceChar(move.piece);
  const from = squareToAlgebraic(move.from);
  const to = squareToAlgebraic(move.to);
  
  let result = `${pieceChar}${from}-${to}`;
  
  // Add flags information
  const flags: string[] = [];
  if (isCaptureMove(move)) {
    flags.push('capture');
  }
  if (isPromotionMove(move)) {
    const promotionType = move.promotion ? getPieceTypeName(move.promotion) : 'Unknown';
    flags.push(`promote to ${promotionType}`);
  }
  if (isCastlingMove(move)) {
    flags.push('castle');
  }
  if (isEnPassantMove(move)) {
    flags.push('en passant');
  }
  if (isDoublePawnPush(move)) {
    flags.push('double pawn push');
  }
  
  if (flags.length > 0) {
    result += ` (${flags.join(', ')})`;
  }
  
  return result;
}

/**
 * Check if a move is a capture
 * @param move The move to check
 * @returns True if the move captures a piece
 */
export function isCaptureMove(move: Move): boolean {
  return (move.flags & MoveFlags.Capture) !== 0;
}

/**
 * Check if a move is a promotion
 * @param move The move to check
 * @returns True if the move promotes a pawn
 */
export function isPromotionMove(move: Move): boolean {
  return (move.flags & MoveFlags.Promotion) !== 0;
}

/**
 * Check if a move is castling
 * @param move The move to check
 * @returns True if the move is a castling move
 */
export function isCastlingMove(move: Move): boolean {
  return (move.flags & MoveFlags.Castle) !== 0;
}

/**
 * Check if a move is an en passant capture
 * @param move The move to check
 * @returns True if the move is an en passant capture
 */
export function isEnPassantMove(move: Move): boolean {
  return (move.flags & MoveFlags.EnPassant) !== 0;
}

/**
 * Check if a move is a double pawn push
 * @param move The move to check
 * @returns True if the move is a double pawn push
 */
export function isDoublePawnPush(move: Move): boolean {
  return (move.flags & MoveFlags.DoublePawnPush) !== 0;
}

/**
 * Check if a move is quiet (not a capture or promotion)
 * @param move The move to check
 * @returns True if the move is quiet
 */
export function isQuietMove(move: Move): boolean {
  return !isCaptureMove(move) && !isPromotionMove(move);
}

/**
 * Create a simple move
 * @param from Source square
 * @param to Destination square
 * @param piece Piece being moved
 * @returns Move object
 */
export function createMove(from: Square, to: Square, piece: Piece): Move {
  return {
    from,
    to,
    piece,
    flags: MoveFlags.None,
  };
}

/**
 * Create a capture move
 * @param from Source square
 * @param to Destination square
 * @param piece Piece being moved
 * @param captured Piece being captured
 * @returns Move object
 */
export function createCaptureMove(
  from: Square,
  to: Square,
  piece: Piece,
  captured: Piece
): Move {
  return {
    from,
    to,
    piece,
    captured,
    flags: MoveFlags.Capture,
  };
}

/**
 * Compare two moves for equality
 * @param move1 First move
 * @param move2 Second move
 * @returns True if moves are identical
 */
export function movesEqual(move1: Move, move2: Move): boolean {
  return (
    move1.from === move2.from &&
    move1.to === move2.to &&
    move1.piece.type === move2.piece.type &&
    move1.piece.color === move2.piece.color &&
    move1.promotion === move2.promotion
  );
}
