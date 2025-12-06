/**
 * @file Square.ts
 * @description Square representation and conversion utilities
 */

/**
 * Square index (0-63)
 * 0 = a1, 7 = h1, 56 = a8, 63 = h8
 */
export type Square = number;

/**
 * Rank and file coordinates
 */
export interface Coords {
  rank: number; // 0-7 (0 = rank 1, 7 = rank 8)
  file: number; // 0-7 (0 = file a, 7 = file h)
}

/**
 * Convert a square index to rank/file coordinates
 * @param square Square index (0-63)
 * @returns Coordinates object with rank and file
 * @example squareToCoords(0) // returns { rank: 0, file: 0 } (a1)
 */
export function squareToCoords(square: Square): Coords {
  return {
    rank: Math.floor(square / 8),
    file: square % 8,
  };
}

/**
 * Convert rank/file coordinates to a square index
 * @param rank Rank (0-7)
 * @param file File (0-7)
 * @returns Square index (0-63)
 * @example coordsToSquare(0, 0) // returns 0 (a1)
 */
export function coordsToSquare(rank: number, file: number): Square {
  return rank * 8 + file;
}

/**
 * Convert a square index to algebraic notation
 * @param square Square index (0-63)
 * @returns Algebraic notation string (e.g., "e4")
 * @example squareToAlgebraic(28) // returns "e4"
 */
export function squareToAlgebraic(square: Square): string {
  const { rank, file } = squareToCoords(square);
  const fileChar = String.fromCharCode('a'.charCodeAt(0) + file);
  const rankChar = String(rank + 1);
  return fileChar + rankChar;
}

/**
 * Parse algebraic notation to a square index
 * @param algebraic Algebraic notation string (e.g., "e4")
 * @returns Square index (0-63) or null if invalid
 * @example algebraicToSquare("e4") // returns 28
 */
export function algebraicToSquare(algebraic: string): Square | null {
  if (algebraic.length !== 2) {
    return null;
  }

  const fileChar = algebraic[0]?.toLowerCase();
  const rankChar = algebraic[1];

  if (!fileChar || !rankChar) {
    return null;
  }

  const file = fileChar.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(rankChar, 10) - 1;

  if (!isValidCoords(rank, file)) {
    return null;
  }

  return coordsToSquare(rank, file);
}

/**
 * Check if a square index is within board boundaries
 * @param square Square index to check
 * @returns True if the square is valid (0-63)
 */
export function isValidSquare(square: Square): boolean {
  return square >= 0 && square <= 63;
}

/**
 * Check if rank/file coordinates are within board boundaries
 * @param rank Rank to check (should be 0-7)
 * @param file File to check (should be 0-7)
 * @returns True if both rank and file are valid
 */
export function isValidCoords(rank: number, file: number): boolean {
  return rank >= 0 && rank <= 7 && file >= 0 && file <= 7;
}

/**
 * Get the distance between two squares
 * @param sq1 First square
 * @param sq2 Second square
 * @returns Manhattan distance between squares
 */
export function squareDistance(sq1: Square, sq2: Square): number {
  const coords1 = squareToCoords(sq1);
  const coords2 = squareToCoords(sq2);
  return Math.abs(coords1.rank - coords2.rank) + Math.abs(coords1.file - coords2.file);
}

/**
 * Get the Chebyshev distance (max of rank/file difference) between two squares
 * @param sq1 First square
 * @param sq2 Second square
 * @returns Chebyshev distance
 */
export function chebyshevDistance(sq1: Square, sq2: Square): number {
  const coords1 = squareToCoords(sq1);
  const coords2 = squareToCoords(sq2);
  return Math.max(
    Math.abs(coords1.rank - coords2.rank),
    Math.abs(coords1.file - coords2.file)
  );
}

/**
 * Check if two squares are on the same rank
 * @param sq1 First square
 * @param sq2 Second square
 * @returns True if both squares are on the same rank
 */
export function sameRank(sq1: Square, sq2: Square): boolean {
  return Math.floor(sq1 / 8) === Math.floor(sq2 / 8);
}

/**
 * Check if two squares are on the same file
 * @param sq1 First square
 * @param sq2 Second square
 * @returns True if both squares are on the same file
 */
export function sameFile(sq1: Square, sq2: Square): boolean {
  return (sq1 % 8) === (sq2 % 8);
}

/**
 * Check if two squares are on the same diagonal
 * @param sq1 First square
 * @param sq2 Second square
 * @returns True if both squares are on the same diagonal
 */
export function sameDiagonal(sq1: Square, sq2: Square): boolean {
  const coords1 = squareToCoords(sq1);
  const coords2 = squareToCoords(sq2);
  const rankDiff = Math.abs(coords1.rank - coords2.rank);
  const fileDiff = Math.abs(coords1.file - coords2.file);
  return rankDiff === fileDiff;
}
