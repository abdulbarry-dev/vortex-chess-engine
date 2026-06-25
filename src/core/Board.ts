/**
 * @file Board.ts
 * @description Chess board representation using 8x8 array with bitboard acceleration.
 * Hybrid design: maintains both a piece array (for compatibility) and bitboards (for speed).
 */

import { EMPTY_BB, clearBit, hasBit, setBit, bitScanForward, popCount } from '../bitboard/Bitboard';
import { Color, Piece, PieceType } from './Piece';
import { Square, isValidSquare } from './Square';
import { Accumulator } from '../nnue/Accumulator';

/**
 * Compute a unique index into the pieceBB array for a given color and piece type.
 * White pieces: indices 0-5, Black pieces: indices 6-11.
 */
function bbIndex(color: Color, type: PieceType): number {
  // PieceType is 1-6, Color.White=1, Color.Black=-1
  return (color === Color.White ? 0 : 6) + (type - 1);
}

/**
 * Chess board representation using 64-element array with bitboard acceleration.
 * Square 0 = a1, Square 63 = h8
 */
export class Board {
  private squares: (Piece | null)[];

  // ── Bitboard state ──────────────────────────────────────────────────────
  /**
   * 12 piece bitboards indexed by bbIndex(color, pieceType).
   * [0]=WP, [1]=WN, [2]=WB, [3]=WR, [4]=WQ, [5]=WK,
   * [6]=BP, [7]=BN, [8]=BB, [9]=BR, [10]=BQ, [11]=BK
   */
  private pieceBB: bigint[];

  /** White occupancy (union of all white piece bitboards) */
  private whiteBB: bigint;

  /** Black occupancy (union of all black piece bitboards) */
  private blackBB: bigint;

  /** Total occupancy (white | black) */
  private allBB: bigint;

  /** NNUE Accumulator for incrementally updated hidden layer */
  private accumulator: Accumulator;

  /**
   * Create a new board (empty by default)
   */
  constructor() {
    this.squares = new Array(64).fill(null);
    this.pieceBB = new Array(12).fill(EMPTY_BB);
    this.whiteBB = EMPTY_BB;
    this.blackBB = EMPTY_BB;
    this.allBB = EMPTY_BB;
    this.accumulator = new Accumulator();
  }

  // ── Bitboard accessors ────────────────────────────────────────────────────

  /**
   * Get the bitboard for a specific piece type and color.
   */
  getPieceBitboard(type: PieceType, color: Color): bigint {
    return this.pieceBB[bbIndex(color, type)] ?? EMPTY_BB;
  }

  /**
   * Get occupancy bitboard for a given color.
   */
  getColorOccupancy(color: Color): bigint {
    return color === Color.White ? this.whiteBB : this.blackBB;
  }

  /**
   * Get total occupancy bitboard.
   */
  getOccupancy(): bigint {
    return this.allBB;
  }

  /**
   * Get the NNUE accumulator
   */
  getAccumulator(): Accumulator {
    return this.accumulator;
  }

  // ── Core piece access ─────────────────────────────────────────────────────

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
   * Set a piece at a given square (updates both array and bitboards)
   * @param square Square index (0-63)
   * @param piece Piece to place, or null to clear the square
   */
  setPiece(square: Square, piece: Piece | null): void {
    if (!isValidSquare(square)) {
      throw new Error(`Invalid square: ${square}`);
    }

    // Remove the old piece from bitboards
    const oldPiece = this.squares[square];
    if (oldPiece) {
      const idx = bbIndex(oldPiece.color, oldPiece.type);
      this.pieceBB[idx] = clearBit(this.pieceBB[idx] ?? EMPTY_BB, square);
      if (oldPiece.color === Color.White) {
        this.whiteBB = clearBit(this.whiteBB, square);
      } else {
        this.blackBB = clearBit(this.blackBB, square);
      }
      this.allBB = clearBit(this.allBB, square);
      this.accumulator.removeFeature(oldPiece.type, oldPiece.color, square);
    }

    // Place the new piece
    this.squares[square] = piece;
    if (piece) {
      const idx = bbIndex(piece.color, piece.type);
      this.pieceBB[idx] = setBit(this.pieceBB[idx] ?? EMPTY_BB, square);
      if (piece.color === Color.White) {
        this.whiteBB = setBit(this.whiteBB, square);
      } else {
        this.blackBB = setBit(this.blackBB, square);
      }
      this.allBB = setBit(this.allBB, square);
      this.accumulator.addFeature(piece.type, piece.color, square);
    }
  }

