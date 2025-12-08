/**
 * @file PrincipalVariationSearch.test.ts
 * @description Tests for Principal Variation Search
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { NodeType, PrincipalVariationSearch } from '../src/search/PrincipalVariationSearch';

describe('PrincipalVariationSearch', () => {
  let pvs: PrincipalVariationSearch;

  beforeEach(() => {
    pvs = new PrincipalVariationSearch();
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const config = pvs.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.minDepth).toBe(2);
      expect(config.useZeroWindow).toBe(true);
    });

    it('should allow custom configuration', () => {
      const customPVS = new PrincipalVariationSearch({
        minDepth: 3,
        useZeroWindow: false,
      });

      const config = customPVS.getConfig();
      expect(config.minDepth).toBe(3);
      expect(config.useZeroWindow).toBe(false);
    });

    it('should update configuration', () => {
      pvs.updateConfig({ minDepth: 4 });
      expect(pvs.getConfig().minDepth).toBe(4);
    });
  });

  describe('Should Use PVS', () => {
    it('should use PVS at sufficient depth', () => {
      expect(pvs.shouldUsePVS(5)).toBe(true);
    });

    it('should not use PVS at shallow depth', () => {
      expect(pvs.shouldUsePVS(1)).toBe(false);
    });

    it('should not use PVS when disabled', () => {
      pvs.updateConfig({ enabled: false });
      expect(pvs.shouldUsePVS(5)).toBe(false);
    });

    it('should use PVS at exact minimum depth', () => {
      expect(pvs.shouldUsePVS(2)).toBe(true);
    });
  });

  describe('Search Window', () => {
    const alpha = 100;
    const beta = 200;

    it('should give full window to first move', () => {
      const window = pvs.getSearchWindow(alpha, beta, true, true);
      
      expect(window.searchAlpha).toBe(alpha);
      expect(window.searchBeta).toBe(beta);
      expect(window.isZeroWindow).toBe(false);
    });

    it('should give zero window to non-first PV move', () => {
      const window = pvs.getSearchWindow(alpha, beta, true, false);
      
      expect(window.searchAlpha).toBe(alpha);
      expect(window.searchBeta).toBe(alpha + 1);
      expect(window.isZeroWindow).toBe(true);
    });

    it('should give full window to non-PV node', () => {
      const window = pvs.getSearchWindow(alpha, beta, false, false);
      
      expect(window.searchAlpha).toBe(alpha);
      expect(window.searchBeta).toBe(beta);
      expect(window.isZeroWindow).toBe(false);
    });

    it('should not use zero window when disabled', () => {
      pvs.updateConfig({ useZeroWindow: false });
      const window = pvs.getSearchWindow(alpha, beta, true, false);
      
      expect(window.searchAlpha).toBe(alpha);
      expect(window.searchBeta).toBe(beta);
      expect(window.isZeroWindow).toBe(false);
    });

    it('should return full window when PVS disabled', () => {
      pvs.updateConfig({ enabled: false });
      const window = pvs.getSearchWindow(alpha, beta, true, false);
      
      expect(window.searchAlpha).toBe(alpha);
      expect(window.searchBeta).toBe(beta);
      expect(window.isZeroWindow).toBe(false);
    });
  });

  describe('Research Detection', () => {
    it('should need research when score beats alpha', () => {
      const alpha = 100;
      const beta = 200;
      const score = 150;

      expect(pvs.needsResearch(score, alpha, beta)).toBe(true);
    });

    it('should not need research when score <= alpha', () => {
      const alpha = 100;
      const beta = 200;
      const score = 90;

      expect(pvs.needsResearch(score, alpha, beta)).toBe(false);
    });

    it('should not need research when score >= beta', () => {
      const alpha = 100;
      const beta = 200;
      const score = 210;

      expect(pvs.needsResearch(score, alpha, beta)).toBe(false);
    });

    it('should not need research at exact alpha', () => {
      const alpha = 100;
      const beta = 200;
      const score = 100;

      expect(pvs.needsResearch(score, alpha, beta)).toBe(false);
    });

    it('should not need research at exact beta', () => {
      const alpha = 100;
      const beta = 200;
      const score = 200;

      expect(pvs.needsResearch(score, alpha, beta)).toBe(false);
    });
  });

  describe('Node Type Recording', () => {
    const alpha = 100;
    const beta = 200;

    it('should record Cut node on beta cutoff', () => {
      const nodeType = pvs.recordNodeType(220, alpha, beta, false);
      expect(nodeType).toBe(NodeType.Cut);
    });

    it('should record PV node when score improves alpha', () => {
      const nodeType = pvs.recordNodeType(150, alpha, beta, true);
      expect(nodeType).toBe(NodeType.PV);
    });

    it('should record All node when score <= alpha', () => {
      const nodeType = pvs.recordNodeType(90, alpha, beta, false);
      expect(nodeType).toBe(NodeType.All);
    });

    it('should record Cut node at exact beta', () => {
      const nodeType = pvs.recordNodeType(200, alpha, beta, false);
      expect(nodeType).toBe(NodeType.Cut);
    });

    it('should record All node at exact alpha', () => {
      const nodeType = pvs.recordNodeType(100, alpha, beta, false);
      expect(nodeType).toBe(NodeType.All);
    });
  });

  describe('PV Node Detection', () => {
    it('should identify first child of PV as PV', () => {
      expect(pvs.isExpectedPVNode(true, true)).toBe(true);
    });

    it('should not identify later child of PV as PV', () => {
      expect(pvs.isExpectedPVNode(true, false)).toBe(false);
    });

    it('should not identify child of non-PV as PV', () => {
      expect(pvs.isExpectedPVNode(false, true)).toBe(false);
      expect(pvs.isExpectedPVNode(false, false)).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should track PV nodes', () => {
      pvs.recordNodeType(150, 100, 200, true);
      pvs.recordNodeType(160, 100, 200, true);

      const stats = pvs.getStatistics();
      expect(stats.pvNodes).toBe(2);
    });

    it('should track All nodes', () => {
      pvs.recordNodeType(90, 100, 200, false);
      pvs.recordNodeType(80, 100, 200, false);

      const stats = pvs.getStatistics();
      expect(stats.allNodes).toBe(2);
    });

    it('should track Cut nodes', () => {
      pvs.recordNodeType(220, 100, 200, false);
      pvs.recordNodeType(230, 100, 200, false);

      const stats = pvs.getStatistics();
      expect(stats.cutNodes).toBe(2);
    });

    it('should track zero window searches', () => {
      pvs.getSearchWindow(100, 200, true, false);
      pvs.getSearchWindow(100, 200, true, false);

      const stats = pvs.getStatistics();
      expect(stats.zeroWindowSearches).toBe(2);
    });

    it('should track researches', () => {
      pvs.needsResearch(150, 100, 200);
      pvs.needsResearch(160, 100, 200);

      const stats = pvs.getStatistics();
      expect(stats.zeroWindowResearches).toBe(2);
    });

    it('should calculate research rate', () => {
      pvs.getSearchWindow(100, 200, true, false);
      pvs.getSearchWindow(100, 200, true, false);
      pvs.needsResearch(150, 100, 200);

      const stats = pvs.getStatistics();
      expect(stats.researchRate).toBe(0.5);
    });

    it('should handle zero searches', () => {
      const stats = pvs.getStatistics();
      expect(stats.researchRate).toBe(0);
    });

    it('should clear statistics', () => {
      pvs.recordNodeType(220, 100, 200, false);
      pvs.getSearchWindow(100, 200, true, false);
      pvs.needsResearch(150, 100, 200);

      pvs.clearStatistics();

      const stats = pvs.getStatistics();
      expect(stats.pvNodes).toBe(0);
      expect(stats.allNodes).toBe(0);
      expect(stats.cutNodes).toBe(0);
      expect(stats.zeroWindowSearches).toBe(0);
      expect(stats.zeroWindowResearches).toBe(0);
    });
  });

  describe('Node Distribution', () => {
    it('should return expected distribution', () => {
      const expected = pvs.getExpectedDistribution();
      
      expect(expected.cut).toBeCloseTo(0.85, 2);
      expect(expected.all).toBeCloseTo(0.1, 2);
      expect(expected.pv).toBeCloseTo(0.05, 2);
    });

    it('should calculate actual distribution', () => {
      pvs.recordNodeType(220, 100, 200, false); // Cut
      pvs.recordNodeType(90, 100, 200, false);  // All
      pvs.recordNodeType(150, 100, 200, true);  // PV
      pvs.recordNodeType(230, 100, 200, false); // Cut

      const actual = pvs.getActualDistribution();
      
      expect(actual.cut).toBeCloseTo(0.5, 2);
      expect(actual.all).toBeCloseTo(0.25, 2);
      expect(actual.pv).toBeCloseTo(0.25, 2);
    });

    it('should handle empty distribution', () => {
      const actual = pvs.getActualDistribution();
      
      expect(actual.cut).toBe(0);
      expect(actual.all).toBe(0);
      expect(actual.pv).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative scores', () => {
      const nodeType = pvs.recordNodeType(-100, -200, 0, false);
      expect(nodeType).toBe(NodeType.PV);
    });

    it('should handle large score values', () => {
      const nodeType = pvs.recordNodeType(10000, 100, 200, false);
      expect(nodeType).toBe(NodeType.Cut);
    });

    it('should handle very narrow window', () => {
      const window = pvs.getSearchWindow(100, 101, true, false);
      
      expect(window.searchAlpha).toBe(100);
      expect(window.searchBeta).toBe(101);
    });

    it('should handle identical alpha and beta', () => {
      const window = pvs.getSearchWindow(100, 100, false, true);
      
      expect(window.searchAlpha).toBe(100);
      expect(window.searchBeta).toBe(100);
    });

    it('should handle many consecutive researches', () => {
      for (let i = 0; i < 100; i++) {
        pvs.getSearchWindow(100, 200, true, false);
        pvs.needsResearch(150, 100, 200);
      }

      const stats = pvs.getStatistics();
      expect(stats.zeroWindowSearches).toBe(100);
      expect(stats.zeroWindowResearches).toBe(100);
      expect(stats.researchRate).toBe(1.0);
    });
  });

  describe('Configuration Variations', () => {
    it('should work with different minimum depth', () => {
      const customPVS = new PrincipalVariationSearch({ minDepth: 4 });

      expect(customPVS.shouldUsePVS(3)).toBe(false);
      expect(customPVS.shouldUsePVS(4)).toBe(true);
    });

    it('should work without zero windows', () => {
      const noZeroPVS = new PrincipalVariationSearch({ useZeroWindow: false });
      const window = noZeroPVS.getSearchWindow(100, 200, true, false);

      expect(window.isZeroWindow).toBe(false);
      expect(window.searchBeta).toBe(200);
    });

    it('should work when completely disabled', () => {
      const disabledPVS = new PrincipalVariationSearch({ enabled: false });

      expect(disabledPVS.shouldUsePVS(10)).toBe(false);
      
      const window = disabledPVS.getSearchWindow(100, 200, true, false);
      expect(window.isZeroWindow).toBe(false);
    });
  });
});
