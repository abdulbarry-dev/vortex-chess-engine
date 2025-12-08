/**
 * @file MultiPV.test.ts
 * @description Tests for Multi-PV support
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Color, PieceType } from "../src/core/Piece";
import { MultiPV } from '../src/search/MultiPV';
import { Move, MoveFlags } from '../src/types/Move.types';

describe('MultiPV', () => {
  let multiPV: MultiPV;

  beforeEach(() => {
    multiPV = new MultiPV();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const config = multiPV.getConfig();
      expect(config.numPV).toBe(1);
      expect(config.maxPV).toBe(10);
    });

    it('should initialize with custom config', () => {
      const mpv = new MultiPV({ numPV: 3, maxPV: 5 });
      const config = mpv.getConfig();
      expect(config.numPV).toBe(3);
      expect(config.maxPV).toBe(5);
    });

    it('should start with no variations', () => {
      const variations = multiPV.getVariations();
      expect(variations).toHaveLength(0);
    });

    it('should not be in Multi-PV mode by default', () => {
      expect(multiPV.isMultiPVMode()).toBe(false);
    });
  });

  describe('Adding Variations', () => {
    it('should add a variation', () => {
      const pv = [createMove(12, 28), createMove(52, 36)];

      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv,
        nodes: 100000,
        time: 1000,
      });

      expect(multiPV.getVariations()).toHaveLength(1);
    });

    it('should assign index to variation', () => {
      const pv = [createMove(12, 28)];

      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv,
        nodes: 100000,
        time: 1000,
      });

      const variation = multiPV.getBestVariation();
      expect(variation?.index).toBe(1);
    });

    it('should generate PV string', () => {
      const pv = [createMove(12, 28), createMove(52, 36)];

      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv,
        nodes: 100000,
        time: 1000,
      });

      const variation = multiPV.getBestVariation();
      expect(variation?.pvString).toBeTruthy();
      expect(variation?.pvString.length).toBeGreaterThan(0);
    });

    it('should sort variations by score', () => {
      multiPV.setNumPV(3);

      multiPV.addVariation({
        score: 30,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(12, 28)],
        nodes: 100000,
        time: 1000,
      });

      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(13, 29)],
        nodes: 100000,
        time: 1000,
      });

      multiPV.addVariation({
        score: 40,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(14, 30)],
        nodes: 100000,
        time: 1000,
      });

      const variations = multiPV.getVariations();
      expect(variations[0].score).toBe(50); // Best
      expect(variations[1].score).toBe(40);
      expect(variations[2].score).toBe(30); // Worst
    });

    it('should re-index after sorting', () => {
      multiPV.setNumPV(3);

      multiPV.addVariation({
        score: 30,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(12, 28)],
        nodes: 100000,
        time: 1000,
      });

      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(13, 29)],
        nodes: 100000,
        time: 1000,
      });

      const variations = multiPV.getVariations();
      expect(variations[0].index).toBe(1); // Best gets index 1
      expect(variations[1].index).toBe(2);
    });

    it('should trim variations exceeding numPV', () => {
      multiPV.setNumPV(2);

      multiPV.addVariation({
        score: 30,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(12, 28)],
        nodes: 100000,
        time: 1000,
      });

      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(13, 29)],
        nodes: 100000,
        time: 1000,
      });

      multiPV.addVariation({
        score: 40,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(14, 30)],
        nodes: 100000,
        time: 1000,
      });

      expect(multiPV.getVariations()).toHaveLength(2); // Only top 2
    });

    it('should add first move to excluded list', () => {
      const move = createMove(12, 28);
      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [move],
        nodes: 100000,
        time: 1000,
      });

      expect(multiPV.isExcluded(move)).toBe(true);
    });
  });

  describe('Updating Variations', () => {
    beforeEach(() => {
      multiPV.setNumPV(3);
      multiPV.addVariation({
        score: 30,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(12, 28)],
        nodes: 100000,
        time: 1000,
      });
    });

    it('should update variation score', () => {
      multiPV.updateVariation(1, { score: 100 });
      const variation = multiPV.getVariation(1);
      expect(variation?.score).toBe(100);
    });

    it('should update variation PV', () => {
      const newPV = [createMove(13, 29), createMove(52, 36)];
      multiPV.updateVariation(1, { pv: newPV });

      const variation = multiPV.getVariation(1);
      expect(variation?.pv).toEqual(newPV);
    });

    it('should regenerate PV string on update', () => {
      const newPV = [createMove(13, 29)];
      const oldPVString = multiPV.getVariation(1)?.pvString;

      multiPV.updateVariation(1, { pv: newPV });
      const newPVString = multiPV.getVariation(1)?.pvString;

      expect(newPVString).not.toBe(oldPVString);
    });

    it('should re-sort after score update', () => {
      // Add second variation with better score
      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(13, 29)],
        nodes: 100000,
        time: 1000,
      });

      // After adding, order should be: [50, 30]
      expect(multiPV.getVariations()[0].score).toBe(50);
      expect(multiPV.getVariations()[1].score).toBe(30);

      // Update second variation (index 2) to be best
      multiPV.updateVariation(2, { score: 60 });

      const variations = multiPV.getVariations();
      expect(variations[0].score).toBe(60); // Now best
      expect(variations[1].score).toBe(50); // Was best, now second
    });
  });

  describe('Retrieving Variations', () => {
    beforeEach(() => {
      multiPV.setNumPV(3);
      multiPV.addVariation({
        score: 30,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(12, 28)],
        nodes: 100000,
        time: 1000,
      });
      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(13, 29)],
        nodes: 100000,
        time: 1000,
      });
    });

    it('should get all variations', () => {
      const variations = multiPV.getVariations();
      expect(variations).toHaveLength(2);
    });

    it('should get specific variation', () => {
      const variation = multiPV.getVariation(1);
      expect(variation).toBeDefined();
      expect(variation?.score).toBe(50); // Best
    });

    it('should get best variation', () => {
      const best = multiPV.getBestVariation();
      expect(best?.score).toBe(50);
    });

    it('should return undefined for non-existent variation', () => {
      const variation = multiPV.getVariation(10);
      expect(variation).toBeUndefined();
    });
  });

  describe('Excluded Moves', () => {
    it('should track excluded moves', () => {
      const move1 = createMove(12, 28);
      const move2 = createMove(13, 29);

      multiPV.setNumPV(2);
      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [move1],
        nodes: 100000,
        time: 1000,
      });

      multiPV.addVariation({
        score: 40,
        depth: 10,
        selectiveDepth: 15,
        pv: [move2],
        nodes: 100000,
        time: 1000,
      });

      expect(multiPV.isExcluded(move1)).toBe(true);
      expect(multiPV.isExcluded(move2)).toBe(true);
    });

    it('should get excluded moves set', () => {
      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(12, 28)],
        nodes: 100000,
        time: 1000,
      });

      const excluded = multiPV.getExcludedMoves();
      expect(excluded.size).toBeGreaterThan(0);
    });

    it('should not exclude moves from empty PV', () => {
      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [],
        nodes: 100000,
        time: 1000,
      });

      const excluded = multiPV.getExcludedMoves();
      expect(excluded.size).toBe(0);
    });
  });

  describe('Multi-PV Mode', () => {
    it('should detect Multi-PV mode', () => {
      multiPV.setNumPV(3);
      expect(multiPV.isMultiPVMode()).toBe(true);
    });

    it('should not be in Multi-PV mode with numPV=1', () => {
      multiPV.setNumPV(1);
      expect(multiPV.isMultiPVMode()).toBe(false);
    });

    it('should check if another iteration needed', () => {
      multiPV.setNumPV(3);
      expect(multiPV.needsAnotherIteration()).toBe(true);

      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(12, 28)],
        nodes: 100000,
        time: 1000,
      });

      expect(multiPV.needsAnotherIteration()).toBe(true); // Need 2 more

      multiPV.addVariation({
        score: 40,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(13, 29)],
        nodes: 100000,
        time: 1000,
      });

      multiPV.addVariation({
        score: 30,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(14, 30)],
        nodes: 100000,
        time: 1000,
      });

      expect(multiPV.needsAnotherIteration()).toBe(false); // Done
    });

    it('should get current iteration', () => {
      multiPV.setNumPV(3);
      expect(multiPV.getCurrentIteration()).toBe(1);

      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(12, 28)],
        nodes: 100000,
        time: 1000,
      });

      expect(multiPV.getCurrentIteration()).toBe(2);
    });
  });

  describe('Configuration', () => {
    it('should get number of PVs', () => {
      expect(multiPV.getNumPV()).toBe(1);
    });

    it('should set number of PVs', () => {
      multiPV.setNumPV(5);
      expect(multiPV.getNumPV()).toBe(5);
    });

    it('should clamp numPV to maxPV', () => {
      multiPV.setNumPV(20); // Exceeds maxPV (10)
      expect(multiPV.getNumPV()).toBe(10);
    });

    it('should clamp numPV to minimum 1', () => {
      multiPV.setNumPV(0);
      expect(multiPV.getNumPV()).toBe(1);
    });

    it('should trim variations when reducing numPV', () => {
      multiPV.setNumPV(3);

      for (let i = 0; i < 3; i++) {
        multiPV.addVariation({
          score: 50 - i * 10,
          depth: 10,
          selectiveDepth: 15,
          pv: [createMove(12 + i, 28 + i)],
          nodes: 100000,
          time: 1000,
        });
      }

      multiPV.setNumPV(2);
      expect(multiPV.getVariations()).toHaveLength(2);
    });

    it('should update config', () => {
      multiPV.updateConfig({ numPV: 4, maxPV: 8 });
      const config = multiPV.getConfig();
      expect(config.numPV).toBe(4);
      expect(config.maxPV).toBe(8);
    });

    it('should clamp numPV when updating config', () => {
      multiPV.updateConfig({ numPV: 20, maxPV: 5 });
      expect(multiPV.getNumPV()).toBe(5); // Clamped to maxPV
    });
  });

  describe('Formatting', () => {
    beforeEach(() => {
      multiPV.setNumPV(2);
      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(12, 28)],
        nodes: 100000,
        time: 1000,
      });
    });

    it('should format UCI output', () => {
      const uci = multiPV.formatUCI();
      expect(uci).toHaveLength(1);
      expect(uci[0]).toContain('info');
      expect(uci[0]).toContain('multipv 1');
      expect(uci[0]).toContain('score cp 50');
    });

    it('should format display output', () => {
      const display = multiPV.formatDisplay();
      expect(display).toContain('Principal Variations');
      expect(display).toContain('0.50'); // Score in pawns
    });

    it('should handle empty variations in display', () => {
      multiPV.clear();
      const display = multiPV.formatDisplay();
      expect(display).toContain('No variations');
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      multiPV.setNumPV(2);
      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(12, 28)],
        nodes: 100000,
        time: 1000,
      });
      multiPV.addVariation({
        score: 30,
        depth: 12,
        selectiveDepth: 17,
        pv: [createMove(13, 29)],
        nodes: 150000,
        time: 1500,
      });
    });

    it('should count variations', () => {
      const stats = multiPV.getStatistics();
      expect(stats.numVariations).toBe(2);
    });

    it('should sum total nodes', () => {
      const stats = multiPV.getStatistics();
      expect(stats.totalNodes).toBe(250000);
    });

    it('should calculate average depth', () => {
      const stats = multiPV.getStatistics();
      expect(stats.avgDepth).toBe(11); // (10+12)/2
    });

    it('should calculate score spread', () => {
      const stats = multiPV.getStatistics();
      expect(stats.scoreSpread).toBe(20); // 50-30
    });

    it('should handle empty variations in stats', () => {
      multiPV.clear();
      const stats = multiPV.getStatistics();
      expect(stats.numVariations).toBe(0);
      expect(stats.totalNodes).toBe(0);
      expect(stats.avgDepth).toBe(0);
      expect(stats.scoreSpread).toBe(0);
    });
  });

  describe('Import/Export', () => {
    beforeEach(() => {
      multiPV.setNumPV(2);
      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(12, 28)],
        nodes: 100000,
        time: 1000,
      });
    });

    it('should export variations', () => {
      const exported = multiPV.export();
      expect(exported).toHaveLength(1);
      expect(exported[0].score).toBe(50);
    });

    it('should import variations', () => {
      const exported = multiPV.export();
      const newMultiPV = new MultiPV({ numPV: 2 });
      newMultiPV.import(exported);

      expect(newMultiPV.getVariations()).toHaveLength(1);
      expect(newMultiPV.getBestVariation()?.score).toBe(50);
    });

    it('should preserve data through export/import', () => {
      const exported = multiPV.export();
      const newMultiPV = new MultiPV({ numPV: 2 });
      newMultiPV.import(exported);

      const original = multiPV.getBestVariation();
      const imported = newMultiPV.getBestVariation();

      expect(imported?.score).toBe(original?.score);
      expect(imported?.depth).toBe(original?.depth);
      expect(imported?.nodes).toBe(original?.nodes);
    });

    it('should rebuild excluded moves on import', () => {
      const move = createMove(12, 28);
      const exported = multiPV.export();

      const newMultiPV = new MultiPV({ numPV: 2 });
      newMultiPV.import(exported);

      expect(newMultiPV.isExcluded(move)).toBe(true);
    });
  });

  describe('Clearing', () => {
    beforeEach(() => {
      multiPV.setNumPV(2);
      multiPV.addVariation({
        score: 50,
        depth: 10,
        selectiveDepth: 15,
        pv: [createMove(12, 28)],
        nodes: 100000,
        time: 1000,
      });
    });

    it('should clear all variations', () => {
      multiPV.clear();
      expect(multiPV.getVariations()).toHaveLength(0);
    });

    it('should clear excluded moves', () => {
      const move = createMove(12, 28);
      multiPV.clear();
      expect(multiPV.isExcluded(move)).toBe(false);
    });

    it('should initialize on new search', () => {
      multiPV.initialize();
      expect(multiPV.getVariations()).toHaveLength(0);
      expect(multiPV.getExcludedMoves().size).toBe(0);
    });
  });
});

// Helper function
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
