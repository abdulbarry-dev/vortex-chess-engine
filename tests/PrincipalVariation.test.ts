/**
 * @file PrincipalVariation.test.ts
 * @description Tests for Principal Variation (PV) tracking
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { MoveGenerator } from '../src/move-generation/MoveGenerator';
import { PrincipalVariation } from '../src/search/PrincipalVariation';
import { Move } from '../src/types/Move.types';

describe('PrincipalVariation', () => {
  let pv: PrincipalVariation;
  let board: Board;
  let state: GameState;
  let moveGen: MoveGenerator;
  let testMove: Move;

  beforeEach(() => {
    pv = new PrincipalVariation();
    board = new Board();
    state = new GameState();
    moveGen = new MoveGenerator();
    board.initializeStartingPosition();
    state.reset();

    // Get a sample move for testing
    const moves = moveGen.generateLegalMoves(board, state);
    testMove = moves[0]!;
  });

  describe('Initialization', () => {
    it('should create PV with default max depth', () => {
      expect(pv).toBeDefined();
      expect(pv.getLength()).toBe(0);
    });

    it('should create PV with custom max depth', () => {
      const customPV = new PrincipalVariation(32);
      expect(customPV).toBeDefined();
      expect(customPV.getLength()).toBe(0);
    });

    it('should have no best move initially', () => {
      expect(pv.getBestMove()).toBeNull();
    });

    it('should have empty PV string initially', () => {
      expect(pv.getPVString()).toBe('');
    });
  });

  describe('Update and Storage', () => {
    it('should store move at ply 0', () => {
      pv.update(0, testMove);
      
      const bestMove = pv.getBestMove();
      expect(bestMove).not.toBeNull();
      expect(bestMove?.from).toBe(testMove.from);
      expect(bestMove?.to).toBe(testMove.to);
    });

    it('should update PV length after storing move', () => {
      pv.update(0, testMove);
      expect(pv.getLength()).toBeGreaterThan(0);
    });

    it('should store multiple moves in PV', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      
      pv.update(0, moves[0]!);
      pv.update(1, moves[1]!);
      
      expect(pv.getLength()).toBeGreaterThanOrEqual(1);
    });

    it('should handle deep PV updates', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      
      for (let ply = 0; ply < 5 && ply < moves.length; ply++) {
        pv.update(ply, moves[ply]!);
      }
      
      expect(pv.getLength()).toBeGreaterThan(0);
    });
  });

  describe('PV Retrieval', () => {
    it('should get PV as array', () => {
      pv.update(0, testMove);
      
      const pvArray = pv.getPV();
      expect(Array.isArray(pvArray)).toBe(true);
      expect(pvArray.length).toBeGreaterThan(0);
    });

    it('should get PV as UCI string', () => {
      pv.update(0, testMove);
      
      const pvString = pv.getPVString();
      expect(typeof pvString).toBe('string');
      expect(pvString.length).toBeGreaterThan(0);
    });

    it('should format UCI string correctly', () => {
      pv.update(0, testMove);
      
      const pvString = pv.getPVString();
      // Should match pattern like "e2e4" or "g1f3"
      expect(pvString).toMatch(/^[a-h][1-8][a-h][1-8]/);
    });

    it('should get move at specific index', () => {
      pv.update(0, testMove);
      
      const move = pv.getMoveAt(0);
      expect(move).not.toBeNull();
      expect(move?.from).toBe(testMove.from);
    });

    it('should return null for invalid index', () => {
      pv.update(0, testMove);
      
      expect(pv.getMoveAt(-1)).toBeNull();
      expect(pv.getMoveAt(100)).toBeNull();
    });
  });

  describe('Clear and Reset', () => {
    it('should clear PV at specific ply', () => {
      pv.update(0, testMove);
      pv.clear(0);
      
      expect(pv.getLength()).toBe(0);
    });

    it('should reset entire PV table', () => {
      pv.update(0, testMove);
      pv.reset();
      
      expect(pv.getLength()).toBe(0);
      expect(pv.getBestMove()).toBeNull();
      expect(pv.getPVString()).toBe('');
    });

    it('should allow updates after reset', () => {
      pv.update(0, testMove);
      pv.reset();
      
      const moves = moveGen.generateLegalMoves(board, state);
      pv.update(0, moves[1]!);
      
      expect(pv.getBestMove()).not.toBeNull();
    });
  });

  describe('Validation', () => {
    it('should validate PV at ply 0', () => {
      pv.update(0, testMove);
      expect(pv.isValid(0)).toBe(true);
    });

    it('should not validate empty PV', () => {
      expect(pv.isValid(0)).toBe(false);
    });

    it('should not validate beyond max depth', () => {
      const smallPV = new PrincipalVariation(5);
      expect(smallPV.isValid(10)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle ply beyond max depth', () => {
      const pv = new PrincipalVariation(4);
      
      // Should not crash
      pv.update(100, testMove);
      expect(pv.getLength()).toBe(0);
    });

    it('should handle empty move list', () => {
      const pvArray = pv.getPV();
      expect(pvArray).toEqual([]);
    });

    it('should handle multiple resets', () => {
      pv.update(0, testMove);
      pv.reset();
      pv.reset();
      pv.reset();
      
      expect(pv.getLength()).toBe(0);
    });

    it('should handle rapid updates', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      
      for (let i = 0; i < 10; i++) {
        pv.update(0, moves[i % moves.length]!);
      }
      
      expect(pv.getBestMove()).not.toBeNull();
    });
  });

  describe('PV Propagation', () => {
    it('should propagate PV from deeper plies', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      
      // Simulate search building PV from deeper plies
      pv.update(2, moves[2]!);
      pv.update(1, moves[1]!);
      pv.update(0, moves[0]!);
      
      expect(pv.getLength()).toBeGreaterThan(0);
    });

    it('should maintain PV consistency', () => {
      const moves = moveGen.generateLegalMoves(board, state);
      
      pv.update(0, moves[0]!);
      const firstMove = pv.getBestMove();
      
      pv.update(0, moves[0]!); // Update again with same move
      const secondMove = pv.getBestMove();
      
      expect(firstMove?.from).toBe(secondMove?.from);
      expect(firstMove?.to).toBe(secondMove?.to);
    });
  });

  describe('Multiple PV Instances', () => {
    it('should maintain separate PV tables', () => {
      const pv1 = new PrincipalVariation();
      const pv2 = new PrincipalVariation();
      
      const moves = moveGen.generateLegalMoves(board, state);
      
      pv1.update(0, moves[0]!);
      pv2.update(0, moves[1]!);
      
      const move1 = pv1.getBestMove();
      const move2 = pv2.getBestMove();
      
      // Both should have best moves
      expect(move1).not.toBeNull();
      expect(move2).not.toBeNull();
      
      // They should be different (we used different moves)
      if (move1 && move2 && moves[0] && moves[1]) {
        expect(move1.from !== moves[1].from || move1.to !== moves[1].to).toBe(true);
      }
    });
  });
});
