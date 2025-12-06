/**
 * @file Board.test.ts
 * @description Tests for Board class
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { Color, PieceType } from '../src/core/Piece';

describe('Board', () => {
  let board: Board;

  beforeEach(() => {
    board = new Board();
  });

  describe('constructor', () => {
    it('should create an empty board', () => {
      for (let square = 0; square < 64; square++) {
        expect(board.isEmpty(square)).toBe(true);
      }
    });
  });

  describe('getPiece and setPiece', () => {
    it('should set and get pieces correctly', () => {
      const piece = { type: PieceType.Knight, color: Color.White };
      board.setPiece(28, piece);
      expect(board.getPiece(28)).toEqual(piece);
    });

    it('should return null for empty squares', () => {
      expect(board.getPiece(28)).toBeNull();
    });

    it('should throw error for invalid square indices', () => {
      const piece = { type: PieceType.Pawn, color: Color.White };
      expect(() => board.setPiece(-1, piece)).toThrow('Invalid square');
      expect(() => board.setPiece(64, piece)).toThrow('Invalid square');
      expect(() => board.getPiece(-1)).toThrow('Invalid square');
      expect(() => board.getPiece(64)).toThrow('Invalid square');
    });

    it('should allow setting a square to null', () => {
      const piece = { type: PieceType.Queen, color: Color.White };
      board.setPiece(28, piece);
      expect(board.getPiece(28)).toEqual(piece);
      
      board.setPiece(28, null);
      expect(board.getPiece(28)).toBeNull();
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty squares', () => {
      expect(board.isEmpty(28)).toBe(true);
    });

    it('should return false for occupied squares', () => {
      board.setPiece(28, { type: PieceType.Pawn, color: Color.White });
      expect(board.isEmpty(28)).toBe(false);
    });
  });

  describe('isOccupiedByColor', () => {
    it('should return true for squares with matching color', () => {
      board.setPiece(28, { type: PieceType.Knight, color: Color.White });
      expect(board.isOccupiedByColor(28, Color.White)).toBe(true);
    });

    it('should return false for empty squares', () => {
      expect(board.isOccupiedByColor(28, Color.White)).toBe(false);
    });

    it('should return false for squares with opposite color', () => {
      board.setPiece(28, { type: PieceType.Knight, color: Color.White });
      expect(board.isOccupiedByColor(28, Color.Black)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all pieces from the board', () => {
      board.initializeStartingPosition();
      board.clear();
      
      for (let square = 0; square < 64; square++) {
        expect(board.isEmpty(square)).toBe(true);
      }
    });
  });

  describe('initializeStartingPosition', () => {
    beforeEach(() => {
      board.initializeStartingPosition();
    });

    it('should place white pieces on rank 1', () => {
      expect(board.getPiece(0)).toEqual({ type: PieceType.Rook, color: Color.White });
      expect(board.getPiece(1)).toEqual({ type: PieceType.Knight, color: Color.White });
      expect(board.getPiece(2)).toEqual({ type: PieceType.Bishop, color: Color.White });
      expect(board.getPiece(3)).toEqual({ type: PieceType.Queen, color: Color.White });
      expect(board.getPiece(4)).toEqual({ type: PieceType.King, color: Color.White });
      expect(board.getPiece(5)).toEqual({ type: PieceType.Bishop, color: Color.White });
      expect(board.getPiece(6)).toEqual({ type: PieceType.Knight, color: Color.White });
      expect(board.getPiece(7)).toEqual({ type: PieceType.Rook, color: Color.White });
    });

    it('should place white pawns on rank 2', () => {
      for (let file = 0; file < 8; file++) {
        expect(board.getPiece(8 + file)).toEqual({ type: PieceType.Pawn, color: Color.White });
      }
    });

    it('should place black pawns on rank 7', () => {
      for (let file = 0; file < 8; file++) {
        expect(board.getPiece(48 + file)).toEqual({ type: PieceType.Pawn, color: Color.Black });
      }
    });

    it('should place black pieces on rank 8', () => {
      expect(board.getPiece(56)).toEqual({ type: PieceType.Rook, color: Color.Black });
      expect(board.getPiece(57)).toEqual({ type: PieceType.Knight, color: Color.Black });
      expect(board.getPiece(58)).toEqual({ type: PieceType.Bishop, color: Color.Black });
      expect(board.getPiece(59)).toEqual({ type: PieceType.Queen, color: Color.Black });
      expect(board.getPiece(60)).toEqual({ type: PieceType.King, color: Color.Black });
      expect(board.getPiece(61)).toEqual({ type: PieceType.Bishop, color: Color.Black });
      expect(board.getPiece(62)).toEqual({ type: PieceType.Knight, color: Color.Black });
      expect(board.getPiece(63)).toEqual({ type: PieceType.Rook, color: Color.Black });
    });

    it('should leave ranks 3-6 empty', () => {
      for (let square = 16; square < 48; square++) {
        expect(board.isEmpty(square)).toBe(true);
      }
    });
  });

  describe('clone', () => {
    it('should create an independent copy of the board', () => {
      board.setPiece(28, { type: PieceType.Knight, color: Color.White });
      const cloned = board.clone();

      expect(cloned.getPiece(28)).toEqual({ type: PieceType.Knight, color: Color.White });

      // Modify original
      board.setPiece(28, { type: PieceType.Queen, color: Color.Black });

      // Clone should be unchanged
      expect(cloned.getPiece(28)).toEqual({ type: PieceType.Knight, color: Color.White });
    });

    it('should clone the starting position correctly', () => {
      board.initializeStartingPosition();
      const cloned = board.clone();

      for (let square = 0; square < 64; square++) {
        expect(cloned.getPiece(square)).toEqual(board.getPiece(square));
      }
    });
  });

  describe('countPieces', () => {
    beforeEach(() => {
      board.initializeStartingPosition();
    });

    it('should count white pawns correctly', () => {
      expect(board.countPieces(PieceType.Pawn, Color.White)).toBe(8);
    });

    it('should count black knights correctly', () => {
      expect(board.countPieces(PieceType.Knight, Color.Black)).toBe(2);
    });

    it('should return 0 for pieces not on board', () => {
      board.clear();
      expect(board.countPieces(PieceType.Queen, Color.White)).toBe(0);
    });
  });

  describe('findPieces', () => {
    beforeEach(() => {
      board.initializeStartingPosition();
    });

    it('should find all white rooks', () => {
      const rooks = board.findPieces(PieceType.Rook, Color.White);
      expect(rooks).toHaveLength(2);
      expect(rooks).toContain(0);
      expect(rooks).toContain(7);
    });

    it('should find the white king', () => {
      const kings = board.findPieces(PieceType.King, Color.White);
      expect(kings).toHaveLength(1);
      expect(kings[0]).toBe(4);
    });

    it('should return empty array if no pieces found', () => {
      board.clear();
      expect(board.findPieces(PieceType.Queen, Color.White)).toEqual([]);
    });
  });

  describe('findKing', () => {
    beforeEach(() => {
      board.initializeStartingPosition();
    });

    it('should find the white king', () => {
      expect(board.findKing(Color.White)).toBe(4);
    });

    it('should find the black king', () => {
      expect(board.findKing(Color.Black)).toBe(60);
    });

    it('should return null if king not found', () => {
      board.clear();
      expect(board.findKing(Color.White)).toBeNull();
    });
  });

  describe('getAllPieces', () => {
    it('should return empty array for empty board', () => {
      expect(board.getAllPieces()).toEqual([]);
    });

    it('should return all pieces with their squares', () => {
      board.setPiece(28, { type: PieceType.Knight, color: Color.White });
      board.setPiece(36, { type: PieceType.Pawn, color: Color.Black });

      const pieces = board.getAllPieces();
      expect(pieces).toHaveLength(2);
      expect(pieces).toContainEqual([28, { type: PieceType.Knight, color: Color.White }]);
      expect(pieces).toContainEqual([36, { type: PieceType.Pawn, color: Color.Black }]);
    });

    it('should return 32 pieces for starting position', () => {
      board.initializeStartingPosition();
      expect(board.getAllPieces()).toHaveLength(32);
    });
  });

  describe('getPiecesByColor', () => {
    beforeEach(() => {
      board.initializeStartingPosition();
    });

    it('should return only white pieces', () => {
      const whitePieces = board.getPiecesByColor(Color.White);
      expect(whitePieces).toHaveLength(16);
      
      for (const [_, piece] of whitePieces) {
        expect(piece.color).toBe(Color.White);
      }
    });

    it('should return only black pieces', () => {
      const blackPieces = board.getPiecesByColor(Color.Black);
      expect(blackPieces).toHaveLength(16);
      
      for (const [_, piece] of blackPieces) {
        expect(piece.color).toBe(Color.Black);
      }
    });
  });
});
