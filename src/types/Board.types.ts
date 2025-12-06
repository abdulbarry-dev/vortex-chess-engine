/**
 * @file Board.types.ts
 * @description Type definitions for board-related structures
 */

import { Piece } from '../core/Piece';
import { Square } from '../core/Square';

/**
 * Castling rights for a single color
 */
export interface CastlingRights {
  kingSide: boolean;
  queenSide: boolean;
}

/**
 * Complete castling rights for both players
 */
export interface AllCastlingRights {
  white: CastlingRights;
  black: CastlingRights;
}

/**
 * Information needed to undo a move
 */
export interface UndoInfo {
  capturedPiece: Piece | null;
  castlingRights: AllCastlingRights;
  enPassantSquare: Square | null;
  halfmoveClock: number;
}
