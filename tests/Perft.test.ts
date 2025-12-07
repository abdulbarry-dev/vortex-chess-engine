/**
 * @file Perft.test.ts
 * @description Perft tests for move generation validation
 * 
 * Perft (Performance Test) validates move generation by counting
 * all possible moves to a given depth and comparing against known values.
 */

import { describe, expect, it } from 'vitest';
import * as Positions from '../src/constants/Positions';
import { parseFen } from '../src/utils/FenParser';
import { PerftTester } from '../src/utils/PerftTester';

describe('Perft Tests', () => {
  const perft = new PerftTester();

  describe('Starting Position', () => {
    it('perft(1) should return 20', () => {
      const { board, state } = parseFen(Positions.STARTING_FEN);
      const nodes = perft.perft(board, state, 1);
      expect(nodes).toBe(20);
    });

    it('perft(2) should return 400', () => {
      const { board, state } = parseFen(Positions.STARTING_FEN);
      const nodes = perft.perft(board, state, 2);
      expect(nodes).toBe(400);
    });

    it('perft(3) should return 8902', () => {
      const { board, state } = parseFen(Positions.STARTING_FEN);
      const nodes = perft.perft(board, state, 3);
      expect(nodes).toBe(8902);
    });

    // Depth 4 is slower but still reasonable for testing
    it('perft(4) should return 197281', { timeout: 10000 }, () => {
      const { board, state } = parseFen(Positions.STARTING_FEN);
      const nodes = perft.perft(board, state, 4);
      expect(nodes).toBe(197281);
    });
  });

  describe('Kiwipete Position', () => {
    // Kiwipete is a famous perft test position with many special moves
    // FEN: r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1

    it('perft(1) should return 48', () => {
      const { board, state } = parseFen(Positions.KIWIPETE);
      const nodes = perft.perft(board, state, 1);
      expect(nodes).toBe(48);
    });

    it('perft(2) should return 2039', () => {
      const { board, state } = parseFen(Positions.KIWIPETE);
      const nodes = perft.perft(board, state, 2);
      expect(nodes).toBe(2039);
    });

    it('perft(3) should return 97862', { timeout: 15000 }, () => {
      const { board, state } = parseFen(Positions.KIWIPETE);
      const nodes = perft.perft(board, state, 3);
      expect(nodes).toBe(97862);
    });
  });

  describe('Perft Position 3', () => {
    // FEN: 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1

    it('perft(1) should return 14', () => {
      const { board, state } = parseFen(Positions.PERFT_POSITION_3);
      const nodes = perft.perft(board, state, 1);
      expect(nodes).toBe(14);
    });

    it('perft(2) should return 191', () => {
      const { board, state } = parseFen(Positions.PERFT_POSITION_3);
      const nodes = perft.perft(board, state, 2);
      expect(nodes).toBe(191);
    });

    it('perft(3) should return 2812', () => {
      const { board, state } = parseFen(Positions.PERFT_POSITION_3);
      const nodes = perft.perft(board, state, 3);
      expect(nodes).toBe(2812);
    });
  });

  describe('Perft Position 4', () => {
    // FEN: r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1
    // This position has many promotions and special moves

    it('perft(1) should return 6', () => {
      const { board, state } = parseFen(Positions.PERFT_POSITION_4);
      const nodes = perft.perft(board, state, 1);
      expect(nodes).toBe(6);
    });

    it('perft(2) should return 264', () => {
      const { board, state } = parseFen(Positions.PERFT_POSITION_4);
      const nodes = perft.perft(board, state, 2);
      expect(nodes).toBe(264);
    });

    it('perft(3) should return 9467', { timeout: 10000 }, () => {
      const { board, state } = parseFen(Positions.PERFT_POSITION_4);
      const nodes = perft.perft(board, state, 3);
      expect(nodes).toBe(9467);
    });
  });

  describe('Perft Position 5', () => {
    // FEN: rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8

    it('perft(1) should return 44', () => {
      const { board, state } = parseFen(Positions.PERFT_POSITION_5);
      const nodes = perft.perft(board, state, 1);
      expect(nodes).toBe(44);
    });

    it('perft(2) should return 1486', () => {
      const { board, state } = parseFen(Positions.PERFT_POSITION_5);
      const nodes = perft.perft(board, state, 2);
      expect(nodes).toBe(1486);
    });

    it('perft(3) should return 62379', { timeout: 15000 }, () => {
      const { board, state } = parseFen(Positions.PERFT_POSITION_5);
      const nodes = perft.perft(board, state, 3);
      expect(nodes).toBe(62379);
    });
  });

  describe('Divide function', () => {
    it('should provide move breakdown', () => {
      const { board, state } = parseFen(Positions.STARTING_FEN);
      const divideResult = perft.divide(board, state, 1);
      
      // Starting position has 20 moves
      expect(divideResult.size).toBe(20);
      
      // Each move at depth 1 should have 1 node
      for (const [_, nodes] of divideResult) {
        expect(nodes).toBe(1);
      }
    });
  });
});
