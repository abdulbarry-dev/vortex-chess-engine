/**
 * @file Move.test.ts
 * @description Tests for Move module
 */

import { describe, expect, it } from 'vitest';
import {
    createCaptureMove,
    createMove,
    isCaptureMove,
    isCastlingMove,
    isDoublePawnPush,
    isEnPassantMove,
    isPromotionMove,
    isQuietMove,
    movesEqual,
    moveToString,
} from '../src/core/Move';
import { Color, PieceType } from '../src/core/Piece';
import { MoveFlags } from '../src/types/Move.types';

describe('Move Module', () => {
  const whitePawn = { type: PieceType.Pawn, color: Color.White };
  const whiteKnight = { type: PieceType.Knight, color: Color.White };
  const blackPawn = { type: PieceType.Pawn, color: Color.Black };
  const blackQueen = { type: PieceType.Queen, color: Color.Black };

  describe('createMove', () => {
    it('should create a simple move', () => {
      const move = createMove(12, 28, whitePawn); // e2-e4
      expect(move.from).toBe(12);
      expect(move.to).toBe(28);
      expect(move.piece).toEqual(whitePawn);
      expect(move.flags).toBe(MoveFlags.None);
    });
  });

  describe('createCaptureMove', () => {
    it('should create a capture move', () => {
      const move = createCaptureMove(28, 35, whiteKnight, blackPawn); // Ne4xd5
      expect(move.from).toBe(28);
      expect(move.to).toBe(35);
      expect(move.piece).toEqual(whiteKnight);
      expect(move.captured).toEqual(blackPawn);
      expect(move.flags).toBe(MoveFlags.Capture);
    });
  });

  describe('isCaptureMove', () => {
    it('should return true for capture moves', () => {
      const move = createCaptureMove(28, 35, whiteKnight, blackPawn);
      expect(isCaptureMove(move)).toBe(true);
    });

    it('should return false for non-capture moves', () => {
      const move = createMove(12, 28, whitePawn);
      expect(isCaptureMove(move)).toBe(false);
    });
  });

  describe('isPromotionMove', () => {
    it('should return true for promotion moves', () => {
      const move = createMove(48, 56, whitePawn);
      move.flags = MoveFlags.Promotion;
      move.promotion = PieceType.Queen;
      expect(isPromotionMove(move)).toBe(true);
    });

    it('should return false for non-promotion moves', () => {
      const move = createMove(12, 28, whitePawn);
      expect(isPromotionMove(move)).toBe(false);
    });
  });

  describe('isCastlingMove', () => {
    it('should return true for castling moves', () => {
      const move = createMove(4, 6, { type: PieceType.King, color: Color.White });
      move.flags = MoveFlags.Castle;
      expect(isCastlingMove(move)).toBe(true);
    });

    it('should return false for non-castling moves', () => {
      const move = createMove(12, 28, whitePawn);
      expect(isCastlingMove(move)).toBe(false);
    });
  });

  describe('isEnPassantMove', () => {
    it('should return true for en passant moves', () => {
      const move = createMove(33, 40, whitePawn);
      move.flags = MoveFlags.EnPassant | MoveFlags.Capture;
      expect(isEnPassantMove(move)).toBe(true);
    });

    it('should return false for non-en-passant moves', () => {
      const move = createMove(12, 28, whitePawn);
      expect(isEnPassantMove(move)).toBe(false);
    });
  });

  describe('isDoublePawnPush', () => {
    it('should return true for double pawn push', () => {
      const move = createMove(12, 28, whitePawn);
      move.flags = MoveFlags.DoublePawnPush;
      expect(isDoublePawnPush(move)).toBe(true);
    });

    it('should return false for single pawn push', () => {
      const move = createMove(12, 20, whitePawn);
      expect(isDoublePawnPush(move)).toBe(false);
    });
  });

  describe('isQuietMove', () => {
    it('should return true for quiet moves', () => {
      const move = createMove(12, 28, whitePawn);
      expect(isQuietMove(move)).toBe(true);
    });

    it('should return false for captures', () => {
      const move = createCaptureMove(28, 35, whiteKnight, blackPawn);
      expect(isQuietMove(move)).toBe(false);
    });

    it('should return false for promotions', () => {
      const move = createMove(48, 56, whitePawn);
      move.flags = MoveFlags.Promotion;
      move.promotion = PieceType.Queen;
      expect(isQuietMove(move)).toBe(false);
    });
  });

  describe('movesEqual', () => {
    it('should return true for identical moves', () => {
      const move1 = createMove(12, 28, whitePawn);
      const move2 = createMove(12, 28, whitePawn);
      expect(movesEqual(move1, move2)).toBe(true);
    });

    it('should return false for different moves', () => {
      const move1 = createMove(12, 28, whitePawn);
      const move2 = createMove(12, 20, whitePawn);
      expect(movesEqual(move1, move2)).toBe(false);
    });

    it('should distinguish promotions', () => {
      const move1 = createMove(48, 56, whitePawn);
      move1.flags = MoveFlags.Promotion;
      move1.promotion = PieceType.Queen;

      const move2 = createMove(48, 56, whitePawn);
      move2.flags = MoveFlags.Promotion;
      move2.promotion = PieceType.Knight;

      expect(movesEqual(move1, move2)).toBe(false);
    });
  });

  describe('moveToString', () => {
    it('should format a simple move', () => {
      const move = createMove(12, 28, whitePawn);
      const str = moveToString(move);
      expect(str).toContain('Pe2-e4');
    });

    it('should format a capture move', () => {
      const move = createCaptureMove(28, 35, whiteKnight, blackPawn);
      const str = moveToString(move);
      expect(str).toContain('Ne4-d5');
      expect(str).toContain('capture');
    });

    it('should format a promotion move', () => {
      const move = createMove(48, 56, whitePawn);
      move.flags = MoveFlags.Promotion;
      move.promotion = PieceType.Queen;
      const str = moveToString(move);
      expect(str).toContain('promote to Queen');
    });

    it('should format castling', () => {
      const move = createMove(4, 6, { type: PieceType.King, color: Color.White });
      move.flags = MoveFlags.Castle;
      const str = moveToString(move);
      expect(str).toContain('castle');
    });
  });
});
