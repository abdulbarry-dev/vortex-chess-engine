/**
 * @file KnightMoves.ts
 * @description Generate knight moves
 */

import { Board } from '../core/Board';
import { Piece } from '../core/Piece';
import { Square } from '../core/Square';
import { Move, MoveFlags } from '../types/Move.types';
import { KNIGHT_ATTACKS } from '../bitboard/AttackTables';
import { bitScanForward } from '../bitboard/Bitboard';

/**
 * Generate all knight moves from a square using bitboards
 * 
 * @param board Current board state
 * @param from Starting square
 * @param piece Knight piece
 * @param moves Array to populate with generated moves
 */
export function generateKnightMoves(
  board: Board,
  from: Square,
  piece: Piece,
  moves: Move[],
  targetMask: bigint = 0xFFFFFFFFFFFFFFFFn // FULL_BB equivalent
): void {
  // Get all pseudo-legal knight squares (attacks & ~ownPieces)
  let attacks = KNIGHT_ATTACKS[from]! & ~board.getColorOccupancy(piece.color) & targetMask;

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
