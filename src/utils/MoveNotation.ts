/**
 * @file MoveNotation.ts
 * @description Convert moves to/from algebraic notation
 * 
 * Supports:
 * - UCI notation (e2e4, e7e5q for promotion)
 * - Standard algebraic notation (e4, Nf3, O-O)
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { PieceType } from '../core/Piece';
import { algebraicToSquare } from '../core/Square';
import { MoveGenerator } from '../move-generation/MoveGenerator';
import { Move, MoveFlags } from '../types/Move.types';

/**
 * Convert file index to character
 */
function fileToChar(file: number): string {
  return String.fromCharCode('a'.charCodeAt(0) + file);
}

/**
 * Convert rank index to character
 */
function rankToChar(rank: number): string {
  return String(rank + 1);
}

/**
 * Convert UCI square string to square index
 */
function squareFromString(algebraic: string): number | null {
  return algebraicToSquare(algebraic);
}

/**
 * Convert move to UCI notation
 * 
 * Examples:
 * - e2e4
 * - e7e8q (pawn promotion to queen)
 * - e1g1 (castling)
 * 
 * @param move Move to convert
 * @returns UCI string
 */
export function toUci(move: Move): string {
  const fromFile = fileToChar(move.from % 8);
  const fromRank = rankToChar(Math.floor(move.from / 8));
  const toFile = fileToChar(move.to % 8);
  const toRank = rankToChar(Math.floor(move.to / 8));

  let uci = `${fromFile}${fromRank}${toFile}${toRank}`;

  // Add promotion piece
  if (move.promotion) {
    const promotionChar = getPieceChar(move.promotion).toLowerCase();
    uci += promotionChar;
  }

  return uci;
}

/**
 * Parse UCI notation to move
 * 
 * @param uci UCI string (e.g., "e2e4", "e7e8q")
 * @param board Current board
 * @param state Current game state
 * @returns Move or null if invalid
 */
export function fromUci(uci: string, board: Board, state: GameState): Move | null {
  if (uci.length < 4) return null;

  // Parse squares
  const fromSquare = squareFromString(uci.substring(0, 2));
  const toSquare = squareFromString(uci.substring(2, 4));

  if (fromSquare === null || toSquare === null) return null;

  // Parse promotion (if present)
  let promotion: PieceType | undefined;
  if (uci.length === 5) {
    const charAtIndex4 = uci[4];
    if (!charAtIndex4) return null;
    const promType = charToPieceType(charAtIndex4);
    if (promType === null) return null;
    promotion = promType;
  }

  // Generate all legal moves and find matching one
  const moveGen = new MoveGenerator();
  const legalMoves = moveGen.generateLegalMoves(board, state);

  for (const move of legalMoves) {
    if (move.from === fromSquare && move.to === toSquare) {
      // Check promotion matches (if applicable)
      if (promotion !== undefined && move.promotion !== promotion) {
        continue;
      }
      return move;
    }
  }

  return null;
}

/**
 * Convert move to standard algebraic notation (SAN)
 * 
 * Examples:
 * - e4
 * - Nf3
 * - Bxe5+
 * - O-O
 * - Qxh7#
 * 
 * @param move Move to convert
 * @param board Current board
 * @param state Current game state
 * @returns SAN string
 */
export function toSan(move: Move, board: Board, state: GameState): string {
  const piece = move.piece;
  
  // Castling
  if (move.flags & MoveFlags.Castle) {
    return move.to > move.from ? 'O-O' : 'O-O-O';
  }

  let san = '';

  // Piece letter (not for pawns)
  if (piece.type !== PieceType.Pawn) {
    san += getPieceChar(piece.type);
  }

  // Disambiguation (if needed)
  san += getDisambiguation(move, board, state);

  // Capture
  if (move.captured) {
    if (piece.type === PieceType.Pawn) {
      // Pawn captures include file
      san += fileToChar(move.from % 8);
    }
    san += 'x';
  }

  // Destination square
  const toFile = fileToChar(move.to % 8);
  const toRank = rankToChar(Math.floor(move.to / 8));
  san += `${toFile}${toRank}`;

  // Promotion
  if (move.promotion) {
    san += '=' + getPieceChar(move.promotion);
  }

  // Check/checkmate (would need to make move and test)
  // For simplicity, we'll skip this for now
  // TODO: Add check/mate detection

  return san;
}

/**
 * Get disambiguation string for move
 * (e.g., "d" for Ndf3 when another knight can go to f3)
 */
function getDisambiguation(move: Move, board: Board, state: GameState): string {
  const piece = move.piece;
  
  // Pawns don't need disambiguation (except for captures, handled elsewhere)
  if (piece.type === PieceType.Pawn) {
    return '';
  }

  // Find all other pieces of same type that can move to same square
  const moveGen = new MoveGenerator();
  const legalMoves = moveGen.generateLegalMoves(board, state);

  const conflictingMoves = legalMoves.filter(m => 
    m.to === move.to &&
    m.from !== move.from &&
    m.piece.type === piece.type &&
    m.piece.color === piece.color
  );

  if (conflictingMoves.length === 0) {
    return ''; // No disambiguation needed
  }

  // Check if file disambiguation is enough
  const fromFile = move.from % 8;
  const sameFile = conflictingMoves.some(m => m.from % 8 === fromFile);

  if (!sameFile) {
    return fileToChar(fromFile);
  }

  // Check if rank disambiguation is enough
  const fromRank = Math.floor(move.from / 8);
  const sameRank = conflictingMoves.some(m => Math.floor(m.from / 8) === fromRank);

  if (!sameRank) {
    return rankToChar(fromRank);
  }

  // Need both file and rank
  return fileToChar(fromFile) + rankToChar(fromRank);
}

/**
 * Get piece character
 */
function getPieceChar(pieceType: PieceType): string {
  switch (pieceType) {
    case PieceType.King: return 'K';
    case PieceType.Queen: return 'Q';
    case PieceType.Rook: return 'R';
    case PieceType.Bishop: return 'B';
    case PieceType.Knight: return 'N';
    case PieceType.Pawn: return 'P';
    default: return '?';
  }
}

/**
 * Convert character to piece type
 */
function charToPieceType(char: string): PieceType | null {
  switch (char.toLowerCase()) {
    case 'k': return PieceType.King;
    case 'q': return PieceType.Queen;
    case 'r': return PieceType.Rook;
    case 'b': return PieceType.Bishop;
    case 'n': return PieceType.Knight;
    case 'p': return PieceType.Pawn;
    default: return null;
  }
}
