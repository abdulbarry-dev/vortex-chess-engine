/**
 * @file PawnMoves.ts
 * @description Generate pawn moves (most complex piece due to special rules)
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color, Piece, PieceType } from '../core/Piece';
import { Square } from '../core/Square';
import { Move, MoveFlags } from '../types/Move.types';

export function generatePawnMoves(
  board: Board,
  state: GameState,
  from: Square,
  piece: Piece,
  moves: Move[],
  capturesOnly: boolean = false,
  quietsOnly: boolean = false
): void {
  const isWhite = piece.color === Color.White;
  const direction = isWhite ? 8 : -8;
  const startRank = isWhite ? 1 : 6;
  const promotionRank = isWhite ? 7 : 0;
  
  const currentRank = from >> 3; // equivalent to Math.floor(from / 8)
  const currentFile = from & 7;  // equivalent to from % 8

  // Forward push (one square)
  if (!capturesOnly) {
    const oneSquareAhead = from + direction;
    if (board.getPiece(oneSquareAhead) === null) {
      const targetRank = oneSquareAhead >> 3;
      
      // Check for promotion
      if (targetRank === promotionRank) {
        for (const promotionType of [PieceType.Queen, PieceType.Rook, PieceType.Bishop, PieceType.Knight]) {
          moves.push({
            from,
            to: oneSquareAhead,
            piece,
            promotion: promotionType,
            flags: MoveFlags.Promotion,
          });
        }
      } else {
        moves.push({
          from,
          to: oneSquareAhead,
          piece,
          flags: MoveFlags.None,
        });
        
        // Double push from starting position
        if (currentRank === startRank) {
          const twoSquaresAhead = from + direction * 2;
          if (board.getPiece(twoSquaresAhead) === null) {
            moves.push({
              from,
              to: twoSquaresAhead,
              piece,
              flags: MoveFlags.DoublePawnPush,
            });
          }
        }
      }
    }
  }

  // Diagonal captures
  if (!quietsOnly) {
    const captureOffsets = isWhite ? [7, 9] : [-9, -7];
    
    for (const offset of captureOffsets) {
      const targetSquare = from + offset;
      
      // Check board limits
      if (targetSquare < 0 || targetSquare > 63) continue;
      
      const targetFile = targetSquare & 7;
      
      // Check file wrapping (a capture moves exactly 1 file left or right)
      if (Math.abs(targetFile - currentFile) !== 1) continue;
      
      const targetPiece = board.getPiece(targetSquare);
      const targetRank = targetSquare >> 3;
      
      // Regular capture
      if (targetPiece !== null && targetPiece.color !== piece.color) {
        if (targetRank === promotionRank) {
          for (const promotionType of [PieceType.Queen, PieceType.Rook, PieceType.Bishop, PieceType.Knight]) {
            moves.push({
              from,
              to: targetSquare,
              piece,
              captured: targetPiece,
              promotion: promotionType,
              flags: MoveFlags.Capture | MoveFlags.Promotion,
            });
          }
        } else {
          moves.push({
            from,
            to: targetSquare,
            piece,
            captured: targetPiece,
            flags: MoveFlags.Capture,
          });
        }
      }
      
      // En passant capture
      if (state.enPassantSquare === targetSquare) {
        // The captured pawn is on the same rank as our pawn, and the same file as the target square
        const capturedPawnSquare = from + (targetFile - currentFile);
        const capturedPawn = board.getPiece(capturedPawnSquare);
        
        if (capturedPawn && capturedPawn.type === PieceType.Pawn && capturedPawn.color !== piece.color) {
          moves.push({
            from,
            to: targetSquare,
            piece,
            captured: capturedPawn,
            flags: MoveFlags.Capture | MoveFlags.EnPassant,
          });
        }
      }
    }
  }
}
