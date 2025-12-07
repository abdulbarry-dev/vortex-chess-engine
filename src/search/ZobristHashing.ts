/**
 * @file ZobristHashing.ts
 * @description Zobrist hashing for position identification
 * 
 * Zobrist hashing creates a unique 64-bit hash for each position.
 * This is used for the transposition table to quickly identify
 * positions we've already evaluated.
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color, Piece, PieceType } from '../core/Piece';
import { Square } from '../core/Square';
import { Move, MoveFlags } from '../types/Move.types';

/**
 * Zobrist hasher for chess positions
 * 
 * Hash includes:
 * - Piece positions (12 piece types × 64 squares)
 * - Side to move
 * - Castling rights (4 possibilities)
 * - En passant square (8 files)
 */
export class ZobristHasher {
  private pieceKeys: bigint[][][]; // [color][pieceType][square]
  private sideKey: bigint;
  private castlingKeys: bigint[]; // 4 castling rights
  private enPassantKeys: bigint[]; // 8 files

  constructor() {
    this.pieceKeys = [];
    this.castlingKeys = [];
    this.enPassantKeys = [];
    this.sideKey = 0n;
    this.initializeKeys();
  }

  /**
   * Initialize all random keys
   * Uses crypto.getRandomValues for good randomness
   */
  private initializeKeys(): void {
    // Piece keys: [color][type][square]
    for (let color = 0; color < 2; color++) {
      this.pieceKeys[color] = [];
      for (let type = 0; type < 7; type++) {
        this.pieceKeys[color]![type] = [];
        for (let square = 0; square < 64; square++) {
          this.pieceKeys[color]![type]![square] = this.randomBigInt();
        }
      }
    }

    // Side to move key
    this.sideKey = this.randomBigInt();

    // Castling keys (4 rights: WK, WQ, BK, BQ)
    for (let i = 0; i < 4; i++) {
      this.castlingKeys[i] = this.randomBigInt();
    }

    // En passant keys (8 files)
    for (let i = 0; i < 8; i++) {
      this.enPassantKeys[i] = this.randomBigInt();
    }
  }

  /**
   * Compute hash for a position
   */
  computeHash(board: Board, state: GameState): bigint {
    let hash = 0n;

    // Hash all pieces
    for (const [square, piece] of board.getAllPieces()) {
      hash ^= this.getPieceKey(piece, square);
    }

    // Hash side to move (if black)
    if (state.currentPlayer === Color.Black) {
      hash ^= this.sideKey;
    }

    // Hash castling rights
    if (state.castlingRights.white.kingSide) {
      const key = this.castlingKeys[0];
      if (key !== undefined) hash ^= key;
    }
    if (state.castlingRights.white.queenSide) {
      const key = this.castlingKeys[1];
      if (key !== undefined) hash ^= key;
    }
    if (state.castlingRights.black.kingSide) {
      const key = this.castlingKeys[2];
      if (key !== undefined) hash ^= key;
    }
    if (state.castlingRights.black.queenSide) {
      const key = this.castlingKeys[3];
      if (key !== undefined) hash ^= key;
    }

    // Hash en passant
    if (state.enPassantSquare !== null) {
      const file = state.enPassantSquare % 8;
      const key = this.enPassantKeys[file];
      if (key !== undefined) {
        hash ^= key;
      }
    }

    return hash;
  }

  /**
   * Update hash after a move (incremental update)
   * More efficient than recomputing from scratch
   */
  updateHashAfterMove(hash: bigint, move: Move, board: Board, oldEnPassant: Square | null, newEnPassant: Square | null): bigint {
    let newHash = hash;

    // Remove piece from source square
    newHash ^= this.getPieceKey(move.piece, move.from);

    // Add piece to destination square
    newHash ^= this.getPieceKey(move.piece, move.to);

    // Handle capture
    if (move.captured) {
      newHash ^= this.getPieceKey(move.captured, move.to);
    }

    // Handle promotion
    if (move.flags & MoveFlags.Promotion && move.promotion) {
      // Remove pawn
      newHash ^= this.getPieceKey(move.piece, move.to);
      // Add promoted piece
      const promotedPiece: Piece = {
        type: move.promotion,
        color: move.piece.color,
      };
      newHash ^= this.getPieceKey(promotedPiece, move.to);
    }

    // Handle castling (rook movement)
    if (move.flags & MoveFlags.Castle) {
      const { rookFrom, rookTo } = this.getCastlingRookSquares(move);
      const rook = board.getPiece(rookTo);
      if (rook) {
        newHash ^= this.getPieceKey(rook, rookFrom);
        newHash ^= this.getPieceKey(rook, rookTo);
      }
    }

    // Handle en passant capture
    if (move.flags & MoveFlags.EnPassant) {
      const captureSquare = move.piece.color === Color.White ? move.to - 8 : move.to + 8;
      const capturedPawn: Piece = {
        type: PieceType.Pawn,
        color: move.piece.color === Color.White ? Color.Black : Color.White,
      };
      newHash ^= this.getPieceKey(capturedPawn, captureSquare);
    }

    // Update en passant
    if (oldEnPassant !== null) {
      const oldFile = oldEnPassant % 8;
      const key = this.enPassantKeys[oldFile];
      if (key !== undefined) {
        newHash ^= key;
      }
    }
    if (newEnPassant !== null) {
      const newFile = newEnPassant % 8;
      const key = this.enPassantKeys[newFile];
      if (key !== undefined) {
        newHash ^= key;
      }
    }

    // Toggle side to move
    newHash ^= this.sideKey;

    return newHash;
  }

  /**
   * Get piece key
   */
  private getPieceKey(piece: Piece, square: Square): bigint {
    const colorIndex = piece.color === Color.White ? 0 : 1;
    const key = this.pieceKeys[colorIndex]?.[piece.type]?.[square];
    if (key === undefined) {
      throw new Error(`Zobrist key not found for piece ${piece.type} color ${piece.color} on ${square}`);
    }
    return key;
  }

  /**
   * Get rook squares for castling
   */
  private getCastlingRookSquares(move: Move): { rookFrom: Square; rookTo: Square } {
    const isKingSide = move.to > move.from;
    const rank = Math.floor(move.from / 8);

    if (isKingSide) {
      return { rookFrom: rank * 8 + 7, rookTo: rank * 8 + 5 };
    } else {
      return { rookFrom: rank * 8, rookTo: rank * 8 + 3 };
    }
  }

  /**
   * Generate random 64-bit BigInt
   */
  private randomBigInt(): bigint {
    // Generate two random 32-bit numbers
    const high = BigInt(Math.floor(Math.random() * 0x100000000));
    const low = BigInt(Math.floor(Math.random() * 0x100000000));
    return (high << 32n) | low;
  }
}
