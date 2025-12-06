/**
 * @file FenGenerator.ts
 * @description Generate FEN (Forsyth-Edwards Notation) strings from board and game state
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { getPieceChar } from '../core/Piece';
import { coordsToSquare, squareToAlgebraic } from '../core/Square';

/**
 * Generate a FEN string from board and game state
 * @param board Board to serialize
 * @param state Game state to serialize
 * @returns FEN string representation
 * 
 * @example
 * const fen = generateFen(board, state);
 * // Returns: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
 */
export function generateFen(board: Board, state: GameState): string {
  const parts: string[] = [];

  // Field 1: Piece placement
  parts.push(generatePiecePlacement(board));

  // Field 2: Active color
  parts.push(generateActiveColor(state));

  // Field 3: Castling rights
  parts.push(generateCastlingRights(state));

  // Field 4: En passant target square
  parts.push(generateEnPassantSquare(state));

  // Field 5: Halfmove clock
  parts.push(state.halfmoveClock.toString());

  // Field 6: Fullmove number
  parts.push(state.fullmoveNumber.toString());

  return parts.join(' ');
}

/**
 * Generate the piece placement field of a FEN string
 * @param board Board to serialize
 * @returns Piece placement string (e.g., "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR")
 */
function generatePiecePlacement(board: Board): string {
  const ranks: string[] = [];

  // Process ranks from 8 to 1 (FEN is written from rank 8 down to rank 1)
  for (let rank = 7; rank >= 0; rank--) {
    let rankStr = '';
    let emptyCount = 0;

    for (let file = 0; file < 8; file++) {
      const square = coordsToSquare(rank, file);
      const piece = board.getPiece(square);

      if (piece === null) {
        emptyCount++;
      } else {
        // If we had empty squares, add the count first
        if (emptyCount > 0) {
          rankStr += emptyCount.toString();
          emptyCount = 0;
        }
        // Add the piece character
        rankStr += getPieceChar(piece);
      }
    }

    // Add any remaining empty squares at the end of the rank
    if (emptyCount > 0) {
      rankStr += emptyCount.toString();
    }

    ranks.push(rankStr);
  }

  return ranks.join('/');
}

/**
 * Generate the active color field
 * @param state Game state
 * @returns 'w' for white, 'b' for black
 */
function generateActiveColor(state: GameState): string {
  return state.currentPlayer === 1 ? 'w' : 'b'; // Color.White = 1
}

/**
 * Generate the castling rights field
 * @param state Game state
 * @returns Castling rights string (e.g., "KQkq", "Kq", "-")
 */
function generateCastlingRights(state: GameState): string {
  return state.getCastlingString();
}

/**
 * Generate the en passant target square field
 * @param state Game state
 * @returns En passant square in algebraic notation or "-"
 */
function generateEnPassantSquare(state: GameState): string {
  if (state.enPassantSquare === null) {
    return '-';
  }
  return squareToAlgebraic(state.enPassantSquare);
}

/**
 * Generate a FEN string for just the piece placement (useful for debugging)
 * @param board Board to serialize
 * @returns Piece placement string only
 */
export function generatePiecePlacementOnly(board: Board): string {
  return generatePiecePlacement(board);
}

/**
 * Generate a simplified FEN string without move counters (useful for position comparison)
 * @param board Board to serialize
 * @param state Game state to serialize
 * @returns Simplified FEN string (without halfmove clock and fullmove number)
 */
export function generateSimplifiedFen(board: Board, state: GameState): string {
  const parts: string[] = [];

  parts.push(generatePiecePlacement(board));
  parts.push(generateActiveColor(state));
  parts.push(generateCastlingRights(state));
  parts.push(generateEnPassantSquare(state));

  return parts.join(' ');
}
