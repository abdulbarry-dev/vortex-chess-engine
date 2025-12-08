/**
 * @file NullMovePruning.test.ts
 * @description Tests for Null Move Pruning
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { Color, PieceType } from '../src/core/Piece';
import { NullMovePruning } from '../src/search/NullMovePruning';

describe('NullMovePruning', () => {
  let nullMove: NullMovePruning;
  let board: Board;
  let state: GameState;

  beforeEach(() => {
    nullMove = new NullMovePruning();
    board = new Board();
    board.initializeStartingPosition();
    state = new GameState();
    state.reset();
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const config = nullMove.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.minDepth).toBe(3);
      expect(config.reduction).toBe(2);
      expect(config.adaptiveReduction).toBe(true);
    });

    it('should allow custom configuration', () => {
      const customNullMove = new NullMovePruning({
        minDepth: 4,
        reduction: 3,
        adaptiveReduction: false,
      });

      const config = customNullMove.getConfig();
      expect(config.minDepth).toBe(4);
      expect(config.reduction).toBe(3);
      expect(config.adaptiveReduction).toBe(false);
    });

    it('should update configuration', () => {
      nullMove.updateConfig({ reduction: 3 });
      expect(nullMove.getConfig().reduction).toBe(3);
    });
  });

  describe('Should Try Null Move', () => {
    it('should try null move in normal position', () => {
      const shouldTry = nullMove.shouldTryNullMove(
        board,
        state,
        5,
        100,
        false,
        false
      );
      expect(shouldTry).toBe(true);
    });

    it('should not try when disabled', () => {
      nullMove.updateConfig({ enabled: false });
      const shouldTry = nullMove.shouldTryNullMove(
        board,
        state,
        5,
        100,
        false,
        false
      );
      expect(shouldTry).toBe(false);
    });

    it('should not try at shallow depth', () => {
      const shouldTry = nullMove.shouldTryNullMove(
        board,
        state,
        2,
        100,
        false,
        false
      );
      expect(shouldTry).toBe(false);
    });

    it('should not try when in check', () => {
      const shouldTry = nullMove.shouldTryNullMove(
        board,
        state,
        5,
        100,
        true,
        false
      );
      expect(shouldTry).toBe(false);
    });

    it('should not try after null move already used', () => {
      const shouldTry = nullMove.shouldTryNullMove(
        board,
        state,
        5,
        100,
        false,
        true
      );
      expect(shouldTry).toBe(false);
    });

    it('should handle depth at minimum', () => {
      const shouldTry = nullMove.shouldTryNullMove(
        board,
        state,
        3,
        100,
        false,
        false
      );
      expect(shouldTry).toBe(true);
    });
  });

  describe('Reduction Calculation', () => {
    it('should return base reduction', () => {
      const reduction = nullMove.getReduction(5);
      expect(reduction).toBeGreaterThan(0);
    });

    it('should use adaptive reduction for deep search', () => {
      const shallowReduction = nullMove.getReduction(4);
      const deepReduction = nullMove.getReduction(8);
      expect(deepReduction).toBeGreaterThanOrEqual(shallowReduction);
    });

    it('should use fixed reduction when adaptive disabled', () => {
      const fixedNullMove = new NullMovePruning({ adaptiveReduction: false });
      const reduction1 = fixedNullMove.getReduction(4);
      const reduction2 = fixedNullMove.getReduction(8);
      expect(reduction1).toBe(reduction2);
    });

    it('should increase reduction with depth', () => {
      const r1 = nullMove.getReduction(3);
      const r2 = nullMove.getReduction(5);
      const r3 = nullMove.getReduction(7);

      expect(r3).toBeGreaterThanOrEqual(r2);
      expect(r2).toBeGreaterThanOrEqual(r1);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track null move attempts', () => {
      nullMove.recordAttempt();
      nullMove.recordAttempt();

      const stats = nullMove.getStatistics();
      expect(stats.nullMovesAttempted).toBe(2);
    });

    it('should track null move cutoffs', () => {
      nullMove.recordAttempt();
      nullMove.recordCutoff();

      const stats = nullMove.getStatistics();
      expect(stats.nullMoveCutoffs).toBe(1);
    });

    it('should calculate cutoff rate', () => {
      nullMove.recordAttempt();
      nullMove.recordAttempt();
      nullMove.recordCutoff();

      const stats = nullMove.getStatistics();
      expect(stats.cutoffRate).toBe(0.5);
    });

    it('should handle zero attempts', () => {
      const stats = nullMove.getStatistics();
      expect(stats.cutoffRate).toBe(0);
    });

    it('should track average reduction', () => {
      nullMove.getReduction(4);
      nullMove.recordAttempt();
      nullMove.getReduction(6);
      nullMove.recordAttempt();

      const stats = nullMove.getStatistics();
      expect(stats.averageReduction).toBeGreaterThan(0);
    });
  });

  describe('Verification', () => {
    it('should not verify when disabled', () => {
      const shouldVerify = nullMove.shouldVerify(board, state);
      expect(shouldVerify).toBe(false);
    });

    it('should verify when enabled and endgame', () => {
      const verifyNullMove = new NullMovePruning({ verification: true });
      
      // Create endgame position (only kings and pawns)
      const endgameBoard = new Board();
      endgameBoard.setPiece(4, { type: PieceType.King, color: Color.White });
      endgameBoard.setPiece(60, { type: PieceType.King, color: Color.Black });
      endgameBoard.setPiece(12, { type: PieceType.Pawn, color: Color.White });

      const shouldVerify = verifyNullMove.shouldVerify(endgameBoard, state);
      expect(shouldVerify).toBe(true);
    });

    it('should get verification reduction', () => {
      const reduction = nullMove.getVerificationReduction();
      expect(reduction).toBeGreaterThan(0);
    });

    it('should track verification attempts', () => {
      nullMove.recordVerification();
      nullMove.recordVerification();

      const stats = nullMove.getStatistics();
      expect(stats.verificationsPerformed).toBe(2);
    });

    it('should track failed verifications', () => {
      nullMove.recordVerification();
      nullMove.recordFailedVerification();

      const stats = nullMove.getStatistics();
      expect(stats.failedVerifications).toBe(1);
    });
  });

  describe('Zugzwang Detection', () => {
    it('should detect zugzwang risk in K+P endgame', () => {
      // Create king and pawn endgame
      const endgameBoard = new Board();
      endgameBoard.setPiece(4, { type: PieceType.King, color: Color.White });
      endgameBoard.setPiece(60, { type: PieceType.King, color: Color.Black });
      endgameBoard.setPiece(12, { type: PieceType.Pawn, color: Color.White });

      const shouldTry = nullMove.shouldTryNullMove(
        endgameBoard,
        state,
        5,
        100,
        false,
        false
      );

      expect(shouldTry).toBe(false);
    });

    it('should not detect zugzwang risk with pieces', () => {
      const shouldTry = nullMove.shouldTryNullMove(
        board,
        state,
        5,
        100,
        false,
        false
      );

      expect(shouldTry).toBe(true);
    });
  });

  describe('Clear Statistics', () => {
    it('should clear all statistics', () => {
      nullMove.recordAttempt();
      nullMove.recordCutoff();
      nullMove.getReduction(5);
      nullMove.recordVerification();

      nullMove.clearStatistics();

      const stats = nullMove.getStatistics();
      expect(stats.nullMovesAttempted).toBe(0);
      expect(stats.nullMoveCutoffs).toBe(0);
      expect(stats.cutoffRate).toBe(0);
      expect(stats.verificationsPerformed).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very deep search', () => {
      const shouldTry = nullMove.shouldTryNullMove(
        board,
        state,
        20,
        100,
        false,
        false
      );
      expect(shouldTry).toBe(true);

      const reduction = nullMove.getReduction(20);
      expect(reduction).toBeGreaterThan(0);
    });

    it('should handle depth at minimum threshold', () => {
      const shouldTry = nullMove.shouldTryNullMove(
        board,
        state,
        3,
        100,
        false,
        false
      );
      expect(shouldTry).toBe(true);
    });

    it('should handle multiple consecutive attempts', () => {
      for (let i = 0; i < 100; i++) {
        nullMove.recordAttempt();
        if (i % 2 === 0) nullMove.recordCutoff();
      }

      const stats = nullMove.getStatistics();
      expect(stats.nullMovesAttempted).toBe(100);
      expect(stats.nullMoveCutoffs).toBe(50);
      expect(stats.cutoffRate).toBeCloseTo(0.5, 2);
    });
  });

  describe('Configuration Variations', () => {
    it('should work with different minimum depth', () => {
      const customNullMove = new NullMovePruning({ minDepth: 5 });

      const shallow = customNullMove.shouldTryNullMove(
        board,
        state,
        4,
        100,
        false,
        false
      );
      const deep = customNullMove.shouldTryNullMove(
        board,
        state,
        5,
        100,
        false,
        false
      );

      expect(shallow).toBe(false);
      expect(deep).toBe(true);
    });

    it('should work with different reduction values', () => {
      const r2NullMove = new NullMovePruning({ reduction: 2, adaptiveReduction: false });
      const r3NullMove = new NullMovePruning({ reduction: 3, adaptiveReduction: false });

      const r2 = r2NullMove.getReduction(5);
      const r3 = r3NullMove.getReduction(5);

      expect(r2).toBe(2);
      expect(r3).toBe(3);
    });

    it('should respect verification settings', () => {
      const noVerify = new NullMovePruning({ verification: false });
      const withVerify = new NullMovePruning({ verification: true });

      const endgameBoard = new Board();
      endgameBoard.setPiece(4, { type: PieceType.King, color: Color.White });
      endgameBoard.setPiece(60, { type: PieceType.King, color: Color.Black });
      endgameBoard.setPiece(12, { type: PieceType.Pawn, color: Color.White });

      expect(noVerify.shouldVerify(endgameBoard, state)).toBe(false);
      expect(withVerify.shouldVerify(endgameBoard, state)).toBe(true);
    });
  });
});
