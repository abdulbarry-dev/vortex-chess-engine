/**
 * @file Piece.ts
 * @description Piece type definitions and utility functions
 */

/**
 * Chess piece types
 */
export enum PieceType {
  Pawn = 1,
  Knight = 2,
  Bishop = 3,
  Rook = 4,
  Queen = 5,
  King = 6,
}

/**
 * Piece colors
 */
export enum Color {
  White = 1,
  Black = -1,
}

/**
 * Complete piece representation
 */
export interface Piece {
  type: PieceType;
  color: Color;
}

/**
 * Check if a piece is a sliding piece (bishop, rook, or queen)
 * @param piece The piece to check
 * @returns True if the piece can slide across multiple squares
 */
export function isSliding(piece: Piece): boolean {
  return (
    piece.type === PieceType.Bishop ||
    piece.type === PieceType.Rook ||
    piece.type === PieceType.Queen
  );
}

/**
 * Get the character representation of a piece
 * @param piece The piece to convert
 * @returns Single character representing the piece (uppercase for white, lowercase for black)
 * @example getPieceChar({ type: PieceType.Knight, color: Color.White }) // returns 'N'
 */
export function getPieceChar(piece: Piece): string {
  const chars: Record<PieceType, string> = {
    [PieceType.Pawn]: 'P',
    [PieceType.Knight]: 'N',
    [PieceType.Bishop]: 'B',
    [PieceType.Rook]: 'R',
    [PieceType.Queen]: 'Q',
    [PieceType.King]: 'K',
  };

  const char = chars[piece.type];
  return piece.color === Color.White ? char : char.toLowerCase();
}

/**
 * Parse a piece from its character representation
 * @param char Single character representing a piece
 * @returns Piece object or null if invalid character
 * @example getPieceFromChar('N') // returns { type: PieceType.Knight, color: Color.White }
 */
export function getPieceFromChar(char: string): Piece | null {
  const color = char === char.toUpperCase() ? Color.White : Color.Black;
  const upperChar = char.toUpperCase();

  const typeMap: Record<string, PieceType> = {
    'P': PieceType.Pawn,
    'N': PieceType.Knight,
    'B': PieceType.Bishop,
    'R': PieceType.Rook,
    'Q': PieceType.Queen,
    'K': PieceType.King,
  };

  const type = typeMap[upperChar];
  if (!type) {
    return null;
  }

  return { type, color };
}

/**
 * Get the name of a piece type
 * @param type The piece type
 * @returns Human-readable name of the piece
 */
export function getPieceTypeName(type: PieceType): string {
  const names: Record<PieceType, string> = {
    [PieceType.Pawn]: 'Pawn',
    [PieceType.Knight]: 'Knight',
    [PieceType.Bishop]: 'Bishop',
    [PieceType.Rook]: 'Rook',
    [PieceType.Queen]: 'Queen',
    [PieceType.King]: 'King',
  };
  return names[type];
}

/**
 * Get the opposite color
 * @param color The color to flip
 * @returns The opposite color
 */
export function oppositeColor(color: Color): Color {
  return color === Color.White ? Color.Black : Color.White;
}
