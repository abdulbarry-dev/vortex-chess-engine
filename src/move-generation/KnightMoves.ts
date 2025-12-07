/**
 * @file KnightMoves.ts
 * @description Generate knight moves
 */

import { Board } from '../core/Board';
import { Piece } from '../core/Piece';
import { coordsToSquare, Square, squareToCoords } from '../core/Square';
import { Move, MoveFlags } from '../types/Move.types';

/**
 * Knight move offsets (L-shape: 2 squares in one direction, 1 in perpendicular)
 * [rankDelta, fileDelta]
 */
const KNIGHT_OFFSETS = [
  [-2, -1], [-2, 1],  // Two up
  [-1, -2], [-1, 2],  // One up
  [1, -2],  [1, 2],   // One down
  [2, -1],  [2, 1],   // Two down
] as const;

/**
 * Generate all knight moves from a square
 * Knights jump over pieces and are not blocked
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
  moves: Move[]
): void {
  const { rank: startRank, file: startFile } = squareToCoords(from);

  for (const [rankDelta, fileDelta] of KNIGHT_OFFSETS) {
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
