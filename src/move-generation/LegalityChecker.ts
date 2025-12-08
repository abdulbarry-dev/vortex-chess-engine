/**
 * @file LegalityChecker.ts
 * @description Filter pseudo-legal moves to only legal moves (don't leave king in check)
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color, PieceType, oppositeColor } from '../core/Piece';
import { coordsToSquare } from '../core/Square';
import { Move, MoveFlags } from '../types/Move.types';
import { isSquareAttacked } from './AttackDetector';

/**
 * Filter moves to only include legal moves
 * A move is legal if it doesn't leave the king in check
 * 
 * @param board Current board state
 * @param state Game state
 * @param moves Array of pseudo-legal moves
 * @returns Array of legal moves
 */
export function filterLegalMoves(
  board: Board,
  state: GameState,
  moves: Move[]
): Move[] {
  const legalMoves: Move[] = [];
  
  for (const move of moves) {
    if (isMoveLegal(board, state, move)) {
      legalMoves.push(move);
    }
  }
  
  return legalMoves;
}

/**
 * Check if a specific move is legal
 * Makes the move, checks if king is in check, then unmakes the move
 * 
 * @param board Current board state
 * @param state Game state
 * @param move Move to check
 * @returns True if the move is legal
 */
export function isMoveLegal(
  board: Board,
  state: GameState,
  move: Move
): boolean {
  // Special handling for castling
  if (move.flags & MoveFlags.Castle) {
    return isCastlingLegal(board, move);
  }
  
  // Cache original pieces for unmake
  const originalFromPiece = board.getPiece(move.from);
  const originalToPiece = board.getPiece(move.to);
  
  // Quick exit: if originalFromPiece is null, move is invalid
  if (!originalFromPiece) return false;
  
  // Handle en passant capture (captured pawn is not on target square)
  let enPassantCaptureSquare: number | null = null;
  let capturedEnPassantPiece = null;
  if (move.flags & MoveFlags.EnPassant) {
    const epSquare = state.enPassantSquare;
    if (epSquare !== null) {
      const epFile = epSquare % 8;
      // Captured pawn is on same rank as moving pawn, not on en passant square
      const captureRank = Math.floor(move.from / 8);
      enPassantCaptureSquare = coordsToSquare(captureRank, epFile);
      capturedEnPassantPiece = board.getPiece(enPassantCaptureSquare);
    }
  }
  
  // Make the move
  board.setPiece(move.to, originalFromPiece);
  board.setPiece(move.from, null);
  
  // Handle en passant capture
  if (enPassantCaptureSquare !== null) {
    board.setPiece(enPassantCaptureSquare, null);
  }
  
  // Find king position (might have moved if this is a king move)
  const kingSquare = move.piece.type === PieceType.King 
    ? move.to 
    : board.findKing(move.piece.color);
  
  // Check if king is in check (early exit if no king found)
  const isInCheck = kingSquare !== null && isSquareAttacked(
    board,
    kingSquare,
    oppositeColor(move.piece.color)
  );
  
  // Unmake the move
  board.setPiece(move.from, originalFromPiece);
  board.setPiece(move.to, originalToPiece);
  
  // Restore captured pawn for en passant
  if (enPassantCaptureSquare !== null && capturedEnPassantPiece) {
    board.setPiece(enPassantCaptureSquare, capturedEnPassantPiece);
  }
  
  return !isInCheck;
}

/**
 * Check if castling move is legal
 * Castling is illegal if:
 * - King is currently in check
 * - King passes through a square that is under attack
 * - King ends up in check
 * 
 * @param board Current board state
 * @param move Castling move
 * @returns True if castling is legal
 */
function isCastlingLegal(
  board: Board,
  move: Move
): boolean {
  const enemyColor = oppositeColor(move.piece.color);
  
  // King cannot be in check before castling
  if (isSquareAttacked(board, move.from, enemyColor)) {
    return false;
  }
  
  // Determine which squares the king passes through
  const kingside = move.to > move.from;
  const passThroughSquare = kingside ? move.from + 1 : move.from - 1;
  
  // King cannot pass through attacked square
  if (isSquareAttacked(board, passThroughSquare, enemyColor)) {
    return false;
  }
  
  // King cannot end up in check
  if (isSquareAttacked(board, move.to, enemyColor)) {
    return false;
  }
  
  return true;
}

/**
 * Check if the current player is in check
 * 
 * @param board Current board state
 * @param color Color of the player to check
 * @returns True if the player is in check
 */
export function isInCheck(board: Board, color: Color): boolean {
  const kingSquare = board.findKing(color);
  
  if (kingSquare === null) {
    return false; // No king found (shouldn't happen in valid position)
  }
  
  return isSquareAttacked(board, kingSquare, oppositeColor(color));
}

/**
 * Check if the current player is in checkmate
 * 
 * @param board Current board state
 * @param color Color to check
 * @param moves Legal moves available
 * @returns True if the player is in checkmate
 */
export function isCheckmate(board: Board, color: Color, moves: Move[]): boolean {
  // Checkmate = in check and no legal moves
  return isInCheck(board, color) && moves.length === 0;
}

/**
 * Check if the position is stalemate
 * 
 * @param board Current board state
 * @param color Color to check
 * @param moves Legal moves available
 * @returns True if the position is stalemate
 */
export function isStalemate(board: Board, color: Color, moves: Move[]): boolean {
  // Stalemate = NOT in check and no legal moves
  return !isInCheck(board, color) && moves.length === 0;
}
