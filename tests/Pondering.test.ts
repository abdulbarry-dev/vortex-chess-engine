/**
 * @file Pondering.test.ts
 * @description Tests for pondering (thinking on opponent's time)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { MoveGenerator } from '../src/move-generation/MoveGenerator';
import { PonderingManager, PonderStatus } from '../src/search/Pondering';

describe('Pondering', () => {
  let pondering: PonderingManager;
  let board: Board;
  let state: GameState;
  let moveGen: MoveGenerator;

  beforeEach(() => {
    pondering = new PonderingManager();
    board = new Board();
    state = new GameState();
    moveGen = new MoveGenerator();
    board.initializeStartingPosition();
    state.reset();
  });

  describe('Initialization', () => {
    it('should start in idle state', () => {
      expect(pondering.getStatus()).toBe(PonderStatus.Idle);
    });

    it('should be enabled by default', () => {
      expect(pondering.isEnabled()).toBe(true);
    });

    it('should not be pondering initially', () => {
      expect(pondering.isPondering()).toBe(false);
    });

    it('should accept custom configuration', () => {
      const custom = new PonderingManager({ enabled: false, maxDepth: 10 });
      expect(custom.isEnabled()).toBe(false);
    });
  });

  describe('Start Pondering', () => {
    it('should start pondering with valid move', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      
      expect(pondering.isPondering()).toBe(true);
      expect(pondering.getStatus()).toBe(PonderStatus.Pondering);
    });

    it('should store ponder move', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      
      const ponderMove = pondering.getPonderMove();
      expect(ponderMove).not.toBeNull();
      expect(ponderMove?.from).toBe(move.from);
      expect(ponderMove?.to).toBe(move.to);
    });

    it('should create ponder board', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      
      const ponderBoard = pondering.getPonderBoard();
      expect(ponderBoard).not.toBeNull();
    });

    it('should create ponder state', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      
      const ponderState = pondering.getPonderState();
      expect(ponderState).not.toBeNull();
    });

    it('should not start if disabled', () => {
      pondering.setEnabled(false);
      
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      
      expect(pondering.isPondering()).toBe(false);
    });
  });

  describe('Ponder Hit', () => {
    it('should handle ponder hit', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      const hit = pondering.ponderHit();
      
      expect(hit).toBe(true);
      expect(pondering.getStatus()).toBe(PonderStatus.PonderHit);
    });

    it('should return false if not pondering', () => {
      const hit = pondering.ponderHit();
      expect(hit).toBe(false);
    });

    it('should continue pondering after hit by default', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.ponderHit();
      
      // Should still have ponder board available
      expect(pondering.getPonderBoard()).not.toBeNull();
    });

    it('should stop on hit if configured', () => {
      const manager = new PonderingManager({ stopOnHit: true });
      
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      manager.startPondering(board, state, move);
      manager.ponderHit();
      
      expect(manager.getStatus()).toBe(PonderStatus.Stopped);
    });

    it('should track ponder hit status', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.ponderHit();
      
      expect(pondering.hadPonderHit()).toBe(true);
    });
  });

  describe('Ponder Miss', () => {
    it('should handle ponder miss', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.ponderMiss();
      
      expect(pondering.getStatus()).toBe(PonderStatus.PonderMiss);
    });

    it('should stop pondering on miss', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.ponderMiss();
      
      expect(pondering.isPondering()).toBe(false);
    });

    it('should clear ponder board on miss', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.ponderMiss();
      
      expect(pondering.getPonderBoard()).toBeNull();
    });

    it('should not track as ponder hit', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.ponderMiss();
      
      expect(pondering.hadPonderHit()).toBe(false);
    });
  });

  describe('Stop Pondering', () => {
    it('should stop pondering', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.stop();
      
      expect(pondering.getStatus()).toBe(PonderStatus.Stopped);
      expect(pondering.isPondering()).toBe(false);
    });

    it('should request stop', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.stop();
      
      expect(pondering.shouldStop()).toBe(true);
    });

    it('should clear ponder data', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.stop();
      
      expect(pondering.getPonderBoard()).toBeNull();
      expect(pondering.getPonderState()).toBeNull();
    });
  });

  describe('Configuration', () => {
    it('should enable/disable pondering', () => {
      pondering.setEnabled(false);
      expect(pondering.isEnabled()).toBe(false);
      
      pondering.setEnabled(true);
      expect(pondering.isEnabled()).toBe(true);
    });

    it('should stop pondering when disabled', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.setEnabled(false);
      
      expect(pondering.isPondering()).toBe(false);
    });

    it('should update configuration', () => {
      pondering.updateConfig({ maxDepth: 15 });
      
      const config = pondering.getConfig();
      expect(config.maxDepth).toBe(15);
    });

    it('should preserve other config when updating', () => {
      pondering.updateConfig({ maxDepth: 15 });
      
      const config = pondering.getConfig();
      expect(config.enabled).toBe(true); // Should still be enabled
    });

    it('should get current configuration', () => {
      const config = pondering.getConfig();
      
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('maxDepth');
      expect(config).toHaveProperty('stopOnHit');
    });
  });

  describe('Reset', () => {
    it('should reset to idle state', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.reset();
      
      expect(pondering.getStatus()).toBe(PonderStatus.Idle);
    });

    it('should clear ponder move', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.reset();
      
      expect(pondering.getPonderMove()).toBeNull();
    });

    it('should allow restarting after reset', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.reset();
      pondering.startPondering(board, state, move);
      
      expect(pondering.isPondering()).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should generate effectiveness stats', () => {
      const stats = PonderingManager.getEffectivenessStats(10, 7);
      
      expect(stats).toContain('70.0%');
      expect(stats).toContain('7/10');
    });

    it('should handle zero ponders', () => {
      const stats = PonderingManager.getEffectivenessStats(0, 0);
      
      expect(stats).toContain('No ponder attempts');
    });

    it('should calculate hit rate correctly', () => {
      const stats = PonderingManager.getEffectivenessStats(20, 10);
      
      expect(stats).toContain('50.0%');
    });
  });

  describe('Edge Cases', () => {
    it('should handle stop without start', () => {
      pondering.stop();
      expect(pondering.shouldStop()).toBe(true);
    });

    it('should handle multiple starts', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      const move = moves[0]!;
      
      pondering.startPondering(board, state, move);
      pondering.startPondering(board, state, move);
      
      expect(pondering.isPondering()).toBe(true);
    });

    it('should handle ponder hit when not pondering', () => {
      const hit = pondering.ponderHit();
      expect(hit).toBe(false);
    });

    it('should handle ponder miss when not pondering', () => {
      pondering.ponderMiss();
      // Should not crash
      expect(pondering.getStatus()).not.toBe(PonderStatus.PonderMiss);
    });
  });
});
