/**
 * @file SlidingMoves.ts
 * @description Shared logic for generating sliding piece moves (bishops, rooks, queens)
 */

import { Board } from '../core/Board';
import { Piece } from '../core/Piece';
import { Square } from '../core/Square';
import { Move, MoveFlags } from '../types/Move.types';
import { getBishopAttacks, getRookAttacks } from '../bitboard/AttackTables';
import { bitScanForward } from '../bitboard/Bitboard';

/**
 * Generate moves from a bitboard of attacks
 */
function extractMovesFromAttacks(
  board: Board,
  from: Square,
  piece: Piece,
  attacks: bigint,
  moves: Move[],
  targetMask: bigint
): void {
  // Filter out squares occupied by our own pieces
  let validAttacks = attacks & ~board.getColorOccupancy(piece.color) & targetMask;

  while (validAttacks !== 0n) {
    const to = bitScanForward(validAttacks);
    const targetPiece = board.getPiece(to);

    moves.push({
      from,
      to,
      piece,
      captured: targetPiece !== null ? targetPiece : undefined,
      flags: targetPiece !== null ? MoveFlags.Capture : MoveFlags.None,
    });

    validAttacks &= validAttacks - 1n; // clear lowest set bit
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
  moves: Move[],
  targetMask: bigint = 0xFFFFFFFFFFFFFFFFn
): void {
  const attacks = getBishopAttacks(from, board.getOccupancy());
  extractMovesFromAttacks(board, from, piece, attacks, moves, targetMask);
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
  moves: Move[],
  targetMask: bigint = 0xFFFFFFFFFFFFFFFFn
): void {
  const attacks = getRookAttacks(from, board.getOccupancy());
  extractMovesFromAttacks(board, from, piece, attacks, moves, targetMask);
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
  moves: Move[],
  targetMask: bigint = 0xFFFFFFFFFFFFFFFFn
): void {
  const occupancy = board.getOccupancy();
  const attacks = getBishopAttacks(from, occupancy) | getRookAttacks(from, occupancy);
  extractMovesFromAttacks(board, from, piece, attacks, moves, targetMask);
}
