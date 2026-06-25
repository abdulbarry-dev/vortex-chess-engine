/**
 * @file KingMoves.ts
 * @description Generate king moves (including castling)
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color, Piece, PieceType } from '../core/Piece';
import { Square } from '../core/Square';
import { Move, MoveFlags } from '../types/Move.types';
import { KING_ATTACKS } from '../bitboard/AttackTables';
import { bitScanForward } from '../bitboard/Bitboard';

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
  moves: Move[],
  targetMask: bigint = 0xFFFFFFFFFFFFFFFFn
): void {
  // Get all pseudo-legal king squares (attacks & ~ownPieces)
  let attacks = KING_ATTACKS[from]! & ~board.getColorOccupancy(piece.color) & targetMask;

  while (attacks !== 0n) {
    const to = bitScanForward(attacks);
    const targetPiece = board.getPiece(to);

    moves.push({
      from,
      to,
      piece,
      captured: targetPiece !== null ? targetPiece : undefined,
      flags: targetPiece !== null ? MoveFlags.Capture : MoveFlags.None,
    });

    attacks &= attacks - 1n; // clear lowest set bit
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
