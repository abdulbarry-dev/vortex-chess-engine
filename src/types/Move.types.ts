/**
 * @file Move.types.ts
 * @description Type definitions for move-related structures
 */

import { Piece, PieceType } from '../core/Piece';
import { Square } from '../core/Square';

/**
 * Flags indicating special properties of a move
 */
export enum MoveFlags {
  None = 0,
  Capture = 1 << 0,
  Castle = 1 << 1,
  EnPassant = 1 << 2,
  Promotion = 1 << 3,
  DoublePawnPush = 1 << 4,
}

/**
 * Complete move representation
 */
export interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  captured?: Piece;
  promotion?: PieceType;
  flags: MoveFlags;
}
