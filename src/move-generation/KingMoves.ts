/**
 * @file KingMoves.ts
 * @description Generate king moves (including castling)
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color, Piece, PieceType } from '../core/Piece';
import { coordsToSquare, Square, squareToCoords } from '../core/Square';
import { Move, MoveFlags } from '../types/Move.types';

/**
 * King move offsets (one square in any direction)
 * [rankDelta, fileDelta]
 */
const KING_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],  // Up
  [0, -1],           [0, 1],   // Sides
  [1, -1],  [1, 0],  [1, 1],   // Down
] as const;

/**
 * Generate regular king moves (one square in any direction)
 * Does not include castling moves
 * 
 * @param board Current board state
 * @param from Starting square
 * @param piece King piece
 * @param moves Array to populate with generated moves
 */
export function generateKingMoves(
  board: Board,
  from: Square,
  piece: Piece,
  moves: Move[]
): void {
  const { rank: startRank, file: startFile } = squareToCoords(from);

  for (const [rankDelta, fileDelta] of KING_OFFSETS) {
    const targetRank = startRank + rankDelta;
    const targetFile = startFile + fileDelta;

    // Check if target is on board
    if (targetRank < 0 || targetRank > 7 || targetFile < 0 || targetFile > 7) {
      continue;
    }

    const targetSquare = coordsToSquare(targetRank, targetFile);
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
    }
    // Own piece - skip (can't move here)
  }
}

/**
 * Generate castling moves for the king
 * Checks castling rights but does NOT check if squares are under attack
 * (that's done by LegalityChecker)
 * 
 * @param board Current board state
 * @param state Game state (for castling rights)
 * @param from King's starting square
 * @param piece King piece
 * @param moves Array to populate with generated moves
 */
export function generateCastlingMoves(
  board: Board,
  state: GameState,
  from: Square,
  piece: Piece,
  moves: Move[]
): void {
  const isWhite = piece.color === Color.White;
  const castlingRights = isWhite ? state.castlingRights.white : state.castlingRights.black;

  // King must be on starting square
  const expectedKingSquare = isWhite ? 4 : 60; // e1 for white, e8 for black
  if (from !== expectedKingSquare) {
    return;
  }

  // Kingside castling
  if (castlingRights.kingSide) {
    const f = from + 1; // f-file
    const g = from + 2; // g-file
    
    // Squares between king and rook must be empty
    if (board.getPiece(f) === null && board.getPiece(g) === null) {
      // Check that rook is present
      const rookSquare = from + 3; // h-file
      const rook = board.getPiece(rookSquare);
      
      if (rook && rook.type === PieceType.Rook && rook.color === piece.color) {
        moves.push({
          from,
          to: g,
          piece,
          flags: MoveFlags.Castle,
        });
      }
    }
  }

  // Queenside castling
  if (castlingRights.queenSide) {
    const d = from - 1; // d-file
    const c = from - 2; // c-file
    const b = from - 3; // b-file
    
    // Squares between king and rook must be empty
    if (board.getPiece(d) === null && board.getPiece(c) === null && board.getPiece(b) === null) {
      // Check that rook is present
      const rookSquare = from - 4; // a-file
      const rook = board.getPiece(rookSquare);
      
      if (rook && rook.type === PieceType.Rook && rook.color === piece.color) {
        moves.push({
          from,
          to: c,
          piece,
          flags: MoveFlags.Castle,
        });
      }
    }
  }
}
