/**
 * @file LateMoveReduction.test.ts
 * @description Tests for Late Move Reduction
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { Color, PieceType } from '../src/core/Piece';
import { LateMoveReduction } from '../src/search/LateMoveReduction';
import { Move, MoveFlags } from '../src/types/Move.types';

describe('LateMoveReduction', () => {
  let lmr: LateMoveReduction;
  let board: Board;
  let state: GameState;

  beforeEach(() => {
    lmr = new LateMoveReduction();
    board = new Board();
    board.initializeStartingPosition();
    state = new GameState();
    state.reset();
  });

  const createMove = (from: number, to: number, flags = MoveFlags.None): Move => ({
    from,
    to,
    piece: { type: PieceType.Pawn, color: Color.White },
    flags,
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const config = lmr.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.minDepth).toBe(3);
      expect(config.fullDepthMoves).toBe(4);
      expect(config.baseReduction).toBe(1);
      expect(config.maxReduction).toBe(3);
    });

    it('should allow custom configuration', () => {
      const customLMR = new LateMoveReduction({
        minDepth: 4,
        fullDepthMoves: 3,
        maxReduction: 2,
      });

      const config = customLMR.getConfig();
      expect(config.minDepth).toBe(4);
      expect(config.fullDepthMoves).toBe(3);
      expect(config.maxReduction).toBe(2);
    });

    it('should update configuration', () => {
      lmr.updateConfig({ minDepth: 5 });
      expect(lmr.getConfig().minDepth).toBe(5);
    });
  });

  describe('Reduction Calculation', () => {
    it('should not reduce when disabled', () => {
      lmr.updateConfig({ enabled: false });
      const move = createMove(12, 28);
      const reduction = lmr.getReduction(board, state, move, 5, 10, false);
      expect(reduction).toBe(0);
    });

    it('should not reduce at shallow depth', () => {
      const move = createMove(12, 28);
      const reduction = lmr.getReduction(board, state, move, 2, 10, false);
      expect(reduction).toBe(0);
    });

    it('should not reduce early moves', () => {
      const move = createMove(12, 28);
      const reduction = lmr.getReduction(board, state, move, 5, 2, false);
      expect(reduction).toBe(0);
    });

    it('should not reduce PV nodes', () => {
      const move = createMove(12, 28);
      const reduction = lmr.getReduction(board, state, move, 5, 10, true);
      expect(reduction).toBe(0);
    });

    it('should reduce late quiet moves', () => {
      const move = createMove(12, 28);
      const reduction = lmr.getReduction(board, state, move, 5, 10, false);
      expect(reduction).toBeGreaterThan(0);
    });

    it('should not reduce captures', () => {
      const capture = createMove(12, 28, MoveFlags.Capture);
      capture.captured = { type: PieceType.Pawn, color: Color.Black };
      const reduction = lmr.getReduction(board, state, capture, 5, 10, false);
      expect(reduction).toBe(0);
    });

    it('should not reduce promotions', () => {
      const promotion = createMove(48, 56, MoveFlags.Promotion);
      promotion.promotion = PieceType.Queen;
      const reduction = lmr.getReduction(board, state, promotion, 5, 10, false);
      expect(reduction).toBe(0);
    });

    it('should not reduce en passant', () => {
      const enPassant = createMove(32, 41, MoveFlags.EnPassant);
      const reduction = lmr.getReduction(board, state, enPassant, 5, 10, false);
      expect(reduction).toBe(0);
    });

    it('should increase reduction for later moves', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);

      const reduction1 = lmr.getReduction(board, state, move1, 5, 5, false);
      const reduction2 = lmr.getReduction(board, state, move2, 5, 15, false);

      expect(reduction2).toBeGreaterThan(reduction1);
    });

    it('should cap reduction at maximum', () => {
      const move = createMove(12, 28);
      const reduction = lmr.getReduction(board, state, move, 5, 100, false);
      expect(reduction).toBeLessThanOrEqual(3);
    });
  });

  describe('Research Tracking', () => {
    it('should track research count', () => {
      lmr.recordResearch();
      lmr.recordResearch();

      const stats = lmr.getStatistics();
      expect(stats.researchCount).toBe(2);
    });
  });

  describe('Statistics', () => {
    it('should track moves reduced', () => {
      const move = createMove(12, 28);
      lmr.getReduction(board, state, move, 5, 10, false);
      lmr.getReduction(board, state, move, 5, 11, false);

      const stats = lmr.getStatistics();
      expect(stats.movesReduced).toBe(2);
    });

    it('should track total reduction', () => {
      const move = createMove(12, 28);
      lmr.getReduction(board, state, move, 5, 10, false);
      lmr.getReduction(board, state, move, 5, 15, false);

      const stats = lmr.getStatistics();
      expect(stats.totalReduction).toBeGreaterThan(0);
    });

    it('should calculate average reduction', () => {
      const move = createMove(12, 28);
      lmr.getReduction(board, state, move, 5, 10, false);
      lmr.getReduction(board, state, move, 5, 11, false);

      const stats = lmr.getStatistics();
      expect(stats.averageReduction).toBeGreaterThan(0);
      expect(stats.averageReduction).toBe(stats.totalReduction / stats.movesReduced);
    });

    it('should track reductions by depth', () => {
      const move = createMove(12, 28);
      lmr.getReduction(board, state, move, 5, 10, false);
      lmr.getReduction(board, state, move, 6, 10, false);

      const stats = lmr.getStatistics();
      expect(stats.reductionsByDepth.length).toBeGreaterThan(0);
      expect(stats.reductionsByDepth).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ depth: 5 }),
          expect.objectContaining({ depth: 6 }),
        ])
      );
    });

    it('should clear statistics', () => {
      const move = createMove(12, 28);
      lmr.getReduction(board, state, move, 5, 10, false);
      lmr.recordResearch();

      lmr.clearStatistics();

      const stats = lmr.getStatistics();
      expect(stats.movesReduced).toBe(0);
      expect(stats.totalReduction).toBe(0);
      expect(stats.researchCount).toBe(0);
      expect(stats.reductionsByDepth.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle depth exactly at minimum', () => {
      const move = createMove(12, 28);
      const reduction = lmr.getReduction(board, state, move, 3, 10, false);
      expect(reduction).toBeGreaterThanOrEqual(0);
    });

    it('should handle move number exactly at full depth moves', () => {
      const move = createMove(12, 28);
      // fullDepthMoves = 4 means moves 0-3 get full depth, move 4 starts reducing
      const reduction = lmr.getReduction(board, state, move, 5, 4, false);
      expect(reduction).toBeGreaterThan(0);
    });

    it('should handle very deep search', () => {
      const move = createMove(12, 28);
      const reduction = lmr.getReduction(board, state, move, 20, 10, false);
      expect(reduction).toBeGreaterThan(0);
      expect(reduction).toBeLessThanOrEqual(3);
    });

    it('should handle many moves', () => {
      const move = createMove(12, 28);
      for (let i = 5; i < 50; i++) {
        const reduction = lmr.getReduction(board, state, move, 5, i, false);
        expect(reduction).toBeLessThanOrEqual(3);
      }

      const stats = lmr.getStatistics();
      expect(stats.movesReduced).toBeGreaterThan(0);
    });
  });

  describe('Configuration Variations', () => {
    it('should respect custom base reduction', () => {
      const customLMR = new LateMoveReduction({ baseReduction: 2 });
      const move = createMove(12, 28);
      const reduction = customLMR.getReduction(board, state, move, 5, 5, false);
      expect(reduction).toBeGreaterThanOrEqual(2);
    });

    it('should respect custom reduction per move', () => {
      const customLMR = new LateMoveReduction({ reductionPerMove: 1.0 });
      const move = createMove(12, 28);
      const reduction = customLMR.getReduction(board, state, move, 5, 10, false);
      expect(reduction).toBeGreaterThan(1);
    });

    it('should work with different full depth moves setting', () => {
      const customLMR = new LateMoveReduction({ fullDepthMoves: 2 });
      const move = createMove(12, 28);

      const noReduction = customLMR.getReduction(board, state, move, 5, 1, false);
      const withReduction = customLMR.getReduction(board, state, move, 5, 5, false);

      expect(noReduction).toBe(0);
      expect(withReduction).toBeGreaterThan(0);
    });
  });
});
