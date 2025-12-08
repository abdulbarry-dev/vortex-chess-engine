/**
 * @file HistoryHeuristic.test.ts
 * @description Tests for history heuristic
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { HistoryHeuristic } from '../src/search/HistoryHeuristic';
import { Move, MoveFlags } from '../src/types/Move.types';
import { Color, PieceType } from "../src/core/Piece";

describe('HistoryHeuristic', () => {
  let history: HistoryHeuristic;

  beforeEach(() => {
    history = new HistoryHeuristic();
  });

  describe('Initialization', () => {
    it('should initialize with empty history', () => {
      const stats = history.getStats();
      expect(stats.whiteEntries).toBe(0);
      expect(stats.blackEntries).toBe(0);
      expect(stats.totalScore).toBe(0);
    });

    it('should initialize with custom max history', () => {
      const h = new HistoryHeuristic(5000);
      const move = createMove(12, 28, Color.White);

      h.recordSuccess(move, 5);
      const score = h.getScore(move);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(5000);
    });
  });

  describe('Recording Success', () => {
    it('should record successful move', () => {
      const move = createMove(12, 28, Color.White);

      history.recordSuccess(move, 3);
      const score = history.getScore(move);

      expect(score).toBeGreaterThan(0);
    });

    it('should use depth squared for bonus', () => {
      const move1 = createMove(12, 28, Color.White);
      const move2 = createMove(13, 29, Color.White);

      history.recordSuccess(move1, 2); // Bonus: 4
      history.recordSuccess(move2, 3); // Bonus: 9

      expect(history.getScore(move2)).toBeGreaterThan(history.getScore(move1));
    });

    it('should accumulate scores', () => {
      const move = createMove(12, 28, Color.White);

      history.recordSuccess(move, 2);
      const score1 = history.getScore(move);

      history.recordSuccess(move, 2);
      const score2 = history.getScore(move);

      expect(score2).toBe(score1 * 2);
    });

    it('should track white and black separately', () => {
      const whiteMove = createMove(12, 28, Color.White);
      const blackMove = createMove(52, 36, Color.Black);

      history.recordSuccess(whiteMove, 3);
      history.recordSuccess(blackMove, 3);

      expect(history.getScore(whiteMove)).toBeGreaterThan(0);
      expect(history.getScore(blackMove)).toBeGreaterThan(0);

      const stats = history.getStats();
      expect(stats.whiteEntries).toBe(1);
      expect(stats.blackEntries).toBe(1);
    });

    it('should clamp to max history', () => {
      const h = new HistoryHeuristic(100);
      const move = createMove(12, 28, Color.White);

      for (let i = 0; i < 20; i++) {
        h.recordSuccess(move, 5); // Large bonuses
      }

      expect(h.getScore(move)).toBeLessThanOrEqual(100);
    });
  });

  describe('Recording Failure', () => {
    it('should record failed move', () => {
      const move = createMove(12, 28, Color.White);

      history.recordSuccess(move, 4); // Score: 16
      const initialScore = history.getScore(move);

      history.recordFailure(move, 4); // Penalty: 2
      const finalScore = history.getScore(move);

      expect(finalScore).toBeLessThan(initialScore);
    });

    it('should not go below zero', () => {
      const move = createMove(12, 28, Color.White);

      history.recordFailure(move, 10);
      expect(history.getScore(move)).toBe(0);
    });

    it('should use smaller penalty than success bonus', () => {
      const move1 = createMove(12, 28, Color.White);
      const move2 = createMove(13, 29, Color.White);

      const depth = 4;
      history.recordSuccess(move1, depth); // +16
      history.recordFailure(move2, depth); // -2 (depth/2)

      // Success bonus should be much larger
      expect(history.getScore(move1)).toBeGreaterThan(
        Math.abs(history.getScore(move2))
      );
    });
  });

  describe('Score Retrieval', () => {
    it('should get score for move', () => {
      const move = createMove(12, 28, Color.White);

      history.recordSuccess(move, 3);
      expect(history.getScore(move)).toBe(9);
    });

    it('should return zero for unknown move', () => {
      const move = createMove(12, 28, Color.White);
      expect(history.getScore(move)).toBe(0);
    });

    it('should get normalized score', () => {
      const h = new HistoryHeuristic(1000);
      const move = createMove(12, 28, Color.White);

      h.recordSuccess(move, 10); // Score: 100

      const normalized = h.getNormalizedScore(move);
      expect(normalized).toBe(100); // (100/1000) * 1000
    });

    it('should normalize to 0-1000 range', () => {
      const h = new HistoryHeuristic(10000);
      const move = createMove(12, 28, Color.White);

      h.recordSuccess(move, 50); // Large score

      const normalized = h.getNormalizedScore(move);
      expect(normalized).toBeGreaterThanOrEqual(0);
      expect(normalized).toBeLessThanOrEqual(1000);
    });
  });

  describe('Best Move Retrieval', () => {
    it('should find best move for piece', () => {
      const piece = { type: PieceType.Knight, color: Color.White };
      const move1 = createMoveWithPiece(piece, 12, 28);
      const move2 = createMoveWithPiece(piece, 12, 29);

      history.recordSuccess(move1, 2);
      history.recordSuccess(move2, 3);

      const best = history.getBestMove(piece, 12);
      expect(best).not.toBeNull();
      expect(best?.to).toBe(29); // Higher score
    });

    it('should return null for no history', () => {
      const piece = { type: PieceType.Knight, color: Color.White };
      const best = history.getBestMove(piece, 12);

      expect(best).toBeNull();
    });

    it('should track score with best move', () => {
      const piece = { type: PieceType.Knight, color: Color.White };
      const move = createMoveWithPiece(piece, 12, 28);

      history.recordSuccess(move, 3);

      const best = history.getBestMove(piece, 12);
      expect(best?.score).toBe(9);
    });
  });

  describe('Clearing', () => {
    it('should clear all history', () => {
      const whiteMove = createMove(12, 28, Color.White);
      const blackMove = createMove(52, 36, Color.Black);

      history.recordSuccess(whiteMove, 3);
      history.recordSuccess(blackMove, 3);

      history.clear();

      expect(history.getScore(whiteMove)).toBe(0);
      expect(history.getScore(blackMove)).toBe(0);

      const stats = history.getStats();
      expect(stats.totalScore).toBe(0);
    });

    it('should clear color-specific history', () => {
      const whiteMove = createMove(12, 28, Color.White);
      const blackMove = createMove(52, 36, Color.Black);

      history.recordSuccess(whiteMove, 3);
      history.recordSuccess(blackMove, 3);

      history.clearColor(Color.White);

      expect(history.getScore(whiteMove)).toBe(0);
      expect(history.getScore(blackMove)).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should track entry counts', () => {
      const whiteMove1 = createMove(12, 28, Color.White);
      const whiteMove2 = createMove(13, 29, Color.White);
      const blackMove = createMove(52, 36, Color.Black);

      history.recordSuccess(whiteMove1, 2);
      history.recordSuccess(whiteMove2, 2);
      history.recordSuccess(blackMove, 2);

      const stats = history.getStats();
      expect(stats.whiteEntries).toBe(2);
      expect(stats.blackEntries).toBe(1);
    });

    it('should track total score', () => {
      const move1 = createMove(12, 28, Color.White);
      const move2 = createMove(13, 29, Color.White);

      history.recordSuccess(move1, 2); // +4
      history.recordSuccess(move2, 3); // +9

      const stats = history.getStats();
      expect(stats.totalScore).toBe(13);
    });

    it('should calculate average score', () => {
      const move1 = createMove(12, 28, Color.White);
      const move2 = createMove(13, 29, Color.White);

      history.recordSuccess(move1, 2); // +4
      history.recordSuccess(move2, 3); // +9

      const stats = history.getStats();
      expect(stats.avgScore).toBe(6.5); // (4+9)/2
    });

    it('should track max score', () => {
      const move1 = createMove(12, 28, Color.White);
      const move2 = createMove(13, 29, Color.White);

      history.recordSuccess(move1, 2); // +4
      history.recordSuccess(move2, 5); // +25

      const stats = history.getStats();
      expect(stats.maxScore).toBe(25);
    });
  });

  describe('Import/Export', () => {
    it('should export history data', () => {
      const move = createMove(12, 28, Color.White);
      history.recordSuccess(move, 3);

      const exported = history.export(Color.White);
      expect(exported).toBeInstanceOf(Array);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('should import history data', () => {
      const move = createMove(12, 28, Color.White);
      history.recordSuccess(move, 3);

      const exported = history.export(Color.White);
      const newHistory = new HistoryHeuristic();
      newHistory.import(Color.White, exported);

      expect(newHistory.getScore(move)).toBe(history.getScore(move));
    });

    it('should preserve scores through export/import', () => {
      const move1 = createMove(12, 28, Color.White);
      const move2 = createMove(13, 29, Color.White);

      history.recordSuccess(move1, 2);
      history.recordSuccess(move2, 3);

      const exported = history.export(Color.White);
      const newHistory = new HistoryHeuristic();
      newHistory.import(Color.White, exported);

      expect(newHistory.getScore(move1)).toBe(4);
      expect(newHistory.getScore(move2)).toBe(9);
    });

    it('should clamp imported values', () => {
      const h = new HistoryHeuristic(100);
      const move = createMove(12, 28, Color.White);

      // Create data with large value
      const data: number[][][] = [];
      for (let i = 0; i < 7; i++) {
        data[i] = [];
        for (let j = 0; j < 64; j++) {
          data[i][j] = new Array(64).fill(0);
        }
      }
      data[PieceType.Knight][12][28] = 500; // Over max

      h.import(Color.White, data);
      expect(h.getScore(move)).toBe(100); // Clamped
    });
  });

  describe('Edge Cases', () => {
    it('should handle moves without piece', () => {
      const move: Move = {
        from: 12,
        to: 28,
        flags: MoveFlags.None,
      };

      history.recordSuccess(move, 3);
      expect(history.getScore(move)).toBe(0);
    });

    it('should handle many unique moves', () => {
      for (let from = 0; from < 64; from++) {
        for (let to = 0; to < 64; to++) {
          if (from !== to) {
            const move = createMove(from, to, Color.White);
            history.recordSuccess(move, 1);
          }
        }
      }

      const stats = history.getStats();
      expect(stats.whiteEntries).toBeGreaterThan(100);
    });

    it('should handle alternating success and failure', () => {
      const move = createMove(12, 28, Color.White);

      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          history.recordSuccess(move, 2);
        } else {
          history.recordFailure(move, 2);
        }
      }

      // Score should still be positive (success bonus > failure penalty)
      expect(history.getScore(move)).toBeGreaterThan(0);
    });
  });
});

// Helper functions
function createMove(from: number, to: number, color: Color): Move {
  return {
    from,
    to,
    piece: {
      type: PieceType.Knight,
      color,
    },
    flags: MoveFlags.None,
  };
}

function createMoveWithPiece(
  piece: { type: PieceType; color: Color },
  from: number,
  to: number
): Move {
  return {
    from,
    to,
    piece,
    flags: MoveFlags.None,
  };
}
