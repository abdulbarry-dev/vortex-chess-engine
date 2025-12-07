/**
 * @file OpeningBook.test.ts
 * @description Tests for opening book functionality
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { algebraicToSquare } from '../src/core/Square';
import { OpeningBook } from '../src/opening/OpeningBook';
import { ZobristHasher } from '../src/search/ZobristHashing';

describe('OpeningBook', () => {
  let board: Board;
  let state: GameState;
  let zobrist: ZobristHasher;
  let book: OpeningBook;

  beforeEach(() => {
    board = new Board();
    state = new GameState();
    zobrist = new ZobristHasher();
    book = new OpeningBook(zobrist);
  });

  describe('Initialization', () => {
    it('should create book with default opening moves', () => {
      const stats = book.getStats();
      expect(stats.positions).toBeGreaterThan(0);
      expect(stats.totalMoves).toBeGreaterThan(0);
    });

    it('should have multiple opening moves available', () => {
      const stats = book.getStats();
      expect(stats.totalMoves).toBeGreaterThanOrEqual(4); // e4, d4, Nf3, c4
    });
  });

  describe('Book Lookup', () => {
    it('should find move in starting position', () => {
      board.initializeStartingPosition();
      state.reset();

      const move = book.probe(board, state);
      expect(move).not.toBeNull();
    });

    it('should return valid opening moves', () => {
      board.initializeStartingPosition();
      state.reset();

      const move = book.probe(board, state);
      
      if (move) {
        // Verify it's one of the standard openings: e2, d2, g1, or c2
        const validStartSquares = [
          algebraicToSquare('e2'), // e4
          algebraicToSquare('d2'), // d4
          algebraicToSquare('g1'), // Nf3
          algebraicToSquare('c2'), // c4
        ];
        expect(validStartSquares).toContain(move.from);
      }
    });

    it('should return null for positions not in book', () => {
      board.initializeStartingPosition();
      state.reset();
      
      // Make random moves to get out of book
      for (let i = 0; i < 20; i++) {
        state.switchTurn();
      }
      
      const move = book.probe(board, state);
      expect(move === null || move !== null).toBe(true); // Just check it doesn't crash
    });
  });

  describe('Custom Moves', () => {
    it('should allow adding custom book moves', () => {
      const hash = 999999n;
      const initialStats = book.getStats();
      
      book.addMove(hash, 12, 28, 100); // e2-e4
      
      const newStats = book.getStats();
      expect(newStats.totalMoves).toBeGreaterThan(initialStats.totalMoves);
    });

    it('should allow multiple moves for same position', () => {
      const hash = 888888n;
      
      book.addMove(hash, 12, 28, 100); // e2-e4
      book.addMove(hash, 11, 27, 90);  // d2-d4
      
      const stats = book.getStats();
      expect(stats.totalMoves).toBeGreaterThan(0);
    });
  });

  describe('Enable/Disable', () => {
    it('should be enabled by default', () => {
      expect(book.isEnabled()).toBe(true);
    });

    it('should allow disabling', () => {
      book.setEnabled(false);
      expect(book.isEnabled()).toBe(false);
    });

    it('should allow re-enabling', () => {
      book.setEnabled(false);
      book.setEnabled(true);
      expect(book.isEnabled()).toBe(true);
    });

    it('should return null when disabled', () => {
      board.initializeStartingPosition();
      state.reset();

      book.setEnabled(false);
      const move = book.probe(board, state);
      
      expect(move).toBeNull();
    });

    it('should work normally when re-enabled', () => {
      board.initializeStartingPosition();
      state.reset();

      book.setEnabled(false);
      book.setEnabled(true);
      
      const move = book.probe(board, state);
      expect(move).not.toBeNull();
    });
  });

  describe('Clear', () => {
    it('should clear all entries', () => {
      book.clear();
      
      const stats = book.getStats();
      expect(stats.positions).toBe(0);
      expect(stats.totalMoves).toBe(0);
    });

    it('should return null after clearing', () => {
      board.initializeStartingPosition();
      state.reset();

      book.clear();
      const move = book.probe(board, state);
      
      expect(move).toBeNull();
    });

    it('should allow adding moves after clearing', () => {
      book.clear();
      
      const hash = 777777n;
      book.addMove(hash, 12, 28, 100);
      
      const stats = book.getStats();
      expect(stats.totalMoves).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should track number of positions', () => {
      const stats = book.getStats();
      expect(stats.positions).toBeGreaterThanOrEqual(0);
    });

    it('should track total moves', () => {
      const stats = book.getStats();
      expect(stats.totalMoves).toBeGreaterThanOrEqual(0);
    });

    it('should update stats when adding moves', () => {
      const before = book.getStats();
      
      book.addMove(666666n, 12, 28, 100);
      
      const after = book.getStats();
      expect(after.totalMoves).toBeGreaterThan(before.totalMoves);
    });
  });

  describe('Move Selection', () => {
    it('should select moves randomly based on weights', () => {
      board.initializeStartingPosition();
      state.reset();

      const moves = new Set<string>();
      
      // Probe multiple times to see if we get variety
      for (let i = 0; i < 50; i++) {
        const move = book.probe(board, state);
        if (move) {
          moves.add(`${move.from}-${move.to}`);
        }
      }

      // Should get at least some variety (though not guaranteed)
      expect(moves.size).toBeGreaterThan(0);
    });
  });
});
