/**
 * @file BoardDisplay.test.ts
 * @description Tests for BoardDisplay utility
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { Color, PieceType } from '../src/core/Piece';
import {
    boardToCompactString,
    boardToString,
    describePiecePositions,
} from '../src/utils/BoardDisplay';

describe('BoardDisplay', () => {
  let board: Board;

  beforeEach(() => {
    board = new Board();
  });

  describe('boardToString', () => {
    it('should display empty board', () => {
      const display = boardToString(board);
      expect(display).toContain('+---+');
      expect(display).toContain('|   |');
      expect(display).toContain('a   b   c   d   e   f   g   h');
    });

    it('should display starting position', () => {
      board.initializeStartingPosition();
      const display = boardToString(board);
      
      // Check that it contains piece characters
      expect(display).toContain('R');
      expect(display).toContain('N');
      expect(display).toContain('B');
      expect(display).toContain('Q');
      expect(display).toContain('K');
      expect(display).toContain('P');
      expect(display).toContain('r');
      expect(display).toContain('n');
      expect(display).toContain('p');
      
      // Check rank labels
      expect(display).toContain('1');
      expect(display).toContain('8');
    });

    it('should display board without coordinates when requested', () => {
      const display = boardToString(board, false);
      expect(display).not.toContain('a   b   c');
      expect(display).not.toContain('1 |');
    });

    it('should display individual pieces correctly', () => {
      board.setPiece(28, { type: PieceType.Knight, color: Color.White });
      const display = boardToString(board);
      expect(display).toContain('N');
    });
  });

  describe('boardToCompactString', () => {
    it('should display empty board compactly', () => {
      const display = boardToCompactString(board);
      expect(display).toContain('. . . . . . . .');
      expect(display).toContain('a b c d e f g h');
    });

    it('should display starting position compactly', () => {
      board.initializeStartingPosition();
      const display = boardToCompactString(board);
      
      // Check rank 1 (white pieces)
      expect(display).toContain('1 R N B Q K B N R');
      
      // Check rank 2 (white pawns)
      expect(display).toContain('2 P P P P P P P P');
      
      // Check rank 8 (black pieces)
      expect(display).toContain('8 r n b q k b n r');
    });

    it('should show dots for empty squares', () => {
      board.setPiece(28, { type: PieceType.Knight, color: Color.White });
      const display = boardToCompactString(board);
      expect(display).toContain('.');
      expect(display).toContain('N');
    });
  });

  describe('describePiecePositions', () => {
    it('should return empty array for empty board', () => {
      const descriptions = describePiecePositions(board);
      expect(descriptions).toEqual([]);
    });

    it('should describe piece positions in algebraic notation', () => {
      board.setPiece(28, { type: PieceType.Knight, color: Color.White });
      board.setPiece(36, { type: PieceType.Pawn, color: Color.Black });
      
      const descriptions = describePiecePositions(board);
      expect(descriptions).toHaveLength(2);
      expect(descriptions).toContain('N on e4');
      expect(descriptions).toContain('p on e5');
    });

    it('should describe all pieces in starting position', () => {
      board.initializeStartingPosition();
      const descriptions = describePiecePositions(board);
      expect(descriptions).toHaveLength(32);
      
      // Check some specific pieces
      expect(descriptions).toContain('K on e1');
      expect(descriptions).toContain('k on e8');
      expect(descriptions).toContain('Q on d1');
      expect(descriptions).toContain('q on d8');
    });
  });

  describe('Visual output validation', () => {
    it('should produce consistent output for same position', () => {
      board.initializeStartingPosition();
      const display1 = boardToString(board);
      const display2 = boardToString(board);
      expect(display1).toBe(display2);
    });

    it('should show different output for different positions', () => {
      board.initializeStartingPosition();
      const display1 = boardToString(board);
      
      board.setPiece(12, null); // Remove a white pawn
      const display2 = boardToString(board);
      
      expect(display1).not.toBe(display2);
    });

    it('should contain proper number of ranks in display', () => {
      const display = boardToString(board);
      const lines = display.split('\n');
      
      // Should have 8 ranks plus borders and labels
      expect(lines.length).toBeGreaterThan(8);
    });
  });
});
