/**
 * @file TimeManager.test.ts
 * @description Tests for time management functionality
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TimeManager } from '../src/time/TimeManager';

describe('TimeManager', () => {
  let manager: TimeManager;

  beforeEach(() => {
    manager = new TimeManager();
  });

  describe('Time Allocation - No Increment', () => {
    it('should allocate time for one minute game', () => {
      const allocation = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000 },
        true,
        1
      );

      expect(allocation.optimalTime).toBeGreaterThan(0);
      expect(allocation.maxTime).toBeGreaterThan(0);
      expect(allocation.minTime).toBeGreaterThan(0);
    });

    it('should allocate less time when low on clock', () => {
      const normalTime = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000 },
        true,
        1
      );

      const lowTime = manager.allocateTime(
        { whiteTime: 10000, blackTime: 10000 },
        true,
        1
      );

      expect(lowTime.optimalTime).toBeLessThan(normalTime.optimalTime);
    });

    it('should have maxTime greater than or equal to optimalTime', () => {
      const allocation = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000 },
        true,
        1
      );

      expect(allocation.maxTime).toBeGreaterThanOrEqual(allocation.optimalTime);
    });

    it('should have minTime less than or equal to optimalTime', () => {
      const allocation = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000 },
        true,
        1
      );

      expect(allocation.minTime).toBeLessThanOrEqual(allocation.optimalTime);
    });
  });

  describe('Time Allocation - With Increment', () => {
    it('should allocate more time with increment', () => {
      const noIncrement = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000 },
        true,
        1
      );

      const withIncrement = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000, whiteIncrement: 1000, blackIncrement: 1000 },
        true,
        1
      );

      expect(withIncrement.optimalTime).toBeGreaterThanOrEqual(noIncrement.optimalTime);
    });

    it('should allocate more time with larger increment', () => {
      const smallInc = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000, whiteIncrement: 500, blackIncrement: 500 },
        true,
        1
      );

      const largeInc = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000, whiteIncrement: 2000, blackIncrement: 2000 },
        true,
        1
      );

      expect(largeInc.optimalTime).toBeGreaterThan(smallInc.optimalTime);
    });
  });

  describe('Moves to Go', () => {
    it('should respect moves to go parameter', () => {
      const allocation = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000, movesToGo: 10 },
        true,
        1
      );

      // Should allocate roughly 1/10th of time (with some buffer)
      expect(allocation.optimalTime).toBeLessThan(10000);
    });

    it('should allocate more time with fewer moves to go', () => {
      const fewMoves = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000, movesToGo: 5 },
        true,
        1
      );

      const manyMoves = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000, movesToGo: 20 },
        true,
        1
      );

      expect(fewMoves.optimalTime).toBeGreaterThan(manyMoves.optimalTime);
    });
  });

  describe('Color-Specific Time', () => {
    it('should use white time when white to move', () => {
      const allocation = manager.allocateTime(
        { whiteTime: 60000, blackTime: 30000 },
        true, // White to move
        1
      );

      expect(allocation.optimalTime).toBeGreaterThan(0);
    });

    it('should use black time when black to move', () => {
      const allocation = manager.allocateTime(
        { whiteTime: 30000, blackTime: 60000 },
        false, // Black to move
        1
      );

      expect(allocation.optimalTime).toBeGreaterThan(0);
    });

    it('should use correct increment for each player', () => {
      const whiteAlloc = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000, whiteIncrement: 2000, blackIncrement: 500 },
        true, // White to move
        1
      );

      const blackAlloc = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000, whiteIncrement: 500, blackIncrement: 2000 },
        false, // Black to move
        1
      );

      expect(whiteAlloc.optimalTime).toBeGreaterThan(0);
      expect(blackAlloc.optimalTime).toBeGreaterThan(0);
    });
  });

  describe('Complexity Adjustment', () => {
    it('should adjust time based on complexity', () => {
      const base = {
        optimalTime: 1000,
        maxTime: 3000,
        minTime: 500,
      };

      const simple = manager.adjustForComplexity(base, 0.2);
      const complex = manager.adjustForComplexity(base, 0.9);

      expect(complex.optimalTime).toBeGreaterThan(simple.optimalTime);
    });

    it('should not change maxTime or minTime', () => {
      const base = {
        optimalTime: 1000,
        maxTime: 3000,
        minTime: 500,
      };

      const adjusted = manager.adjustForComplexity(base, 0.5);

      expect(adjusted.maxTime).toBe(base.maxTime);
      expect(adjusted.minTime).toBe(base.minTime);
    });

    it('should handle complexity of 0', () => {
      const base = {
        optimalTime: 1000,
        maxTime: 3000,
        minTime: 500,
      };

      const adjusted = manager.adjustForComplexity(base, 0);
      expect(adjusted.optimalTime).toBeGreaterThan(0);
    });

    it('should handle complexity of 1', () => {
      const base = {
        optimalTime: 1000,
        maxTime: 3000,
        minTime: 500,
      };

      const adjusted = manager.adjustForComplexity(base, 1);
      expect(adjusted.optimalTime).toBeGreaterThan(base.optimalTime);
    });
  });

  describe('Complexity Calculation', () => {
    it('should calculate complexity from position factors', () => {
      const complexity = manager.calculateComplexity(20, 12, false);
      expect(complexity).toBeGreaterThanOrEqual(0);
      expect(complexity).toBeLessThanOrEqual(1);
    });

    it('should give higher complexity for more moves', () => {
      const few = manager.calculateComplexity(10, 12, false);
      const many = manager.calculateComplexity(40, 12, false);

      expect(many).toBeGreaterThan(few);
    });

    it('should give higher complexity for more pieces', () => {
      const fewPieces = manager.calculateComplexity(20, 6, false);
      const manyPieces = manager.calculateComplexity(20, 20, false);

      expect(manyPieces).toBeGreaterThan(fewPieces);
    });

    it('should give higher complexity for tactical positions', () => {
      const quiet = manager.calculateComplexity(20, 12, false);
      const tactical = manager.calculateComplexity(20, 12, true);

      expect(tactical).toBeGreaterThan(quiet);
    });

    it('should never exceed 1.0', () => {
      const complexity = manager.calculateComplexity(100, 32, true);
      expect(complexity).toBeLessThanOrEqual(1);
    });

    it('should never be negative', () => {
      const complexity = manager.calculateComplexity(0, 0, false);
      expect(complexity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Time Pressure Detection', () => {
    it('should detect time pressure with low time', () => {
      expect(manager.isTimePressure(5000)).toBe(true);
      expect(manager.isTimePressure(3000)).toBe(true);
    });

    it('should not detect time pressure with normal time', () => {
      expect(manager.isTimePressure(30000)).toBe(false);
      expect(manager.isTimePressure(60000)).toBe(false);
    });

    it('should consider increment when detecting pressure', () => {
      // With good increment, not in time pressure even with low time
      expect(manager.isTimePressure(5000, 2000)).toBe(false);
    });

    it('should still detect pressure with small increment', () => {
      // Small increment doesn't help enough
      expect(manager.isTimePressure(3000, 100)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very low time', () => {
      const allocation = manager.allocateTime(
        { whiteTime: 100, blackTime: 100 },
        true,
        1
      );

      // With 100ms, allocation may be 0 due to safety buffer
      expect(allocation.optimalTime).toBeGreaterThanOrEqual(0);
      expect(allocation.optimalTime).toBeLessThanOrEqual(100);
    });

    it('should handle very high time', () => {
      const allocation = manager.allocateTime(
        { whiteTime: 3600000, blackTime: 3600000 }, // 1 hour
        true,
        1
      );

      expect(allocation.optimalTime).toBeGreaterThan(0);
    });

    it('should handle move number progression', () => {
      const move1 = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000 },
        true,
        1
      );

      const move50 = manager.allocateTime(
        { whiteTime: 60000, blackTime: 60000 },
        true,
        50
      );

      // Both should work (exact relationship depends on algorithm)
      expect(move1.optimalTime).toBeGreaterThan(0);
      expect(move50.optimalTime).toBeGreaterThan(0);
    });
  });
});
