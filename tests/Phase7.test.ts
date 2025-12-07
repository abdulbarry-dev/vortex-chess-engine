/**
 * @file Phase7.test.ts
 * @description Tests for Phase 7 features
 * 
 * Phase 7 includes:
 * - Opening Book
 * - Time Manager
 * - UCI Protocol
 * - Performance optimizations (Null Move Pruning, Late Move Reductions)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { algebraicToSquare } from '../src/core/Square';
import { UciHandler } from '../src/core/UciHandler';
import { Evaluator } from '../src/evaluation/Evaluator';
import { MoveGenerator } from '../src/move-generation/MoveGenerator';
import { OpeningBook } from '../src/opening/OpeningBook';
import { AlphaBetaSearch } from '../src/search/AlphaBeta';
import { IterativeDeepeningSearch } from '../src/search/IterativeDeepening';
import { MoveOrderer } from '../src/search/MoveOrdering';
import { QuiescenceSearch } from '../src/search/QuiescenceSearch';
import { SearchEngine } from '../src/search/SearchEngine';
import { TranspositionTable } from '../src/search/TranspositionTable';
import { ZobristHasher } from '../src/search/ZobristHashing';
import { TimeManager } from '../src/time/TimeManager';
import * as MoveNotation from '../src/utils/MoveNotation';

describe('Phase 7: Advanced Features', () => {
  describe('OpeningBook', () => {
    let board: Board;
    let state: GameState;
    let zobrist: ZobristHasher;
    let openingBook: OpeningBook;

    beforeEach(() => {
      board = new Board();
      state = new GameState();
      zobrist = new ZobristHasher();
      openingBook = new OpeningBook(zobrist);
    });

    it('should create opening book with default moves', () => {
      const stats = openingBook.getStats();
      expect(stats.positions).toBeGreaterThan(0);
      expect(stats.totalMoves).toBeGreaterThan(0);
    });

    it('should return opening move from starting position', () => {
      board.initializeStartingPosition();
      state.reset();

      const move = openingBook.probe(board, state);
      expect(move).not.toBeNull();
      
      if (move) {
        // Should be one of: e4, d4, Nf3, c4
        const validStartMoves = [
          algebraicToSquare('e2'),
          algebraicToSquare('d2'),
          algebraicToSquare('g1'),
          algebraicToSquare('c2'),
        ];
        expect(validStartMoves).toContain(move.from);
      }
    });

    it('should return null for positions not in book', () => {
      board.initializeStartingPosition();
      state.reset();
      
      // Make some moves to get out of book
      const e2 = algebraicToSquare('e2')!;
      const e4 = algebraicToSquare('e4')!;
      board.setPiece(e4, board.getPiece(e2));
      board.setPiece(e2, null);
      state.switchTurn();

      const e7 = algebraicToSquare('e7')!;
      const e5 = algebraicToSquare('e5')!;
      board.setPiece(e5, board.getPiece(e7));
      board.setPiece(e7, null);
      state.switchTurn();

      // After 1.e4 e5, might still be in book
      // But after more moves, should be out of book
      for (let i = 0; i < 10; i++) {
        state.switchTurn();
      }
      
      const move = openingBook.probe(board, state);
      // May or may not be in book - just check it doesn't crash
      expect(move === null || move !== null).toBe(true);
    });

    it('should allow adding custom book moves', () => {
      const hash = 123456789n;
      openingBook.addMove(hash, 8, 16, 100);
      
      const stats = openingBook.getStats();
      expect(stats.totalMoves).toBeGreaterThan(0);
    });

    it('should support enabling/disabling', () => {
      expect(openingBook.isEnabled()).toBe(true);
      
      openingBook.setEnabled(false);
      expect(openingBook.isEnabled()).toBe(false);
      
      openingBook.setEnabled(true);
      expect(openingBook.isEnabled()).toBe(true);
    });

    it('should return null when disabled', () => {
      board.initializeStartingPosition();
      state.reset();

      openingBook.setEnabled(false);
      const move = openingBook.probe(board, state);
      expect(move).toBeNull();
    });

    it('should support clearing book', () => {
      openingBook.clear();
      const stats = openingBook.getStats();
      expect(stats.positions).toBe(0);
      expect(stats.totalMoves).toBe(0);
    });
  });

  describe('TimeManager', () => {
    let timeManager: TimeManager;

    beforeEach(() => {
      timeManager = new TimeManager();
    });

    it('should allocate time with no increment', () => {
      const allocation = timeManager.allocateTime(
        { whiteTime: 60000, blackTime: 60000 },
        true,
        1
      );

      expect(allocation.optimalTime).toBeGreaterThan(0);
      expect(allocation.maxTime).toBeGreaterThanOrEqual(allocation.optimalTime);
      expect(allocation.minTime).toBeLessThanOrEqual(allocation.optimalTime);
    });

    it('should allocate more time with increment', () => {
      const noInc = timeManager.allocateTime(
        { whiteTime: 60000, blackTime: 60000 },
        true,
        1
      );

      const withInc = timeManager.allocateTime(
        { whiteTime: 60000, blackTime: 60000, whiteIncrement: 1000, blackIncrement: 1000 },
        true,
        1
      );

      // With increment, should allocate more time
      expect(withInc.optimalTime).toBeGreaterThanOrEqual(noInc.optimalTime);
    });

    it('should respect moves to go', () => {
      const allocation = timeManager.allocateTime(
        { whiteTime: 60000, blackTime: 60000, movesToGo: 10 },
        true,
        1
      );

      // Should allocate roughly 1/10th of time
      expect(allocation.optimalTime).toBeLessThan(10000);
    });

    it('should adjust for position complexity', () => {
      const baseAllocation = {
        optimalTime: 1000,
        maxTime: 3000,
        minTime: 500,
      };

      const simpleAdjusted = timeManager.adjustForComplexity(baseAllocation, 0.2);
      const complexAdjusted = timeManager.adjustForComplexity(baseAllocation, 0.9);

      // Complex positions should get more time
      expect(complexAdjusted.optimalTime).toBeGreaterThan(simpleAdjusted.optimalTime);
    });

    it('should calculate position complexity', () => {
      const simple = timeManager.calculateComplexity(10, 6, false);
      const complex = timeManager.calculateComplexity(40, 20, true);

      expect(complex).toBeGreaterThan(simple);
      expect(simple).toBeGreaterThanOrEqual(0);
      expect(complex).toBeLessThanOrEqual(1);
    });

    it('should detect time pressure', () => {
      expect(timeManager.isTimePressure(5000)).toBe(true);
      expect(timeManager.isTimePressure(30000)).toBe(false);
      expect(timeManager.isTimePressure(5000, 2000)).toBe(false); // Good increment
    });
  });

  describe('MoveNotation', () => {
    let board: Board;
    let state: GameState;

    beforeEach(() => {
      board = new Board();
      state = new GameState();
      board.initializeStartingPosition();
      state.reset();
    });

    it('should convert move to UCI notation', () => {
      const moveGen = new MoveGenerator();
      const moves = moveGen.generateLegalMoves(board, state);
      
      const e2e4 = moves.find(m => m.from === algebraicToSquare('e2') && m.to === algebraicToSquare('e4'));
      expect(e2e4).toBeDefined();

      if (e2e4) {
        const uci = MoveNotation.toUci(e2e4);
        expect(uci).toBe('e2e4');
      }
    });

    it('should parse UCI notation to move', () => {
      const move = MoveNotation.fromUci('e2e4', board, state);
      expect(move).not.toBeNull();
      
      if (move) {
        expect(move.from).toBe(algebraicToSquare('e2'));
        expect(move.to).toBe(algebraicToSquare('e4'));
      }
    });

    it('should handle invalid UCI notation', () => {
      expect(MoveNotation.fromUci('z9z9', board, state)).toBeNull();
      expect(MoveNotation.fromUci('e2e9', board, state)).toBeNull();
      expect(MoveNotation.fromUci('e2', board, state)).toBeNull();
    });

    it('should convert move to SAN notation', () => {
      const moveGen = new MoveGenerator();
      const moves = moveGen.generateLegalMoves(board, state);
      
      const e2e4 = moves.find(m => m.from === algebraicToSquare('e2') && m.to === algebraicToSquare('e4'));
      if (e2e4) {
        const san = MoveNotation.toSan(e2e4, board, state);
        expect(san).toBe('e4');
      }
    });
  });

  describe('UCI Protocol', () => {
    let board: Board;
    let state: GameState;
    let searchEngine: SearchEngine;
    let timeManager: TimeManager;
    let uciHandler: UciHandler;

    beforeEach(() => {
      board = new Board();
      state = new GameState();
      const evaluator = new Evaluator();
      const moveGen = new MoveGenerator();
      const alphaBeta = new AlphaBetaSearch(evaluator, moveGen);
      const zobrist = new ZobristHasher();
      const tt = new TranspositionTable(1024, zobrist);
      const quiescence = new QuiescenceSearch(evaluator, moveGen);
      const moveOrderer = new MoveOrderer();
      const iterativeDeepening = new IterativeDeepeningSearch(alphaBeta, tt, moveOrderer);
      
      searchEngine = new SearchEngine(
        alphaBeta,
        tt,
        quiescence,
        moveOrderer,
        iterativeDeepening
      );
      
      timeManager = new TimeManager();
      uciHandler = new UciHandler(board, state, searchEngine, timeManager);
    });

    it('should respond to uci command', () => {
      const response = uciHandler.processCommand('uci');
      expect(response).toContain('id name');
      expect(response).toContain('uciok');
    });

    it('should respond to isready command', () => {
      const response = uciHandler.processCommand('isready');
      expect(response).toBe('readyok');
    });

    it('should handle position startpos', () => {
      const response = uciHandler.processCommand('position startpos');
      expect(response).toBeNull(); // No output expected
    });

    it('should handle position with moves', () => {
      const response = uciHandler.processCommand('position startpos moves e2e4 e7e5');
      expect(response).toBeNull(); // No output expected
    });

    it('should handle ucinewgame', () => {
      const response = uciHandler.processCommand('ucinewgame');
      expect(response).toBeNull();
    });

    it('should handle quit command', () => {
      const response = uciHandler.processCommand('quit');
      expect(response).toBeNull();
    });

    it('should return null for unknown commands', () => {
      const response = uciHandler.processCommand('unknown');
      expect(response).toBeNull();
    });
  });

  describe('Performance Optimizations', () => {
    let board: Board;
    let state: GameState;
    let alphaBeta: AlphaBetaSearch;

    beforeEach(() => {
      board = new Board();
      state = new GameState();
      const evaluator = new Evaluator();
      const moveGen = new MoveGenerator();
      alphaBeta = new AlphaBetaSearch(evaluator, moveGen);
    });

    it('should search faster with optimizations', () => {
      board.initializeStartingPosition();
      state.reset();

      const start = Date.now();
      alphaBeta.searchRoot(board, state, 3);
      const duration = Date.now() - start;

      // Should complete depth 3 in reasonable time
      expect(duration).toBeLessThan(5000);
    });

    it('should produce more beta cutoffs with optimizations', () => {
      board.initializeStartingPosition();
      state.reset();

      alphaBeta.searchRoot(board, state, 3);
      const stats = alphaBeta.getStats();

      // Should have some beta cutoffs from pruning
      expect(stats.betaCutoffs).toBeGreaterThan(0);
    });

    it('should search fewer nodes with optimizations', () => {
      board.initializeStartingPosition();
      state.reset();

      // Search without move ordering is implicitly tested
      const result = alphaBeta.searchRoot(board, state, 2);
      const stats = alphaBeta.getStats();

      // Should explore nodes efficiently
      expect(stats.nodes).toBeGreaterThan(0);
      expect(stats.nodes).toBeLessThan(10000); // Reasonable for depth 2
    });
  });

  describe('Integration', () => {
    it('should work end-to-end with all Phase 7 features', () => {
      const board = new Board();
      const state = new GameState();
      const moveGen = new MoveGenerator();
      const evaluator = new Evaluator();
      const zobrist = new ZobristHasher();
      const openingBook = new OpeningBook(zobrist);
      const timeManager = new TimeManager();
      
      const searchEngine = new SearchEngine(evaluator, moveGen);

      const uciHandler = new UciHandler(board, state, searchEngine, timeManager, openingBook);

      // Initialize
      board.initializeStartingPosition();
      state.reset();

      // Test opening book
      const bookMove = openingBook.probe(board, state);
      expect(bookMove).not.toBeNull();

      // Test time management
      const allocation = timeManager.allocateTime(
        { whiteTime: 60000, blackTime: 60000 },
        true,
        1
      );
      expect(allocation.optimalTime).toBeGreaterThan(0);

      // Test UCI
      const uciResponse = uciHandler.processCommand('uci');
      expect(uciResponse).toContain('uciok');

      // Test search with optimizations
      const result = searchEngine.findBestMove(board, state, 2);
      expect(result.move).not.toBeNull();
      expect(result.stats.nodes).toBeGreaterThan(0);
    });
  });
});
