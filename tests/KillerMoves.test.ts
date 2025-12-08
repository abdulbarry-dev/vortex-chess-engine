/**
 * @file KillerMoves.test.ts
 * @description Tests for killer move heuristic
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Color, PieceType } from '../src/core/Piece';
import { KillerMoves } from '../src/search/KillerMoves';
import { Move, MoveFlags } from '../src/types/Move.types';

describe('KillerMoves', () => {
  let killerMoves: KillerMoves;

  beforeEach(() => {
    killerMoves = new KillerMoves();
  });

  describe('Initialization', () => {
    it('should initialize with empty killers', () => {
      const stats = killerMoves.getStats();
      expect(stats.totalKillers).toBe(0);
      expect(stats.pliesWithKillers).toBe(0);
    });

    it('should initialize with custom max ply', () => {
      const km = new KillerMoves(32);
      const killers = km.getKillers(31);
      expect(killers).toHaveLength(2);
    });

    it('should handle out of bounds ply gracefully', () => {
      const km = new KillerMoves(10);
      const killers = km.getKillers(20);
      expect(killers).toEqual([]);
    });
  });

  describe('Storing Killers', () => {
    it('should store a killer move', () => {
      const move = createMove(12, 28);
      killerMoves.store(move, 5);

      expect(killerMoves.isKiller(move, 5)).toBe(true);
    });

    it('should store primary killer', () => {
      const move = createMove(12, 28);
      killerMoves.store(move, 5);

      const score = killerMoves.getKillerScore(move, 5);
      expect(score).toBe(9000); // Primary killer score
    });

    it('should store secondary killer', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);

      killerMoves.store(move1, 5);
      killerMoves.store(move2, 5);

      expect(killerMoves.getKillerScore(move1, 5)).toBe(8000); // Secondary
      expect(killerMoves.getKillerScore(move2, 5)).toBe(9000); // Primary
    });

    it('should not duplicate primary killer', () => {
      const move = createMove(12, 28);

      killerMoves.store(move, 5);
      killerMoves.store(move, 5); // Store again

      const killers = killerMoves.getKillers(5);
      expect(killers[0]).toEqual(move);
      expect(killers[1]).toBeNull();
    });

    it('should shift killers correctly', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);
      const move3 = createMove(14, 30);

      killerMoves.store(move1, 5);
      killerMoves.store(move2, 5);
      killerMoves.store(move3, 5);

      const killers = killerMoves.getKillers(5);
      expect(killers[0]).toEqual(move3); // Most recent
      expect(killers[1]).toEqual(move2); // Previous
    });

    it('should store killers at different plies independently', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);

      killerMoves.store(move1, 3);
      killerMoves.store(move2, 5);

      expect(killerMoves.isKiller(move1, 3)).toBe(true);
      expect(killerMoves.isKiller(move2, 5)).toBe(true);
      expect(killerMoves.isKiller(move1, 5)).toBe(false);
      expect(killerMoves.isKiller(move2, 3)).toBe(false);
    });

    it('should handle max ply boundary', () => {
      const km = new KillerMoves(10);
      const move = createMove(12, 28);

      km.store(move, 9); // Within bounds
      expect(km.isKiller(move, 9)).toBe(true);

      km.store(move, 10); // Out of bounds
      expect(km.isKiller(move, 10)).toBe(false);
    });
  });

  describe('Killer Detection', () => {
    it('should detect primary killer', () => {
      const move = createMove(12, 28);
      killerMoves.store(move, 5);

      expect(killerMoves.isKiller(move, 5)).toBe(true);
    });

    it('should detect secondary killer', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);

      killerMoves.store(move1, 5);
      killerMoves.store(move2, 5);

      expect(killerMoves.isKiller(move1, 5)).toBe(true); // Secondary
    });

    it('should not detect non-killer', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);

      killerMoves.store(move1, 5);

      expect(killerMoves.isKiller(move2, 5)).toBe(false);
    });

    it('should check ply correctly', () => {
      const move = createMove(12, 28);

      killerMoves.store(move, 5);

      expect(killerMoves.isKiller(move, 5)).toBe(true);
      expect(killerMoves.isKiller(move, 4)).toBe(false);
      expect(killerMoves.isKiller(move, 6)).toBe(false);
    });
  });

  describe('Killer Scoring', () => {
    it('should score primary killer correctly', () => {
      const move = createMove(12, 28);
      killerMoves.store(move, 5);

      expect(killerMoves.getKillerScore(move, 5)).toBe(9000);
    });

    it('should score secondary killer correctly', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);

      killerMoves.store(move1, 5);
      killerMoves.store(move2, 5);

      expect(killerMoves.getKillerScore(move1, 5)).toBe(8000);
    });

    it('should return zero for non-killer', () => {
      const move = createMove(12, 28);
      expect(killerMoves.getKillerScore(move, 5)).toBe(0);
    });

    it('should return zero for out of bounds ply', () => {
      const km = new KillerMoves(10);
      const move = createMove(12, 28);

      expect(km.getKillerScore(move, 15)).toBe(0);
    });
  });

  describe('Clearing', () => {
    it('should clear all killers', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);

      killerMoves.store(move1, 3);
      killerMoves.store(move2, 5);

      killerMoves.clear();

      expect(killerMoves.isKiller(move1, 3)).toBe(false);
      expect(killerMoves.isKiller(move2, 5)).toBe(false);

      const stats = killerMoves.getStats();
      expect(stats.totalKillers).toBe(0);
    });

    it('should clear specific ply', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);

      killerMoves.store(move1, 3);
      killerMoves.store(move2, 5);

      killerMoves.clearPly(3);

      expect(killerMoves.isKiller(move1, 3)).toBe(false);
      expect(killerMoves.isKiller(move2, 5)).toBe(true); // Unaffected
    });

    it('should age killers (clears all)', () => {
      const move = createMove(12, 28);
      killerMoves.store(move, 5);

      killerMoves.age();

      expect(killerMoves.isKiller(move, 5)).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should track total killers', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);
      const move3 = createMove(14, 30);

      killerMoves.store(move1, 3);
      killerMoves.store(move2, 3);
      killerMoves.store(move3, 5);

      const stats = killerMoves.getStats();
      expect(stats.totalKillers).toBe(3);
    });

    it('should track plies with killers', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);

      killerMoves.store(move1, 3);
      killerMoves.store(move2, 5);

      const stats = killerMoves.getStats();
      expect(stats.pliesWithKillers).toBe(2);
    });

    it('should count ply correctly with multiple killers', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);

      killerMoves.store(move1, 3);
      killerMoves.store(move2, 3);

      const stats = killerMoves.getStats();
      expect(stats.pliesWithKillers).toBe(1); // Same ply
    });
  });

  describe('Edge Cases', () => {
    it('should handle null moves gracefully', () => {
      const killers = killerMoves.getKillers(5);
      expect(killers[0]).toBeNull();
      expect(killers[1]).toBeNull();
    });

    it('should handle rapid stores', () => {
      for (let i = 0; i < 10; i++) {
        const move = createMove(i, i + 8);
        killerMoves.store(move, 5);
      }

      const killers = killerMoves.getKillers(5);
      expect(killers).toHaveLength(2); // Only keeps 2
    });

    it('should handle many plies', () => {
      for (let ply = 0; ply < 20; ply++) {
        const move = createMove(12, 28);
        killerMoves.store(move, ply);
      }

      const stats = killerMoves.getStats();
      expect(stats.pliesWithKillers).toBe(20);
    });
  });
});

// Helper function to create test moves
function createMove(from: number, to: number): Move {
  return {
    from,
    to,
    piece: {
      type: PieceType.Knight,
      color: Color.White,
    },
    flags: MoveFlags.None,
  };
}
