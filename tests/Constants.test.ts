/**
 * @file Constants.test.ts
 * @description Tests for constant values
 */

import { describe, expect, it } from 'vitest';
import {
    ALL_DIRECTIONS,
    BOARD_SIZE,
    DIAGONAL_DIRECTIONS,
    KING_OFFSETS,
    KNIGHT_OFFSETS,
    NUM_SQUARES,
    ORTHOGONAL_DIRECTIONS,
} from '../src/constants/BoardConstants';
import { PIECE_VALUES, getMvvLvaScore, getPieceValue } from '../src/constants/PieceValues';
import { PieceType } from '../src/core/Piece';

describe('Constants Module', () => {
  describe('PieceValues', () => {
    it('should have correct standard piece values', () => {
      expect(PIECE_VALUES[PieceType.Pawn]).toBe(100);
      expect(PIECE_VALUES[PieceType.Knight]).toBe(320);
      expect(PIECE_VALUES[PieceType.Bishop]).toBe(330);
      expect(PIECE_VALUES[PieceType.Rook]).toBe(500);
      expect(PIECE_VALUES[PieceType.Queen]).toBe(900);
      expect(PIECE_VALUES[PieceType.King]).toBe(0);
    });

    it('should return piece values via getPieceValue', () => {
      expect(getPieceValue(PieceType.Knight)).toBe(320);
      expect(getPieceValue(PieceType.Queen)).toBe(900);
    });

    it('should have higher MVV-LVA scores for more valuable victims', () => {
      // Capturing a queen with a pawn should score higher than capturing a pawn with a pawn
      const queenCapture = getMvvLvaScore(PieceType.Queen, PieceType.Pawn);
      const pawnCapture = getMvvLvaScore(PieceType.Pawn, PieceType.Pawn);
      expect(queenCapture).toBeGreaterThan(pawnCapture);
    });

    it('should prefer less valuable attackers for same victim', () => {
      // Capturing a queen with a pawn should score higher than with a queen
      const pawnAttacker = getMvvLvaScore(PieceType.Queen, PieceType.Pawn);
      const queenAttacker = getMvvLvaScore(PieceType.Queen, PieceType.Queen);
      expect(pawnAttacker).toBeGreaterThan(queenAttacker);
    });
  });

  describe('BoardConstants', () => {
    it('should have correct board dimensions', () => {
      expect(BOARD_SIZE).toBe(8);
      expect(NUM_SQUARES).toBe(64);
    });

    it('should have 8 knight offsets', () => {
      expect(KNIGHT_OFFSETS).toHaveLength(8);
    });

    it('should have 8 king offsets', () => {
      expect(KING_OFFSETS).toHaveLength(8);
    });

    it('should have 4 diagonal directions', () => {
      expect(DIAGONAL_DIRECTIONS).toHaveLength(4);
    });

    it('should have 4 orthogonal directions', () => {
      expect(ORTHOGONAL_DIRECTIONS).toHaveLength(4);
    });

    it('should have 8 total directions', () => {
      expect(ALL_DIRECTIONS).toHaveLength(8);
    });

    it('should include all directions in ALL_DIRECTIONS', () => {
      const allDirs = [...DIAGONAL_DIRECTIONS, ...ORTHOGONAL_DIRECTIONS];
      expect(ALL_DIRECTIONS).toEqual(expect.arrayContaining(allDirs));
    });
  });
});
