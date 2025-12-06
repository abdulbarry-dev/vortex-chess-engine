/**
 * @file FenParser.ts
 * @description Parse FEN (Forsyth-Edwards Notation) strings into board and game state
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color, getPieceFromChar } from '../core/Piece';
import { algebraicToSquare, coordsToSquare } from '../core/Square';

/**
 * Result of parsing a FEN string
 */
export interface FenParseResult {
  board: Board;
  state: GameState;
}

/**
 * Parse a FEN string into board and game state
 * @param fen FEN string to parse
 * @returns Parsed board and game state
 * @throws Error if FEN string is invalid
 * 
 * @example
 * const result = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
 */
export function parseFen(fen: string): FenParseResult {
  const parts = fen.trim().split(/\s+/);

  if (parts.length < 4) {
    throw new Error('Invalid FEN: must have at least 4 fields (position, turn, castling, en passant)');
  }

  const [piecePlacement, activeColor, castlingRights, enPassant, halfmove = '0', fullmove = '1'] = parts;

  if (!piecePlacement || !activeColor || !castlingRights || !enPassant) {
    throw new Error('Invalid FEN: missing required fields');
  }

  const board = new Board();
  const state = new GameState();

  // Parse piece placement (field 1)
  parsePiecePlacement(board, piecePlacement);

  // Parse active color (field 2)
  parseActiveColor(state, activeColor);

  // Parse castling rights (field 3)
  parseCastlingRights(state, castlingRights);

  // Parse en passant square (field 4)
  parseEnPassantSquare(state, enPassant);

  // Parse halfmove clock (field 5)
  parseHalfmoveClock(state, halfmove);

  // Parse fullmove number (field 6)
  parseFullmoveNumber(state, fullmove);

  return { board, state };
}

/**
 * Parse the piece placement field of a FEN string
 * @param board Board to populate
 * @param piecePlacement Piece placement string (e.g., "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR")
 */
function parsePiecePlacement(board: Board, piecePlacement: string): void {
  const ranks = piecePlacement.split('/');

  if (ranks.length !== 8) {
    throw new Error(`Invalid FEN: piece placement must have 8 ranks, found ${ranks.length}`);
  }

  // Process ranks from 8 to 1 (FEN is written from rank 8 down to rank 1)
  for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
    const rank = 7 - rankIndex; // Rank 8 = index 7, Rank 1 = index 0
    const rankStr = ranks[rankIndex];

    if (!rankStr) {
      throw new Error(`Invalid FEN: missing rank ${rank + 1}`);
    }

    let file = 0;

    for (const char of rankStr) {
      if (file >= 8) {
        throw new Error(`Invalid FEN: rank ${rank + 1} has too many squares`);
      }

      // Check if it's a digit (empty squares)
      if (/\d/.test(char)) {
        const emptySquares = parseInt(char, 10);
        if (emptySquares < 1 || emptySquares > 8) {
          throw new Error(`Invalid FEN: invalid empty square count '${char}'`);
        }
        file += emptySquares;
      } else {
        // It's a piece
        const piece = getPieceFromChar(char);
        if (!piece) {
          throw new Error(`Invalid FEN: invalid piece character '${char}'`);
        }

        const square = coordsToSquare(rank, file);
        board.setPiece(square, piece);
        file++;
      }
    }

    if (file !== 8) {
      throw new Error(`Invalid FEN: rank ${rank + 1} has ${file} squares, expected 8`);
    }
  }
}

/**
 * Parse the active color field
 * @param state Game state to update
 * @param activeColor Active color string ('w' or 'b')
 */
function parseActiveColor(state: GameState, activeColor: string): void {
  if (activeColor === 'w') {
    state.currentPlayer = Color.White;
  } else if (activeColor === 'b') {
    state.currentPlayer = Color.Black;
  } else {
    throw new Error(`Invalid FEN: active color must be 'w' or 'b', got '${activeColor}'`);
  }
}

/**
 * Parse the castling rights field
 * @param state Game state to update
 * @param castlingRights Castling rights string (e.g., "KQkq", "Kq", "-")
 */
function parseCastlingRights(state: GameState, castlingRights: string): void {
  // Reset all castling rights first
  state.castlingRights = {
    white: { kingSide: false, queenSide: false },
    black: { kingSide: false, queenSide: false },
  };

  if (castlingRights === '-') {
    return; // No castling rights
  }

  for (const char of castlingRights) {
    switch (char) {
      case 'K':
        state.castlingRights.white.kingSide = true;
        break;
      case 'Q':
        state.castlingRights.white.queenSide = true;
        break;
      case 'k':
        state.castlingRights.black.kingSide = true;
        break;
      case 'q':
        state.castlingRights.black.queenSide = true;
        break;
      default:
        throw new Error(`Invalid FEN: invalid castling rights character '${char}'`);
    }
  }
}

/**
 * Parse the en passant target square field
 * @param state Game state to update
 * @param enPassant En passant square string (e.g., "e3", "-")
 */
function parseEnPassantSquare(state: GameState, enPassant: string): void {
  if (enPassant === '-') {
    state.enPassantSquare = null;
    return;
  }

  const square = algebraicToSquare(enPassant);
  if (square === null) {
    throw new Error(`Invalid FEN: invalid en passant square '${enPassant}'`);
  }

  state.enPassantSquare = square;
}

/**
 * Parse the halfmove clock field
 * @param state Game state to update
 * @param halfmove Halfmove clock string
 */
function parseHalfmoveClock(state: GameState, halfmove: string): void {
  const clock = parseInt(halfmove, 10);
  if (isNaN(clock) || clock < 0) {
    throw new Error(`Invalid FEN: halfmove clock must be a non-negative integer, got '${halfmove}'`);
  }
  state.halfmoveClock = clock;
}

/**
 * Parse the fullmove number field
 * @param state Game state to update
 * @param fullmove Fullmove number string
 */
function parseFullmoveNumber(state: GameState, fullmove: string): void {
  const moveNum = parseInt(fullmove, 10);
  if (isNaN(moveNum) || moveNum < 1) {
    throw new Error(`Invalid FEN: fullmove number must be a positive integer, got '${fullmove}'`);
  }
  state.fullmoveNumber = moveNum;
}

/**
 * Validate that a FEN string is well-formed
 * @param fen FEN string to validate
 * @returns True if valid, throws error otherwise
 */
export function validateFen(fen: string): boolean {
  try {
    parseFen(fen);
    return true;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`FEN validation failed: ${error.message}`);
    }
    throw error;
  }
}
