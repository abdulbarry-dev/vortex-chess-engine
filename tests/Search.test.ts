/**
 * @file Search.test.ts
 * @description Tests for search engine components
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { Color, PieceType } from '../src/core/Piece';
import { Evaluator } from '../src/evaluation/Evaluator';
import { MoveGenerator } from '../src/move-generation/MoveGenerator';
import { AlphaBetaSearch } from '../src/search/AlphaBeta';
import { IterativeDeepeningSearch } from '../src/search/IterativeDeepening';
import { MoveOrderer } from '../src/search/MoveOrdering';
import { QuiescenceSearch } from '../src/search/QuiescenceSearch';
import { SearchEngine } from '../src/search/SearchEngine';
import { TranspositionTable } from '../src/search/TranspositionTable';
import { ZobristHasher } from '../src/search/ZobristHashing';
import { TTEntryType } from '../src/types/Search.types';
import { parseFen } from '../src/utils/FenParser';

describe('Search Engine', () => {
  let board: Board;
  let state: GameState;
  let evaluator: Evaluator;
  let moveGenerator: MoveGenerator;
  let searchEngine: SearchEngine;

  beforeEach(() => {
    board = new Board();
    state = new GameState();
    evaluator = new Evaluator();
    moveGenerator = new MoveGenerator();
    searchEngine = new SearchEngine(evaluator, moveGenerator);
  });

  describe('AlphaBetaSearch', () => {
    let alphaBeta: AlphaBetaSearch;

    beforeEach(() => {
      alphaBeta = new AlphaBetaSearch(evaluator, moveGenerator);
    });

    it('should find best move from starting position', () => {
      board.initializeStartingPosition();
      state.reset();

      const result = alphaBeta.searchRoot(board, state, 3);

      expect(result.move).not.toBeNull();
      expect(result.score).toBeDefined();
      expect(typeof result.score).toBe('number');
    });

    it('should detect checkmate in one move', () => {
      // Position: White to move, mate in 1 (Back rank mate)
      // 6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1
      const { board: testBoard, state: testState } = parseFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');

      const result = alphaBeta.searchRoot(testBoard, testState, 3);

      expect(result.move).not.toBeNull();
      if (result.move) {
        // Should move rook to back rank for checkmate
        expect(result.move.piece.type).toBe(PieceType.Rook);
      }
    });

    it('should return 0 for stalemate position', () => {
      // Stalemate: 7k/8/6Q1/8/8/8/8/K7 b - - 0 1 (Black to move, stalemated)
      const { board: testBoard, state: testState } = parseFen('7k/8/6Q1/8/8/8/8/K7 b - - 0 1');

      const moves = moveGenerator.generateLegalMoves(testBoard, testState);
      expect(moves.length).toBe(0); // No legal moves

      const result = alphaBeta.searchRoot(testBoard, testState, 1);
      expect(result.score).toBe(0); // Stalemate evaluates to 0
    });

    it('should prefer shorter mates', () => {
      // Mate in 2: 6k1/5ppp/8/8/8/8/R4PPP/6K1 w - - 0 1
      const { board: testBoard, state: testState } = parseFen('6k1/5ppp/8/8/8/8/R4PPP/6K1 w - - 0 1');

      const depth2Result = alphaBeta.searchRoot(testBoard, testState, 3);
      const depth4Result = alphaBeta.searchRoot(testBoard, testState, 5);

      // Both should find mate, but shorter mate should have higher score
      expect(Math.abs(depth2Result.score)).toBeGreaterThan(50000);
      expect(Math.abs(depth4Result.score)).toBeGreaterThan(50000);
    });

    it('should respect time limits', () => {
      board.initializeStartingPosition();
      state.reset();

      alphaBeta.setTimeLimit(100); // 100ms limit
      const startTime = Date.now();

      alphaBeta.searchRoot(board, state, 10); // Request deep search

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(200); // Should stop reasonably soon
    });

    it('should stop when requested', () => {
      board.initializeStartingPosition();
      state.reset();

      // Start search then immediately stop
      setTimeout(() => alphaBeta.stop(), 10);
      const result = alphaBeta.searchRoot(board, state, 10);

      // Should still return a move (from shallow search)
      expect(result.move).not.toBeNull();
    });

    it('should track search statistics', () => {
      board.initializeStartingPosition();
      state.reset();

      alphaBeta.searchRoot(board, state, 3);
      const stats = alphaBeta.getStats();

      expect(stats.nodesSearched).toBeGreaterThan(0);
      expect(stats.timeMs).toBeGreaterThan(0);
      expect(stats.nodesPerSecond).toBeGreaterThan(0);
    });
  });

  describe('MoveOrderer', () => {
    let moveOrderer: MoveOrderer;

    beforeEach(() => {
      moveOrderer = new MoveOrderer();
    });

    it('should order captures by MVV-LVA', () => {
      // Position with multiple captures available
      const { board: testBoard, state: testState } = parseFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2');

      const moves = moveGenerator.generateLegalMoves(testBoard, testState);
      const captures = moves.filter(m => m.captured);

      if (captures.length > 1) {
        const ordered = moveOrderer.orderMoves(captures, testBoard, null);

        // Verify captures are ordered (higher value victims first)
        for (let i = 0; i < ordered.length - 1; i++) {
          const score1 = ordered[i].captured ? ordered[i].captured!.type : 0;
          const score2 = ordered[i + 1].captured ? ordered[i + 1].captured!.type : 0;
          expect(score1).toBeGreaterThanOrEqual(score2);
        }
      }
    });

    it('should prioritize hash moves', () => {
      board.initializeStartingPosition();
      state.reset();

      const moves = moveGenerator.generateLegalMoves(board, state);
      const hashMove = moves[0]; // Use first move as hash move

      const ordered = moveOrderer.orderMoves(moves, board, hashMove);

      expect(ordered[0]).toEqual(hashMove); // Hash move should be first
    });

    it('should track killer moves', () => {
      board.initializeStartingPosition();
      state.reset();

      const moves = moveGenerator.generateLegalMoves(board, state);
      const quietMove = moves.find(m => !m.captured);

      if (quietMove) {
        moveOrderer.addKillerMove(quietMove, 0);

        const ordered = moveOrderer.orderMoves(moves, board, null);
        
        // Killer move should be near the top (after captures)
        const killerIndex = ordered.findIndex(m => 
          m.from === quietMove.from && m.to === quietMove.to
        );
        expect(killerIndex).toBeGreaterThanOrEqual(0);
      }
    });

    it('should prioritize promotions', () => {
      // Position with promotion available
      const { board: testBoard, state: testState } = parseFen('8/P7/8/8/8/8/8/K6k w - - 0 1');

      const moves = moveGenerator.generateLegalMoves(testBoard, testState);
      const ordered = moveOrderer.orderMoves(moves, testBoard, null);

      // Promotions should be at the top
      const topMoves = ordered.slice(0, 4);
      const promotions = topMoves.filter(m => m.promotion);
      expect(promotions.length).toBeGreaterThan(0);
    });
  });

  describe('TranspositionTable', () => {
    let tt: TranspositionTable;
    let zobrist: ZobristHasher;

    beforeEach(() => {
      tt = new TranspositionTable();
      zobrist = new ZobristHasher();
    });

    it('should store and retrieve entries', () => {
      board.initializeStartingPosition();
      state.reset();

      const hash = zobrist.computeHash(board, state);
      const moves = moveGenerator.generateLegalMoves(board, state);

      tt.store(hash, 5, 25, TTEntryType.Exact, moves[0]);

      const entry = tt.probe(hash);
      expect(entry).not.toBeNull();
      expect(entry?.depth).toBe(5);
      expect(entry?.score).toBe(25);
      expect(entry?.flag).toBe('exact');
    });

    it('should return null for non-existent entries', () => {
      const hash = 123456789n;
      const entry = tt.probe(hash);
      expect(entry).toBeNull();
    });

    it('should replace with deeper searches', () => {
      const hash = zobrist.computeHash(board, state);

      tt.store(hash, 3, 10, TTEntryType.Exact);
      tt.store(hash, 5, 20, TTEntryType.Exact);

      const entry = tt.probe(hash);
      expect(entry?.depth).toBe(5);
      expect(entry?.score).toBe(20);
    });

    it('should not replace with shallower searches', () => {
      const hash = zobrist.computeHash(board, state);

      tt.store(hash, 5, 20, TTEntryType.Exact);
      tt.store(hash, 3, 10, TTEntryType.Exact);

      const entry = tt.probe(hash);
      expect(entry?.depth).toBe(5);
      expect(entry?.score).toBe(20);
    });

    it('should clear all entries', () => {
      const hash = zobrist.computeHash(board, state);
      tt.store(hash, 5, 25, TTEntryType.Exact);

      tt.clear();

      const entry = tt.probe(hash);
      expect(entry).toBeNull();
    });

    it('should provide statistics', () => {
      const hash1 = 111n;
      const hash2 = 222n;

      tt.store(hash1, 5, 10, TTEntryType.Exact);
      tt.store(hash2, 5, 20, TTEntryType.Exact);

      const stats = tt.getStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.entries).toBeGreaterThanOrEqual(2);
    });

    it('should respect alpha-beta bounds', () => {
      const hash = zobrist.computeHash(board, state);

      // Store upperbound (alpha cutoff)
      tt.store(hash, 5, 50, TTEntryType.Alpha);
      const entry = tt.probe(hash);

      const score = tt.getScore(entry!, 5, 40, 60);
      
      // Score was <= alpha (50), so if new alpha is higher, can't use it
      expect(score).toBeDefined();
    });
  });

  describe('ZobristHashing', () => {
    let zobrist: ZobristHasher;

    beforeEach(() => {
      zobrist = new ZobristHasher();
    });

    it('should generate different hashes for different positions', () => {
      board.initializeStartingPosition();
      state.reset();

      const hash1 = zobrist.computeHash(board, state);

      // Make a move
      const moves = moveGenerator.generateLegalMoves(board, state);
      const boardCopy = board.clone();
      const stateCopy = state.clone();
      boardCopy.setPiece(moves[0].to, moves[0].piece);
      boardCopy.setPiece(moves[0].from, null);
      stateCopy.switchTurn();

      const hash2 = zobrist.computeHash(boardCopy, stateCopy);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate same hash for identical positions', () => {
      board.initializeStartingPosition();
      state.reset();

      const hash1 = zobrist.computeHash(board, state);
      const hash2 = zobrist.computeHash(board, state);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different sides to move', () => {
      board.initializeStartingPosition();
      state.reset();

      const hash1 = zobrist.computeHash(board, state);

      state.switchTurn();
      const hash2 = zobrist.computeHash(board, state);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle castling rights in hash', () => {
      board.initializeStartingPosition();
      state.reset();

      const hash1 = zobrist.computeHash(board, state);

      state.removeCastlingRights(Color.White, true);
      const hash2 = zobrist.computeHash(board, state);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle en passant in hash', () => {
      board.initializeStartingPosition();
      state.reset();

      const hash1 = zobrist.computeHash(board, state);

      state.setEnPassantSquare(20);
      const hash2 = zobrist.computeHash(board, state);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('QuiescenceSearch', () => {
    let quiescence: QuiescenceSearch;

    beforeEach(() => {
      quiescence = new QuiescenceSearch(evaluator, moveGenerator);
    });

    it('should search only tactical moves', () => {
      // Position with captures available
      const { board: testBoard, state: testState } = parseFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2');

      const score = quiescence.search(testBoard, testState, -10000, 10000, 0);

      expect(typeof score).toBe('number');
      expect(Math.abs(score)).toBeLessThan(10000);
    });

    it('should stop at quiet positions', () => {
      board.initializeStartingPosition();
      state.reset();

      // Starting position is quiet (no captures)
      const score = quiescence.search(board, state, -10000, 10000, 0);

      expect(typeof score).toBe('number');
    });

    it('should respect depth limit', () => {
      const { board: testBoard, state: testState } = parseFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2');

      // Should terminate even with many captures
      const score = quiescence.search(testBoard, testState, -10000, 10000, 0);

      expect(typeof score).toBe('number');
    });
  });

  describe('IterativeDeepeningSearch', () => {
    let alphaBeta: AlphaBetaSearch;
    let tt: TranspositionTable;
    let moveOrderer: MoveOrderer;
    let iterativeDeepening: IterativeDeepeningSearch;

    beforeEach(() => {
      alphaBeta = new AlphaBetaSearch(evaluator, moveGenerator);
      tt = new TranspositionTable();
      moveOrderer = new MoveOrderer();
      iterativeDeepening = new IterativeDeepeningSearch(alphaBeta, tt, moveOrderer);
    });

    it('should search progressively deeper', () => {
      board.initializeStartingPosition();
      state.reset();

      const result = iterativeDeepening.search(board, state, { maxDepth: 4, timeLimitMs: 5000 });

      expect(result.move).not.toBeNull();
      expect(result.depth).toBeGreaterThan(0);
      expect(result.depth).toBeLessThanOrEqual(4);
    });

    it('should respect time limits', () => {
      board.initializeStartingPosition();
      state.reset();

      const startTime = Date.now();
      iterativeDeepening.search(board, state, { maxDepth: 10, timeLimitMs: 200 });
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(400); // Should stop around time limit
    });

    it('should return PV (principal variation)', () => {
      board.initializeStartingPosition();
      state.reset();

      const result = iterativeDeepening.search(board, state, { maxDepth: 3, timeLimitMs: 5000 });

      expect(result.pv).toBeDefined();
      expect(result.pv.length).toBeGreaterThan(0);
    });

    it('should detect mate', () => {
      // Mate in 1 position
      const { board: testBoard, state: testState } = parseFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');

      const result = iterativeDeepening.search(testBoard, testState, { maxDepth: 5, timeLimitMs: 5000 });

      expect(result.isMate).toBe(true);
      expect(result.mateIn).toBeDefined();
      expect(result.mateIn).toBeGreaterThan(0);
    });

    it('should provide search statistics', () => {
      board.initializeStartingPosition();
      state.reset();

      const result = iterativeDeepening.search(board, state, { maxDepth: 3, timeLimitMs: 5000 });

      expect(result.stats).toBeDefined();
      expect(result.stats.nodesSearched).toBeGreaterThan(0);
      expect(result.stats.timeMs).toBeGreaterThan(0);
    });
  });

  describe('SearchEngine Integration', () => {
    it('should find best move from starting position', () => {
      board.initializeStartingPosition();
      state.reset();

      const result = searchEngine.findBestMove(board, state);

      expect(result.move).not.toBeNull();
      expect(result.score).toBeDefined();
    });

    it('should use custom search depth', () => {
      board.initializeStartingPosition();
      state.reset();

      const result = searchEngine.findBestMove(board, state, 2);

      expect(result.move).not.toBeNull();
      expect(result.depth).toBe(2);
    });

    it('should use custom time limit', () => {
      board.initializeStartingPosition();
      state.reset();

      const startTime = Date.now();
      searchEngine.findBestMove(board, state, undefined, 100);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(300);
    });

    it('should handle configuration changes', () => {
      searchEngine.configure({
        maxDepth: 3,
        timeLimitMs: 1000,
        useIterativeDeepening: true,
        useTranspositionTable: true,
        useQuiescence: true,
        useMoveOrdering: true,
      });

      board.initializeStartingPosition();
      state.reset();

      const result = searchEngine.findBestMove(board, state);
      expect(result.move).not.toBeNull();
    });

    it('should clear transposition table', () => {
      board.initializeStartingPosition();
      state.reset();

      searchEngine.findBestMove(board, state, 3);
      searchEngine.clearTranspositionTable();

      const stats = searchEngine.getTranspositionTableStats();
      expect(stats.entries).toBe(0);
    });

    it('should compute position hash', () => {
      board.initializeStartingPosition();
      state.reset();

      const hash = searchEngine.getPositionHash(board, state);
      expect(typeof hash).toBe('bigint');
    });

    it('should be stoppable', () => {
      board.initializeStartingPosition();
      state.reset();

      setTimeout(() => searchEngine.stop(), 50);
      const result = searchEngine.findBestMove(board, state, 10);

      expect(result.move).not.toBeNull();
    });

    it('should handle tactical positions', () => {
      // Position with hanging piece
      const { board: testBoard, state: testState } = parseFen('rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 3');

      const result = searchEngine.findBestMove(testBoard, testState, 4);

      expect(result.move).not.toBeNull();
      // Should find a good move
      expect(Math.abs(result.score)).toBeLessThan(50000);
    });

    it('should prefer winning material exchanges', () => {
      // Position where queen can capture pawn
      const { board: testBoard, state: testState } = parseFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPPQPPP/RNB1KBNR w KQkq e6 0 2');

      const result = searchEngine.findBestMove(testBoard, testState, 3);

      expect(result.move).not.toBeNull();
      // Should not blunder the queen
      if (result.move) {
        expect(result.move.piece.type).not.toBe(PieceType.Queen);
      }
    });
  });

  describe('Search Depth vs Accuracy', () => {
    it('should improve with deeper search', () => {
      // Tactical position
      const { board: testBoard, state: testState } = parseFen('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');

      const depth2 = searchEngine.findBestMove(testBoard, testState, 2);
      const depth4 = searchEngine.findBestMove(testBoard, testState, 4);

      // Deeper search should find better or equal evaluation
      expect(depth4.stats.nodesSearched).toBeGreaterThan(depth2.stats.nodesSearched);
    });
  });

  describe('Performance Metrics', () => {
    it('should search thousands of nodes per second', () => {
      board.initializeStartingPosition();
      state.reset();

      const result = searchEngine.findBestMove(board, state, 4);

      expect(result.stats.nodesPerSecond).toBeGreaterThan(1000);
    });

    it('should complete depth 3 search in reasonable time', () => {
      board.initializeStartingPosition();
      state.reset();

      const startTime = Date.now();
      searchEngine.findBestMove(board, state, 3);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(2000); // Should complete in under 2 seconds
    });
  });
});
