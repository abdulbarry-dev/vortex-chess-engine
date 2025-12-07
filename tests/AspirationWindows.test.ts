/**
 * @file AspirationWindows.test.ts
 * @description Tests for aspiration window search optimization
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { AspirationWindows } from '../src/search/AspirationWindows';

describe('AspirationWindows', () => {
  let aspiration: AspirationWindows;

  beforeEach(() => {
    aspiration = new AspirationWindows();
  });

  describe('Initialization', () => {
    it('should create with default parameters', () => {
      expect(aspiration).toBeDefined();
    });

    it('should create with custom parameters', () => {
      const custom = new AspirationWindows(100, 3.0, 1000);
      expect(custom).toBeDefined();
    });
  });

  describe('Initial Window', () => {
    it('should return window around expected score', () => {
      const window = aspiration.getInitialWindow(100, 6);
      
      expect(window.alpha).toBeLessThan(100);
      expect(window.beta).toBeGreaterThan(100);
      expect(window.beta - window.alpha).toBeGreaterThan(0);
    });

    it('should use wider window for shallow depths', () => {
      const shallow = aspiration.getInitialWindow(100, 3);
      const deep = aspiration.getInitialWindow(100, 8);
      
      const shallowSize = shallow.beta - shallow.alpha;
      const deepSize = deep.beta - deep.alpha;
      
      expect(shallowSize).toBeGreaterThanOrEqual(deepSize);
    });

    it('should center window around expected score', () => {
      const window = aspiration.getInitialWindow(200, 6);
      const center = (window.alpha + window.beta) / 2;
      
      expect(Math.abs(center - 200)).toBeLessThan(1);
    });

    it('should handle negative scores', () => {
      const window = aspiration.getInitialWindow(-300, 6);
      
      expect(window.alpha).toBeLessThan(-300);
      expect(window.beta).toBeGreaterThan(-300);
    });

    it('should handle zero score', () => {
      const window = aspiration.getInitialWindow(0, 6);
      
      expect(window.alpha).toBeLessThan(0);
      expect(window.beta).toBeGreaterThan(0);
    });
  });

  describe('Window Widening', () => {
    it('should widen window on fail low', () => {
      const initial = { alpha: 50, beta: 150 };
      const widened = aspiration.widenWindow(
        initial.alpha,
        initial.beta,
        40, // Score below alpha
        true // Failed low
      );
      
      expect(widened.alpha).toBeLessThan(initial.alpha);
      expect(widened.beta).toBe(initial.beta);
    });

    it('should widen window on fail high', () => {
      const initial = { alpha: 50, beta: 150 };
      const widened = aspiration.widenWindow(
        initial.alpha,
        initial.beta,
        160, // Score above beta
        false // Failed high
      );
      
      expect(widened.alpha).toBe(initial.alpha);
      expect(widened.beta).toBeGreaterThan(initial.beta);
    });

    it('should respect maximum window size', () => {
      const asp = new AspirationWindows(50, 2.0, 500);
      
      let window = { alpha: 0, beta: 100 };
      
      // Keep widening until we hit max
      for (let i = 0; i < 10; i++) {
        window = asp.widenWindow(window.alpha, window.beta, window.beta + 1, false);
      }
      
      const windowSize = window.beta - window.alpha;
      expect(windowSize).toBeLessThanOrEqual(500);
    });

    it('should grow window by specified factor', () => {
      const asp = new AspirationWindows(50, 3.0, 1000);
      
      const initial = { alpha: 0, beta: 100 };
      const initialSize = 100;
      
      const widened = asp.widenWindow(initial.alpha, initial.beta, 110, false);
      const widenedSize = widened.beta - widened.alpha;
      
      expect(widenedSize).toBeGreaterThan(initialSize);
    });
  });

  describe('Full Window', () => {
    it('should return infinite window', () => {
      const window = aspiration.getFullWindow();
      
      expect(window.alpha).toBe(-Infinity);
      expect(window.beta).toBe(Infinity);
    });

    it('should use full window for shallow depths', () => {
      expect(aspiration.shouldUseFullWindow(1, 5)).toBe(true);
      expect(aspiration.shouldUseFullWindow(2, 5)).toBe(true);
    });

    it('should use full window for early iterations', () => {
      expect(aspiration.shouldUseFullWindow(6, 1)).toBe(true);
      expect(aspiration.shouldUseFullWindow(6, 2)).toBe(true);
    });

    it('should not use full window for normal search', () => {
      expect(aspiration.shouldUseFullWindow(6, 4)).toBe(false);
      expect(aspiration.shouldUseFullWindow(10, 5)).toBe(false);
    });

    it('should detect effectively full window', () => {
      expect(aspiration.isEffectivelyFullWindow(-Infinity, Infinity)).toBe(true);
      expect(aspiration.isEffectivelyFullWindow(-10000, 10000)).toBe(true);
      expect(aspiration.isEffectivelyFullWindow(-50, 50)).toBe(false);
    });
  });

  describe('Volatility Adjustment', () => {
    it('should widen window for tactical positions', () => {
      const baseWindow = 50;
      
      const quiet = aspiration.adjustForVolatility(baseWindow, 2, 30); // Few captures
      const tactical = aspiration.adjustForVolatility(baseWindow, 12, 30); // Many captures
      
      expect(tactical).toBeGreaterThan(quiet);
    });

    it('should not adjust for quiet positions', () => {
      const baseWindow = 50;
      const adjusted = aspiration.adjustForVolatility(baseWindow, 1, 30);
      
      expect(adjusted).toBe(baseWindow);
    });

    it('should handle zero moves', () => {
      const baseWindow = 50;
      const adjusted = aspiration.adjustForVolatility(baseWindow, 0, 0);
      
      expect(adjusted).toBe(baseWindow);
    });

    it('should increase window proportionally to captures', () => {
      const baseWindow = 50;
      
      const low = aspiration.adjustForVolatility(baseWindow, 5, 30);
      const high = aspiration.adjustForVolatility(baseWindow, 15, 30);
      
      expect(high).toBeGreaterThanOrEqual(low);
    });
  });

  describe('Statistics', () => {
    it('should generate stats for exact score', () => {
      const result = {
        score: 100,
        failedLow: false,
        failedHigh: false,
        searchCount: 1,
      };
      
      const stats = aspiration.getStats(result);
      expect(stats).toContain('EXACT');
      expect(stats).toContain('100');
    });

    it('should generate stats for fail low', () => {
      const result = {
        score: 50,
        failedLow: true,
        failedHigh: false,
        searchCount: 2,
      };
      
      const stats = aspiration.getStats(result);
      expect(stats).toContain('FAIL LOW');
    });

    it('should generate stats for fail high', () => {
      const result = {
        score: 200,
        failedLow: false,
        failedHigh: true,
        searchCount: 2,
      };
      
      const stats = aspiration.getStats(result);
      expect(stats).toContain('FAIL HIGH');
    });

    it('should include search count', () => {
      const result = {
        score: 100,
        failedLow: false,
        failedHigh: false,
        searchCount: 3,
      };
      
      const stats = aspiration.getStats(result);
      expect(stats).toContain('3');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large scores', () => {
      const window = aspiration.getInitialWindow(9999, 6);
      
      expect(window.alpha).toBeLessThan(9999);
      expect(window.beta).toBeGreaterThan(9999);
    });

    it('should handle very negative scores', () => {
      const window = aspiration.getInitialWindow(-9999, 6);
      
      expect(window.alpha).toBeLessThan(-9999);
      expect(window.beta).toBeGreaterThan(-9999);
    });

    it('should handle depth 0', () => {
      const window = aspiration.getInitialWindow(100, 0);
      
      expect(isFinite(window.alpha)).toBe(true);
      expect(isFinite(window.beta)).toBe(true);
    });

    it('should handle multiple consecutive widenings', () => {
      let window = { alpha: 0, beta: 100 };
      
      for (let i = 0; i < 5; i++) {
        window = aspiration.widenWindow(
          window.alpha,
          window.beta,
          window.beta + 10,
          false
        );
      }
      
      expect(window.beta).toBeGreaterThan(100);
    });
  });
});