  /**
   * Set a piece at a given square without updating the NNUE accumulator.
   * STRICTLY FOR USE IN LEGALITY CHECKING (make/unmake) where evaluation isn't needed.
   */
  setPieceFast(square: Square, piece: Piece | null): void {
    if (!isValidSquare(square)) {
      throw new Error(`Invalid square: ${square}`);
    }

    // Remove the old piece from bitboards
    const oldPiece = this.squares[square];
    if (oldPiece) {
      const idx = bbIndex(oldPiece.color, oldPiece.type);
      this.pieceBB[idx] = clearBit(this.pieceBB[idx] ?? EMPTY_BB, square);
      if (oldPiece.color === Color.White) {
        this.whiteBB = clearBit(this.whiteBB, square);
      } else {
        this.blackBB = clearBit(this.blackBB, square);
      }
      this.allBB = clearBit(this.allBB, square);
    }

    // Place the new piece
    this.squares[square] = piece;
    if (piece) {
      const idx = bbIndex(piece.color, piece.type);
      this.pieceBB[idx] = setBit(this.pieceBB[idx] ?? EMPTY_BB, square);
      if (piece.color === Color.White) {
        this.whiteBB = setBit(this.whiteBB, square);
      } else {
        this.blackBB = setBit(this.blackBB, square);
      }
      this.allBB = setBit(this.allBB, square);
    }
  }

  /**
   * Check if a square is empty
   * @param square Square index (0-63)
   * @returns True if the square is empty
   */
  isEmpty(square: Square): boolean {
    return !hasBit(this.allBB, square);
  }

  /**
   * Check if a square is occupied by a piece of the given color
   * @param square Square index (0-63)
   * @param color Color to check
   * @returns True if square contains a piece of the specified color
   */
  isOccupiedByColor(square: Square, color: Color): boolean {
    return hasBit(this.getColorOccupancy(color), square);
  }

  /**
   * Clear all pieces from the board
   */
  clear(): void {
    this.squares.fill(null);
    this.pieceBB.fill(EMPTY_BB);
    this.whiteBB = EMPTY_BB;
    this.blackBB = EMPTY_BB;
    this.allBB = EMPTY_BB;
    this.accumulator = new Accumulator();
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
    // Copy piece array
    for (let square = 0; square < 64; square++) {
      const piece = this.squares[square];
      if (piece) {
        newBoard.squares[square] = { ...piece };
      }
    }
    // Copy bitboards directly (bigint is immutable)
    for (let i = 0; i < 12; i++) {
      newBoard.pieceBB[i] = this.pieceBB[i] ?? EMPTY_BB;
    }
    newBoard.whiteBB = this.whiteBB;
    newBoard.blackBB = this.blackBB;
    newBoard.allBB = this.allBB;
    newBoard.accumulator.copyFrom(this.accumulator);
    return newBoard;
  }

  /**
   * Count pieces of a specific type and color
   * @param type Piece type to count
   * @param color Piece color to count
   * @returns Number of matching pieces on the board
   */
  countPieces(type: PieceType, color: Color): number {
    return popCount(this.getPieceBitboard(type, color));
  }

  /**
   * Find all squares occupied by pieces of a specific type and color
   * @param type Piece type to find
   * @param color Piece color to find
   * @returns Array of square indices
   */
  findPieces(type: PieceType, color: Color): Square[] {
    const squares: Square[] = [];
    let bb = this.getPieceBitboard(type, color);
    while (bb !== EMPTY_BB) {
      const sq = bitScanForward(bb);
      squares.push(sq);
      bb &= bb - 1n; // Clear LSB
    }
    return squares;
  }

  /**
   * Find the king of a given color
   * @param color Color of the king to find
   * @returns Square index of the king, or null if not found
   */
  findKing(color: Color): Square | null {
    const kingBB = this.getPieceBitboard(PieceType.King, color);
    if (kingBB === EMPTY_BB) return null;
    return bitScanForward(kingBB);
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
