/**
 * @file PawnMoves.ts
 * @description Generate pawn moves (most complex piece due to special rules)
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color, Piece, PieceType } from '../core/Piece';
import { coordsToSquare, Square, squareToCoords } from '../core/Square';
import { Move, MoveFlags } from '../types/Move.types';

/**
 * Generate pawn moves (pushes, captures, en passant, promotions)
 * Pawns are the most complex pieces due to:
 * - Direction depends on color
 * - Can move 1 or 2 squares on first move
 * - Capture diagonally
 * - En passant capture
 * - Promotion on last rank
 * 
 * @param board Current board state
 * @param state Game state (for en passant)
 * @param from Starting square
 * @param piece Pawn piece
 * @param moves Array to populate with generated moves
 */
export function generatePawnMoves(
  board: Board,
  state: GameState,
  from: Square,
  piece: Piece,
  moves: Move[]
): void {
  const { rank: currentRank, file: currentFile } = squareToCoords(from);
  const isWhite = piece.color === Color.White;
  
  // Pawns move in opposite directions for white and black
  const direction = isWhite ? 1 : -1; // White moves up (+1), black moves down (-1)
  const pawnStartRank = isWhite ? 1 : 6; // Starting rank for pawns
  const promotionRank = isWhite ? 7 : 0; // Rank where pawns promote

  // Forward push (one square)
  const oneSquareAhead = coordsToSquare(currentRank + direction, currentFile);
  if (board.getPiece(oneSquareAhead) === null) {
    const targetRank = currentRank + direction;
    
    // Check for promotion
    if (targetRank === promotionRank) {
      // Generate all promotion moves
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
      // Regular push
      moves.push({
        from,
        to: oneSquareAhead,
        piece,
        flags: MoveFlags.None,
      });
      
      // Double push from starting position
      if (currentRank === pawnStartRank) {
        const twoSquaresAhead = coordsToSquare(currentRank + direction * 2, currentFile);
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

  // Diagonal captures
  for (const fileDelta of [-1, 1]) {
    const targetFile = currentFile + fileDelta;
    
    // Check if target file is on board
    if (targetFile < 0 || targetFile > 7) {
      continue;
    }
    
    const targetRank = currentRank + direction;
    const targetSquare = coordsToSquare(targetRank, targetFile);
    const targetPiece = board.getPiece(targetSquare);
    
    // Regular capture
    if (targetPiece !== null && targetPiece.color !== piece.color) {
      // Check for promotion
      if (targetRank === promotionRank) {
        // Generate all promotion-capture moves
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
        // Regular capture
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
      const capturedPawnSquare = coordsToSquare(currentRank, targetFile);
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
