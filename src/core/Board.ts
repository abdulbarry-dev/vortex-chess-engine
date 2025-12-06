/**
 * @file Board.ts
 * @description Chess board representation using 8x8 array
 */

import { Color, Piece, PieceType } from './Piece';
import { Square, isValidSquare } from './Square';

/**
 * Chess board representation using 64-element array
 * Square 0 = a1, Square 63 = h8
 */
export class Board {
  private squares: (Piece | null)[];

  /**
   * Create a new board (empty by default)
   */
  constructor() {
    this.squares = new Array(64).fill(null);
  }

  /**
   * Get the piece at a given square
   * @param square Square index (0-63)
   * @returns Piece at the square, or null if empty
   */
  getPiece(square: Square): Piece | null {
    if (!isValidSquare(square)) {
      throw new Error(`Invalid square: ${square}`);
    }
    return this.squares[square] ?? null;
  }

  /**
   * Set a piece at a given square
   * @param square Square index (0-63)
   * @param piece Piece to place, or null to clear the square
   */
  setPiece(square: Square, piece: Piece | null): void {
    if (!isValidSquare(square)) {
      throw new Error(`Invalid square: ${square}`);
    }
    this.squares[square] = piece;
  }

  /**
   * Check if a square is empty
   * @param square Square index (0-63)
   * @returns True if the square is empty
   */
  isEmpty(square: Square): boolean {
    return this.getPiece(square) === null;
  }

  /**
   * Check if a square is occupied by a piece of the given color
   * @param square Square index (0-63)
   * @param color Color to check
   * @returns True if square contains a piece of the specified color
   */
  isOccupiedByColor(square: Square, color: Color): boolean {
    const piece = this.getPiece(square);
    return piece !== null && piece.color === color;
  }

  /**
   * Clear all pieces from the board
   */
  clear(): void {
    this.squares.fill(null);
  }

  /**
   * Initialize the board with the standard chess starting position
   */
  initializeStartingPosition(): void {
    this.clear();

    // White pieces (rank 1 and 2)
    this.setPiece(0, { type: PieceType.Rook, color: Color.White });
    this.setPiece(1, { type: PieceType.Knight, color: Color.White });
    this.setPiece(2, { type: PieceType.Bishop, color: Color.White });
    this.setPiece(3, { type: PieceType.Queen, color: Color.White });
    this.setPiece(4, { type: PieceType.King, color: Color.White });
    this.setPiece(5, { type: PieceType.Bishop, color: Color.White });
    this.setPiece(6, { type: PieceType.Knight, color: Color.White });
    this.setPiece(7, { type: PieceType.Rook, color: Color.White });

    // White pawns
    for (let file = 0; file < 8; file++) {
      this.setPiece(8 + file, { type: PieceType.Pawn, color: Color.White });
    }

    // Black pawns
    for (let file = 0; file < 8; file++) {
      this.setPiece(48 + file, { type: PieceType.Pawn, color: Color.Black });
    }

    // Black pieces (rank 8)
    this.setPiece(56, { type: PieceType.Rook, color: Color.Black });
    this.setPiece(57, { type: PieceType.Knight, color: Color.Black });
    this.setPiece(58, { type: PieceType.Bishop, color: Color.Black });
    this.setPiece(59, { type: PieceType.Queen, color: Color.Black });
    this.setPiece(60, { type: PieceType.King, color: Color.Black });
    this.setPiece(61, { type: PieceType.Bishop, color: Color.Black });
    this.setPiece(62, { type: PieceType.Knight, color: Color.Black });
    this.setPiece(63, { type: PieceType.Rook, color: Color.Black });
  }

  /**
   * Create a deep copy of the board
   * @returns A new Board instance with the same piece positions
   */
  clone(): Board {
    const newBoard = new Board();
    for (let square = 0; square < 64; square++) {
      const piece = this.squares[square];
      if (piece) {
        newBoard.setPiece(square, { ...piece });
      }
    }
    return newBoard;
  }

  /**
   * Count pieces of a specific type and color
   * @param type Piece type to count
   * @param color Piece color to count
   * @returns Number of matching pieces on the board
   */
  countPieces(type: PieceType, color: Color): number {
    let count = 0;
    for (let square = 0; square < 64; square++) {
      const piece = this.squares[square];
      if (piece && piece.type === type && piece.color === color) {
        count++;
      }
    }
    return count;
  }

  /**
   * Find all squares occupied by pieces of a specific type and color
   * @param type Piece type to find
   * @param color Piece color to find
   * @returns Array of square indices
   */
  findPieces(type: PieceType, color: Color): Square[] {
    const squares: Square[] = [];
    for (let square = 0; square < 64; square++) {
      const piece = this.squares[square];
      if (piece && piece.type === type && piece.color === color) {
        squares.push(square);
      }
    }
    return squares;
  }

  /**
   * Find the king of a given color
   * @param color Color of the king to find
   * @returns Square index of the king, or null if not found
   */
  findKing(color: Color): Square | null {
    const kings = this.findPieces(PieceType.King, color);
    return kings.length > 0 ? kings[0] ?? null : null;
  }

  /**
   * Get all pieces on the board
   * @returns Array of [square, piece] tuples for all non-empty squares
   */
  getAllPieces(): Array<[Square, Piece]> {
    const pieces: Array<[Square, Piece]> = [];
    for (let square = 0; square < 64; square++) {
      const piece = this.squares[square];
      if (piece) {
        pieces.push([square, piece]);
      }
    }
    return pieces;
  }

  /**
   * Get all pieces of a specific color
   * @param color Color of pieces to get
   * @returns Array of [square, piece] tuples
   */
  getPiecesByColor(color: Color): Array<[Square, Piece]> {
    return this.getAllPieces().filter(([_, piece]) => piece.color === color);
  }
}
