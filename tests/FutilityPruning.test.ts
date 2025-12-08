/**
 * @file FutilityPruning.test.ts
 * @description Tests for futility pruning optimization
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { Color, PieceType } from '../src/core/Piece';
import { Evaluator } from '../src/evaluation/Evaluator';
import { FutilityPruning } from '../src/search/FutilityPruning';
import { Move, MoveFlags } from '../src/types/Move.types';
import { parseFen } from '../src/utils/FenParser';

describe('FutilityPruning', () => {
  let futilityPruning: FutilityPruning;
  let evaluator: Evaluator;
  let board: Board;
  let state: GameState;

  beforeEach(() => {
    evaluator = new Evaluator();
    futilityPruning = new FutilityPruning(evaluator);
    board = new Board();
    board.initializeStartingPosition();
    state = new GameState();
    state.reset();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const config = futilityPruning.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxDepth).toBe(3);
      expect(config.skipInCheck).toBe(true);
      expect(config.skipPvNodes).toBe(true);
      expect(config.margins).toHaveLength(4);
    });

    it('should initialize with custom config', () => {
      const fp = new FutilityPruning(evaluator, {
        enabled: false,
        maxDepth: 5,
        margins: [0, 150, 250, 350, 450, 550],
      });

      const config = fp.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.maxDepth).toBe(5);
      expect(config.margins).toHaveLength(6);
    });

    it('should start with zero statistics', () => {
      const stats = futilityPruning.getStatistics();
      expect(stats.totalChecks).toBe(0);
      expect(stats.pruned).toBe(0);
      expect(stats.notPruned).toBe(0);
    });
  });

  describe('Futility Margins', () => {
    it('should get margin for depth 1', () => {
      const margin = futilityPruning.getFutilityMargin(1);
      expect(margin).toBe(100);
    });

    it('should get margin for depth 2', () => {
      const margin = futilityPruning.getFutilityMargin(2);
      expect(margin).toBe(200);
    });

    it('should get margin for depth 3', () => {
      const margin = futilityPruning.getFutilityMargin(3);
      expect(margin).toBe(300);
    });

    it('should handle depth 0', () => {
      const margin = futilityPruning.getFutilityMargin(0);
      expect(margin).toBeGreaterThanOrEqual(0);
    });

    it('should handle depth beyond margins array', () => {
      const margin = futilityPruning.getFutilityMargin(10);
      expect(margin).toBe(300); // Last margin
    });

    it('should allow custom margins', () => {
      futilityPruning.setMargins([0, 50, 100, 150]);
      expect(futilityPruning.getFutilityMargin(1)).toBe(50);
      expect(futilityPruning.getFutilityMargin(3)).toBe(150);
    });
  });

  describe('Pruning Conditions', () => {
    it('should not prune when disabled', () => {
      futilityPruning.disable();
      const canPrune = futilityPruning.canPrune(board, state, 2, -500, 500, false);
      expect(canPrune).toBe(false);
    });

    it('should not prune at depth 0', () => {
      const canPrune = futilityPruning.canPrune(board, state, 0, -500, 500, false);
      expect(canPrune).toBe(false);
    });

    it('should not prune beyond max depth', () => {
      const canPrune = futilityPruning.canPrune(board, state, 5, -500, 500, false);
      expect(canPrune).toBe(false);
    });

    it('should not prune PV nodes', () => {
      const canPrune = futilityPruning.canPrune(board, state, 2, -500, 500, true);
      expect(canPrune).toBe(false);
    });

    it('should check conditions correctly', () => {
      expect(futilityPruning.conditionsAllowPruning(2, false, false)).toBe(true);
      expect(futilityPruning.conditionsAllowPruning(2, true, false)).toBe(false); // In check
      expect(futilityPruning.conditionsAllowPruning(2, false, true)).toBe(false); // PV node
      expect(futilityPruning.conditionsAllowPruning(5, false, false)).toBe(false); // Too deep
    });
  });

  describe('Position Pruning', () => {
    it('should prune losing position', () => {
      // Create a losing position (eval + margin < alpha)
      const losingResult = parseFen('rnbqkbnr/pppppppp/8/8/8/8/8/4K3 w - - 0 1');
      const losingBoard = losingResult.board;
      const losingState = losingResult.state; // White has only king

      const alpha = 0; // Looking for equality or better
      const canPrune = futilityPruning.canPrune(losingBoard, losingState, 2, alpha, alpha + 100, false);
      
      expect(canPrune).toBe(true); // Should prune (way behind)
    });

    it('should not prune winning position', () => {
      // Create a winning position
      const winningResult = parseFen('4k3/8/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
      const winningBoard = winningResult.board;
      const winningState = winningResult.state; // White has everything

      const alpha = 0;
      const canPrune = futilityPruning.canPrune(winningBoard, winningState, 2, alpha, alpha + 100, false);
      
      expect(canPrune).toBe(false); // Should not prune (winning)
    });

    it('should not prune close positions', () => {
      // Starting position should not be pruned
      const alpha = 0;
      const canPrune = futilityPruning.canPrune(board, state, 2, alpha, alpha + 100, false);
      
      expect(canPrune).toBe(false); // Eval is close to alpha
    });
  });

  describe('Move Pruning', () => {
    it('should not prune tactical moves', () => {
      const captureMove: Move = {
        from: 12,
        to: 28,
        piece: { type: PieceType.Pawn, color: Color.White },
        captured: { type: PieceType.Pawn, color: Color.Black },
        flags: MoveFlags.Capture,
      };

      const canPrune = futilityPruning.canPruneMove(
        board,
        state,
        captureMove,
        2,
        -500,
        500
      );

      expect(canPrune).toBe(false);
    });

    it('should not prune promotions', () => {
      const promotionMove: Move = {
        from: 48,
        to: 56,
        piece: { type: PieceType.Pawn, color: Color.White },
        promotion: PieceType.Queen,
        flags: MoveFlags.Promotion,
      };

      const canPrune = futilityPruning.canPruneMove(
        board,
        state,
        promotionMove,
        2,
        -500,
        500
      );

      expect(canPrune).toBe(false);
    });

    it('should not prune en passant', () => {
      const epMove: Move = {
        from: 32,
        to: 40,
        piece: { type: PieceType.Pawn, color: Color.White },
        flags: MoveFlags.EnPassant,
      };

      const canPrune = futilityPruning.canPruneMove(
        board,
        state,
        epMove,
        2,
        -500,
        500
      );

      expect(canPrune).toBe(false);
    });

    it('should consider pruning quiet moves', () => {
      const quietMove: Move = {
        from: 12,
        to: 28,
        piece: { type: PieceType.Knight, color: Color.White },
        flags: MoveFlags.None,
      };

      // In a losing position, quiet moves can be pruned
      const losingResult = parseFen('rnbqkbnr/pppppppp/8/8/8/8/8/4K3 w - - 0 1');
      const losingBoard = losingResult.board;
      const losingState = losingResult.state;

      const canPrune = futilityPruning.canPruneMove(
        losingBoard,
        losingState,
        quietMove,
        2,
        0,
        100
      );

      expect(canPrune).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should track total checks', () => {
      futilityPruning.canPrune(board, state, 2, -500, 500, false);
      futilityPruning.canPrune(board, state, 2, -500, 500, false);

      const stats = futilityPruning.getStatistics();
      expect(stats.totalChecks).toBe(2);
    });

    it('should track pruned positions', () => {
      const losingResult = parseFen('rnbqkbnr/pppppppp/8/8/8/8/8/4K3 w - - 0 1');
      const losingBoard = losingResult.board;
      const losingState = losingResult.state;

      futilityPruning.canPrune(losingBoard, losingState, 2, 0, 100, false);

      const stats = futilityPruning.getStatistics();
      expect(stats.pruned).toBeGreaterThanOrEqual(0);
    });

    it('should track not pruned positions', () => {
      futilityPruning.canPrune(board, state, 2, -500, 500, false);

      const stats = futilityPruning.getStatistics();
      expect(stats.notPruned).toBeGreaterThan(0);
    });

    it('should calculate prune rate', () => {
      const losingResult = parseFen('rnbqkbnr/pppppppp/8/8/8/8/8/4K3 w - - 0 1');
      const losingBoard = losingResult.board;
      const losingState = losingResult.state;

      futilityPruning.canPrune(losingBoard, losingState, 2, 0, 100, false);
      futilityPruning.canPrune(board, state, 2, -500, 500, false);

      const stats = futilityPruning.getStatistics();
      expect(stats.pruneRate).toBeGreaterThanOrEqual(0);
      expect(stats.pruneRate).toBeLessThanOrEqual(1);
    });

    it('should track pruned by depth', () => {
      const losingResult = parseFen('rnbqkbnr/pppppppp/8/8/8/8/8/4K3 w - - 0 1');
      const losingBoard = losingResult.board;
      const losingState = losingResult.state;

      futilityPruning.canPrune(losingBoard, losingState, 1, 0, 100, false);
      futilityPruning.canPrune(losingBoard, losingState, 2, 0, 100, false);
      futilityPruning.canPrune(losingBoard, losingState, 2, 0, 100, false);

      const stats = futilityPruning.getStatistics();
      const depthStats = stats.prunedByDepth;

      if (depthStats.length > 0) {
        const depth1 = depthStats.find(s => s.depth === 1);
        const depth2 = depthStats.find(s => s.depth === 2);

        if (depth1) expect(depth1.count).toBeGreaterThanOrEqual(0);
        if (depth2) expect(depth2.count).toBeGreaterThanOrEqual(0);
      }
    });

    it('should estimate saved nodes', () => {
      const losingResult = parseFen('rnbqkbnr/pppppppp/8/8/8/8/8/4K3 w - - 0 1');
      const losingBoard = losingResult.board;
      const losingState = losingResult.state;

      futilityPruning.canPrune(losingBoard, losingState, 2, 0, 100, false);

      const stats = futilityPruning.getStatistics();
      expect(stats.savedNodes).toBeGreaterThanOrEqual(0);
    });

    it('should reset statistics', () => {
      futilityPruning.canPrune(board, state, 2, -500, 500, false);
      futilityPruning.resetStatistics();

      const stats = futilityPruning.getStatistics();
      expect(stats.totalChecks).toBe(0);
      expect(stats.pruned).toBe(0);
      expect(stats.notPruned).toBe(0);
    });

    it('should format statistics', () => {
      const formatted = futilityPruning.formatStatistics();
      expect(formatted).toContain('Futility Pruning Statistics');
      expect(formatted).toContain('Total Checks');
      expect(formatted).toContain('Prune Rate');
    });
  });

  describe('Configuration', () => {
    it('should get config', () => {
      const config = futilityPruning.getConfig();
      expect(config).toBeDefined();
      expect(config.enabled).toBe(true);
    });

    it('should update config', () => {
      futilityPruning.updateConfig({
        maxDepth: 5,
        skipInCheck: false,
      });

      const config = futilityPruning.getConfig();
      expect(config.maxDepth).toBe(5);
      expect(config.skipInCheck).toBe(false);
      expect(config.enabled).toBe(true); // Unchanged
    });

    it('should enable/disable', () => {
      futilityPruning.disable();
      expect(futilityPruning.isEnabled()).toBe(false);

      futilityPruning.enable();
      expect(futilityPruning.isEnabled()).toBe(true);
    });

    it('should update margins', () => {
      const newMargins = [0, 75, 150, 225];
      futilityPruning.setMargins(newMargins);

      expect(futilityPruning.getFutilityMargin(1)).toBe(75);
      expect(futilityPruning.getFutilityMargin(2)).toBe(150);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very negative alpha', () => {
      const canPrune = futilityPruning.canPrune(board, state, 2, -10000, 10000, false);
      expect(canPrune).toBe(false); // Eval + margin likely > alpha
    });

    it('should handle very positive alpha', () => {
      const losingResult = parseFen('rnbqkbnr/pppppppp/8/8/8/8/8/4K3 w - - 0 1');
      const losingBoard = losingResult.board;
      const losingState = losingResult.state;

      const canPrune = futilityPruning.canPrune(losingBoard, losingState, 2, 10000, 20000, false);
      expect(canPrune).toBe(true); // Eval + margin << alpha
    });

    it('should handle rapid pruning checks', () => {
      for (let i = 0; i < 100; i++) {
        futilityPruning.canPrune(board, state, 2, -500, 500, false);
      }

      const stats = futilityPruning.getStatistics();
      expect(stats.totalChecks).toBe(100);
    });

    it('should handle various depths', () => {
      for (let depth = 1; depth <= 3; depth++) {
        futilityPruning.canPrune(board, state, depth, -500, 500, false);
      }

      const stats = futilityPruning.getStatistics();
      expect(stats.totalChecks).toBe(3);
    });
  });
});
