/**
 * @file Piece.test.ts
 * @description Tests for Piece module
 */

import { describe, expect, it } from 'vitest';
import {
    Color,
    Piece,
    PieceType,
    getPieceChar,
    getPieceFromChar,
    getPieceTypeName,
    isSliding,
    oppositeColor,
} from '../src/core/Piece';

describe('Piece Module', () => {
  describe('isSliding', () => {
    it('should return true for sliding pieces', () => {
      expect(isSliding({ type: PieceType.Bishop, color: Color.White })).toBe(true);
      expect(isSliding({ type: PieceType.Rook, color: Color.White })).toBe(true);
      expect(isSliding({ type: PieceType.Queen, color: Color.White })).toBe(true);
    });

    it('should return false for non-sliding pieces', () => {
      expect(isSliding({ type: PieceType.Pawn, color: Color.White })).toBe(false);
      expect(isSliding({ type: PieceType.Knight, color: Color.White })).toBe(false);
      expect(isSliding({ type: PieceType.King, color: Color.White })).toBe(false);
    });
  });

  describe('getPieceChar', () => {
    it('should return uppercase characters for white pieces', () => {
      expect(getPieceChar({ type: PieceType.Pawn, color: Color.White })).toBe('P');
      expect(getPieceChar({ type: PieceType.Knight, color: Color.White })).toBe('N');
      expect(getPieceChar({ type: PieceType.Bishop, color: Color.White })).toBe('B');
      expect(getPieceChar({ type: PieceType.Rook, color: Color.White })).toBe('R');
      expect(getPieceChar({ type: PieceType.Queen, color: Color.White })).toBe('Q');
      expect(getPieceChar({ type: PieceType.King, color: Color.White })).toBe('K');
    });

    it('should return lowercase characters for black pieces', () => {
      expect(getPieceChar({ type: PieceType.Pawn, color: Color.Black })).toBe('p');
      expect(getPieceChar({ type: PieceType.Knight, color: Color.Black })).toBe('n');
      expect(getPieceChar({ type: PieceType.Bishop, color: Color.Black })).toBe('b');
      expect(getPieceChar({ type: PieceType.Rook, color: Color.Black })).toBe('r');
      expect(getPieceChar({ type: PieceType.Queen, color: Color.Black })).toBe('q');
      expect(getPieceChar({ type: PieceType.King, color: Color.Black })).toBe('k');
    });
  });

  describe('getPieceFromChar', () => {
    it('should parse white pieces correctly', () => {
      const knight = getPieceFromChar('N');
      expect(knight).toEqual({ type: PieceType.Knight, color: Color.White });

      const queen = getPieceFromChar('Q');
      expect(queen).toEqual({ type: PieceType.Queen, color: Color.White });
    });

    it('should parse black pieces correctly', () => {
      const knight = getPieceFromChar('n');
      expect(knight).toEqual({ type: PieceType.Knight, color: Color.Black });

      const queen = getPieceFromChar('q');
      expect(queen).toEqual({ type: PieceType.Queen, color: Color.Black });
    });

    it('should return null for invalid characters', () => {
      expect(getPieceFromChar('X')).toBeNull();
      expect(getPieceFromChar('1')).toBeNull();
      expect(getPieceFromChar('')).toBeNull();
    });
  });

  describe('getPieceTypeName', () => {
    it('should return correct names for all piece types', () => {
      expect(getPieceTypeName(PieceType.Pawn)).toBe('Pawn');
      expect(getPieceTypeName(PieceType.Knight)).toBe('Knight');
      expect(getPieceTypeName(PieceType.Bishop)).toBe('Bishop');
      expect(getPieceTypeName(PieceType.Rook)).toBe('Rook');
      expect(getPieceTypeName(PieceType.Queen)).toBe('Queen');
      expect(getPieceTypeName(PieceType.King)).toBe('King');
    });
  });

  describe('oppositeColor', () => {
    it('should return the opposite color', () => {
      expect(oppositeColor(Color.White)).toBe(Color.Black);
      expect(oppositeColor(Color.Black)).toBe(Color.White);
    });
  });

  describe('round-trip conversions', () => {
    it('should convert piece to char and back correctly', () => {
      const pieces: Piece[] = [
        { type: PieceType.Knight, color: Color.White },
        { type: PieceType.Queen, color: Color.Black },
        { type: PieceType.Pawn, color: Color.White },
        { type: PieceType.Bishop, color: Color.Black },
      ];

      for (const piece of pieces) {
        const char = getPieceChar(piece);
        const parsed = getPieceFromChar(char);
        expect(parsed).toEqual(piece);
      }
    });
  });
});
