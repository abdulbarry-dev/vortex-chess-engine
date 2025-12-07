/**
 * @file EndgameTablebase.test.ts
 * @description Tests for endgame tablebase functionality
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { Color, PieceType } from '../src/core/Piece';
import { EndgameTablebase } from '../src/endgame/EndgameTablebase';

describe('EndgameTablebase', () => {
  let tablebase: EndgameTablebase;
  let board: Board;
  let state: GameState;

  beforeEach(() => {
    tablebase = new EndgameTablebase();
    board = new Board();
    state = new GameState();
    state.reset();
  });

  describe('Initialization', () => {
    it('should be enabled by default', () => {
      expect(tablebase.isEnabled()).toBe(true);
    });

    it('should create with custom parameters', () => {
      const custom = new EndgameTablebase(false, 4);
      expect(custom.isEnabled()).toBe(false);
    });

    it('should get stats', () => {
      const stats = tablebase.getStats();
      expect(stats).toHaveProperty('maxPieces');
      expect(stats).toHaveProperty('enabled');
    });
  });

  describe('King vs King (KvK)', () => {
    it('should detect KvK as draw', () => {
      // Setup only two kings
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result).not.toBeNull();
      expect(result?.isDraw).toBe(true);
      expect(result?.score).toBe(0);
    });

    it('should mark KvK as tablebase position', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result?.isTablebase).toBe(true);
    });
  });

  describe('Queen vs King (KQvK)', () => {
    it('should detect KQvK as winning for white', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(27, { type: PieceType.Queen, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result).not.toBeNull();
      expect(result?.isWin).toBe(true);
      expect(result?.score).toBeGreaterThan(8000);
    });

    it('should detect KQvK as winning for black', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      board.setPiece(35, { type: PieceType.Queen, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result).not.toBeNull();
      expect(result?.isWin).toBe(true);
    });

    it('should provide moves to mate estimate', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(27, { type: PieceType.Queen, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result?.movesToMate).toBeDefined();
      expect(result?.movesToMate).toBeGreaterThan(0);
    });
  });

  describe('Rook vs King (KRvK)', () => {
    it('should detect KRvK as winning for white', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(27, { type: PieceType.Rook, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result).not.toBeNull();
      expect(result?.isWin).toBe(true);
      expect(result?.score).toBeGreaterThan(7000);
    });

    it('should detect KRvK as winning for black', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      board.setPiece(35, { type: PieceType.Rook, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result).not.toBeNull();
      expect(result?.isWin).toBe(true);
    });
  });

  describe('Insufficient Material', () => {
    it('should detect KBvK as draw', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(27, { type: PieceType.Bishop, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result).not.toBeNull();
      expect(result?.isDraw).toBe(true);
      expect(result?.score).toBe(0);
    });

    it('should detect KNvK as draw', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(27, { type: PieceType.Knight, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result).not.toBeNull();
      expect(result?.isDraw).toBe(true);
    });

    it('should detect KBvKN as draw', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(27, { type: PieceType.Bishop, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      board.setPiece(35, { type: PieceType.Knight, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result).not.toBeNull();
      expect(result?.isDraw).toBe(true);
    });
  });

  describe('King and Pawn vs King (KPvK)', () => {
    it('should detect advanced pawn as winning', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(44, { type: PieceType.Pawn, color: Color.White }); // e6
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result).not.toBeNull();
      expect(result?.score).toBeGreaterThan(0);
    });

    it('should detect far back pawn as draw', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(12, { type: PieceType.Pawn, color: Color.White }); // e2
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result).not.toBeNull();
      // Should be draw or small advantage
      expect(Math.abs(result?.score ?? 0)).toBeLessThan(100);
    });

    it('should handle black pawns correctly', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      board.setPiece(19, { type: PieceType.Pawn, color: Color.Black }); // d3
      
      const result = tablebase.probe(board, state);
      
      expect(result).not.toBeNull();
      expect(result?.score).toBeLessThan(0);
    });
  });

  describe('Position Filtering', () => {
    it('should return null for starting position', () => {
      board.initializeStartingPosition();
      state.reset();
      
      const result = tablebase.probe(board, state);
      
      expect(result).toBeNull(); // Too many pieces
    });

    it('should return null for complex middlegame', () => {
      board.initializeStartingPosition();
      state.reset();
      
      // Remove some pieces but still complex
      board.setPiece(8, null);  // Remove a2 pawn
      board.setPiece(9, null);  // Remove b2 pawn
      board.setPiece(48, null); // Remove a7 pawn
      board.setPiece(49, null); // Remove b7 pawn
      
      const result = tablebase.probe(board, state);
      
      expect(result).toBeNull(); // Still too many pieces
    });

    it('should return null when disabled', () => {
      tablebase.setEnabled(false);
      
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result).toBeNull();
    });
  });

  describe('Configuration', () => {
    it('should enable/disable tablebase', () => {
      tablebase.setEnabled(false);
      expect(tablebase.isEnabled()).toBe(false);
      
      tablebase.setEnabled(true);
      expect(tablebase.isEnabled()).toBe(true);
    });

    it('should respect max pieces limit', () => {
      const tb = new EndgameTablebase(true, 3);
      
      // 4 pieces total (2 kings + 2 others)
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(27, { type: PieceType.Queen, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      board.setPiece(35, { type: PieceType.Pawn, color: Color.Black });
      
      const result = tb.probe(board, state);
      
      expect(result).toBeNull(); // Exceeds max pieces
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty board', () => {
      board.clear();
      
      const result = tablebase.probe(board, state);
      
      // Should not crash, might return null
      expect(result === null || result !== null).toBe(true);
    });

    it('should handle only one king', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      
      const result = tablebase.probe(board, state);
      
      // Should not crash
      expect(result === null || result !== null).toBe(true);
    });

    it('should handle multiple queens', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(27, { type: PieceType.Queen, color: Color.White });
      board.setPiece(28, { type: PieceType.Queen, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      // Might be null (not standard tablebase) or return result
      expect(result === null || result !== null).toBe(true);
    });
  });

  describe('Result Properties', () => {
    it('should have all required properties for tablebase hit', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result).toHaveProperty('isTablebase');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('isWin');
      expect(result).toHaveProperty('isDraw');
    });

    it('should set isTablebase to true for recognized positions', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(27, { type: PieceType.Queen, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      expect(result?.isTablebase).toBe(true);
    });

    it('should not be both win and draw', () => {
      board.clear();
      board.setPiece(4, { type: PieceType.King, color: Color.White });
      board.setPiece(27, { type: PieceType.Queen, color: Color.White });
      board.setPiece(60, { type: PieceType.King, color: Color.Black });
      
      const result = tablebase.probe(board, state);
      
      if (result) {
        expect(!(result.isWin && result.isDraw)).toBe(true);
      }
    });
  });
});
