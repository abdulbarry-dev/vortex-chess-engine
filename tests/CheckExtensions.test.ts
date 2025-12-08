/**
 * @file CheckExtensions.test.ts
 * @description Tests for check extensions in search
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { CheckExtensions } from '../src/search/CheckExtensions';
import { parseFen } from '../src/utils/FenParser';

describe('CheckExtensions', () => {
  let checkExt: CheckExtensions;
  let board: Board;
  let state: GameState;

  beforeEach(() => {
    checkExt = new CheckExtensions();
    board = new Board();
    board.initializeStartingPosition();
    state = new GameState();
    state.reset();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const config = checkExt.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.extensionPly).toBe(1);
      expect(config.maxExtensions).toBe(16);
      expect(config.minDepth).toBe(2);
    });

    it('should initialize with custom config', () => {
      const ce = new CheckExtensions({
        enabled: false,
        extensionPly: 2,
        maxExtensions: 8,
        minDepth: 3,
      });

      const config = ce.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.extensionPly).toBe(2);
      expect(config.maxExtensions).toBe(8);
      expect(config.minDepth).toBe(3);
    });

    it('should start with zero statistics', () => {
      const stats = checkExt.getStatistics();
      expect(stats.totalExtensions).toBe(0);
      expect(stats.checksEvaluated).toBe(0);
      expect(stats.extensionsDenied).toBe(0);
    });
  });

  describe('Extension State', () => {
    it('should create initial extension state', () => {
      const extState = checkExt.createExtensionState();
      expect(extState.totalExtensions).toBe(0);
      expect(extState.extensionsAtPly).toHaveLength(64);
    });

    it('should create state with custom max ply', () => {
      const extState = checkExt.createExtensionState(32);
      expect(extState.extensionsAtPly).toHaveLength(32);
    });

    it('should update extension state', () => {
      const extState = checkExt.createExtensionState();
      const updated = checkExt.updateExtensionState(extState, 5, 1);

      expect(updated.totalExtensions).toBe(1);
      expect(updated.extensionsAtPly[5]).toBe(1);
    });

    it('should not update state when extension is zero', () => {
      const extState = checkExt.createExtensionState();
      const updated = checkExt.updateExtensionState(extState, 5, 0);

      expect(updated).toBe(extState); // Same reference
      expect(updated.totalExtensions).toBe(0);
    });
  });

  describe('Extension Decision', () => {
    it('should not extend when disabled', () => {
      checkExt.disable();
      const extState = checkExt.createExtensionState();

      // Create position with check (doesn't matter since disabled)
      const extension = checkExt.shouldExtend(board, state, 5, 0, extState);
      expect(extension).toBe(0);
    });

    it('should not extend below min depth', () => {
      const extState = checkExt.createExtensionState();
      
      // Depth 1 is below minDepth (2)
      const extension = checkExt.shouldExtend(board, state, 1, 0, extState);
      expect(extension).toBe(0);
    });

    it('should not extend when not in check', () => {
      const extState = checkExt.createExtensionState();
      
      // Starting position - no check
      const extension = checkExt.shouldExtend(board, state, 5, 0, extState);
      expect(extension).toBe(0);
    });

    it('should extend when in check', () => {
      // Position with white king in check
      const checkResult = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1');
      const checkBoard = checkResult.board;
      const checkState = checkResult.state;
      const extState = checkExt.createExtensionState();

      const extension = checkExt.shouldExtend(checkBoard, checkState, 5, 0, extState);
      expect(extension).toBe(1);
    });

    it('should not extend beyond max extensions', () => {
      const ce = new CheckExtensions({ maxExtensions: 2 });
      const extState = ce.createExtensionState();
      extState.totalExtensions = 2; // Already at max

      // Even if in check, shouldn't extend
      const checkResult = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1');
      const checkBoard = checkResult.board;
      const checkState = checkResult.state;

      const extension = ce.shouldExtend(checkBoard, checkState, 5, 0, extState);
      expect(extension).toBe(0);
    });

    it('should track extensions denied', () => {
      const ce = new CheckExtensions({ maxExtensions: 1 });
      const extState = ce.createExtensionState();
      extState.totalExtensions = 1;

      const checkResult = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1');
      const checkBoard = checkResult.board;
      const checkState = checkResult.state;

      ce.shouldExtend(checkBoard, checkState, 5, 0, extState);

      const stats = ce.getStatistics();
      expect(stats.extensionsDenied).toBe(1);
    });
  });

  describe('Extension Limits', () => {
    it('should check if extensions available', () => {
      const extState = checkExt.createExtensionState();
      expect(checkExt.canExtend(extState)).toBe(true);

      extState.totalExtensions = 16; // Max
      expect(checkExt.canExtend(extState)).toBe(false);
    });

    it('should get remaining extensions', () => {
      const extState = checkExt.createExtensionState();
      expect(checkExt.getRemainingExtensions(extState)).toBe(16);

      extState.totalExtensions = 5;
      expect(checkExt.getRemainingExtensions(extState)).toBe(11);

      extState.totalExtensions = 20; // Over max
      expect(checkExt.getRemainingExtensions(extState)).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should work across multiple extensions', () => {
      const checkResult = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1');
      const checkBoard = checkResult.board;
      const checkState = checkResult.state;
      const extState = checkExt.createExtensionState();

      // Multiple extension opportunities
      checkExt.shouldExtend(checkBoard, checkState, 5, 0, extState);
      checkExt.shouldExtend(checkBoard, checkState, 5, 1, extState);

      const stats = checkExt.getStatistics();
      expect(stats.totalExtensions).toBe(2);
    });

    it('should track checks evaluated', () => {
      const extState = checkExt.createExtensionState();

      // Evaluate several positions
      checkExt.shouldExtend(board, state, 5, 0, extState);
      checkExt.shouldExtend(board, state, 5, 1, extState);
      checkExt.shouldExtend(board, state, 5, 2, extState);

      const stats = checkExt.getStatistics();
      expect(stats.checksEvaluated).toBe(3);
    });

    it('should track extension depth', () => {
      const checkResult = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1');
      const checkBoard = checkResult.board;
      const checkState = checkResult.state;
      const extState = checkExt.createExtensionState();

      checkExt.shouldExtend(checkBoard, checkState, 5, 3, extState);
      checkExt.shouldExtend(checkBoard, checkState, 5, 5, extState);
      checkExt.shouldExtend(checkBoard, checkState, 5, 5, extState);

      const stats = checkExt.getStatistics();
      const plyStats = stats.extensionsByPly;

      const ply3 = plyStats.find(s => s.ply === 3);
      const ply5 = plyStats.find(s => s.ply === 5);

      expect(ply3?.count).toBe(1);
      expect(ply5?.count).toBe(2);
    });

    it('should calculate extension rate', () => {
      const checkResult = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1');
      const checkBoard = checkResult.board;
      const checkState = checkResult.state;
      const extState = checkExt.createExtensionState();

      // 2 checks, 2 extensions
      checkExt.shouldExtend(checkBoard, checkState, 5, 0, extState);
      checkExt.shouldExtend(checkBoard, checkState, 5, 1, extState);

      const stats = checkExt.getStatistics();
      expect(stats.extensionRate).toBe(1.0); // 2/2

      // Add non-check position
      checkExt.shouldExtend(board, state, 5, 2, extState);
      const stats2 = checkExt.getStatistics();
      expect(stats2.extensionRate).toBeCloseTo(0.666, 2); // 2/3
    });

    it('should reset statistics', () => {
      const checkResult = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1');
      const checkBoard = checkResult.board;
      const checkState = checkResult.state;
      const extState = checkExt.createExtensionState();

      checkExt.shouldExtend(checkBoard, checkState, 5, 0, extState);
      checkExt.resetStatistics();

      const stats = checkExt.getStatistics();
      expect(stats.totalExtensions).toBe(0);
      expect(stats.checksEvaluated).toBe(0);
    });

    it('should format statistics', () => {
      const formatted = checkExt.formatStatistics();
      expect(formatted).toContain('Check Extension Statistics');
      expect(formatted).toContain('Total Extensions');
      expect(formatted).toContain('Checks Evaluated');
    });
  });

  describe('Configuration', () => {
    it('should update config', () => {
      checkExt.updateConfig({
        extensionPly: 2,
        maxExtensions: 8,
      });

      const config = checkExt.getConfig();
      expect(config.extensionPly).toBe(2);
      expect(config.maxExtensions).toBe(8);
      expect(config.enabled).toBe(true); // Unchanged
    });

    it('should enable/disable', () => {
      checkExt.disable();
      expect(checkExt.isEnabled()).toBe(false);

      checkExt.enable();
      expect(checkExt.isEnabled()).toBe(true);
    });

    it('should get extended depth', () => {
      const originalDepth = 5;
      const extension = 1;

      const newDepth = checkExt.getExtendedDepth(originalDepth, extension);
      expect(newDepth).toBe(6);
    });

    it('should get extended depth with no extension', () => {
      const originalDepth = 5;
      const extension = 0;

      const newDepth = checkExt.getExtendedDepth(originalDepth, extension);
      expect(newDepth).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle depth 0', () => {
      const extState = checkExt.createExtensionState();
      const extension = checkExt.shouldExtend(board, state, 0, 0, extState);
      expect(extension).toBe(0);
    });

    it('should handle negative depth', () => {
      const extState = checkExt.createExtensionState();
      const extension = checkExt.shouldExtend(board, state, -1, 0, extState);
      expect(extension).toBe(0);
    });

    it('should handle large ply values', () => {
      const checkResult = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1');
      const checkBoard = checkResult.board;
      const checkState = checkResult.state;
      const extState = checkExt.createExtensionState();

      const extension = checkExt.shouldExtend(checkBoard, checkState, 5, 50, extState);
      expect(extension).toBe(1); // Should still work
    });

    it('should handle rapid extension checks', () => {
      const checkResult = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1');
      const checkBoard = checkResult.board;
      const checkState = checkResult.state;
      const extState = checkExt.createExtensionState();

      for (let i = 0; i < 20; i++) {
        checkExt.shouldExtend(checkBoard, checkState, 5, i, extState);
      }

      const stats = checkExt.getStatistics();
      expect(stats.totalExtensions).toBe(16); // Capped at maxExtensions
      expect(stats.extensionsDenied).toBe(4); // Remaining were denied
    });
  });
});
