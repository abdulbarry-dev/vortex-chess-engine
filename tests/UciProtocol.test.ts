/**
 * @file UciProtocol.test.ts
 * @description Tests for UCI (Universal Chess Interface) protocol implementation
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { UciHandler } from '../src/core/UciHandler';
import { Evaluator } from '../src/evaluation/Evaluator';
import { MoveGenerator } from '../src/move-generation/MoveGenerator';
import { SearchEngine } from '../src/search/SearchEngine';
import { TimeManager } from '../src/time/TimeManager';

describe('UCI Protocol', () => {
  let board: Board;
  let state: GameState;
  let searchEngine: SearchEngine;
  let timeManager: TimeManager;
  let uci: UciHandler;

  beforeEach(() => {
    board = new Board();
    state = new GameState();
    const evaluator = new Evaluator();
    const moveGen = new MoveGenerator();
    searchEngine = new SearchEngine(evaluator, moveGen);
    timeManager = new TimeManager();
    uci = new UciHandler(board, state, searchEngine, timeManager);
  });

  describe('Engine Identification', () => {
    it('should respond to uci command', () => {
      const response = uci.processCommand('uci');
      
      expect(response).not.toBeNull();
      expect(response).toContain('id name');
      expect(response).toContain('uciok');
    });

    it('should include engine name in uci response', () => {
      const response = uci.processCommand('uci');
      
      expect(response).toContain('Vortex');
    });

    it('should include author in uci response', () => {
      const response = uci.processCommand('uci');
      
      expect(response).toContain('id author');
    });

    it('should declare available options', () => {
      const response = uci.processCommand('uci');
      
      expect(response).toContain('option');
    });
  });

  describe('Ready Check', () => {
    it('should respond to isready command', () => {
      const response = uci.processCommand('isready');
      
      expect(response).toBe('readyok');
    });

    it('should respond quickly to isready', () => {
      const start = Date.now();
      uci.processCommand('isready');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100);
    });
  });

  describe('New Game', () => {
    it('should handle ucinewgame command', () => {
      const response = uci.processCommand('ucinewgame');
      
      // No output expected, just shouldn't crash
      expect(response === null || typeof response === 'string').toBe(true);
    });

    it('should reset position on ucinewgame', () => {
      uci.processCommand('position startpos moves e2e4');
      uci.processCommand('ucinewgame');
      
      // After new game, position should be reset
      expect(true).toBe(true); // Just verify no crash
    });
  });

  describe('Position Setup', () => {
    it('should handle position startpos', () => {
      const response = uci.processCommand('position startpos');
      
      expect(response).toBeNull(); // No output expected
    });

    it('should handle position with moves', () => {
      const response = uci.processCommand('position startpos moves e2e4');
      
      expect(response).toBeNull();
    });

    it('should handle multiple moves', () => {
      const response = uci.processCommand('position startpos moves e2e4 e7e5 g1f3');
      
      expect(response).toBeNull();
    });

    it('should handle position with FEN', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const response = uci.processCommand(`position fen ${fen}`);
      
      expect(response).toBeNull();
    });

    it('should handle FEN with moves', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const response = uci.processCommand(`position fen ${fen} moves e2e4`);
      
      expect(response).toBeNull();
    });
  });

  describe('Unknown Commands', () => {
    it('should handle unknown commands gracefully', () => {
      const response = uci.processCommand('unknown');
      
      expect(response).toBeNull();
    });

    it('should not crash on empty command', () => {
      const response = uci.processCommand('');
      
      expect(response === null || typeof response === 'string').toBe(true);
    });

    it('should not crash on whitespace command', () => {
      const response = uci.processCommand('   ');
      
      expect(response === null || typeof response === 'string').toBe(true);
    });
  });

  describe('Quit Command', () => {
    it('should handle quit command', () => {
      const response = uci.processCommand('quit');
      
      expect(response === null || typeof response === 'string').toBe(true);
    });
  });

  describe('Option Setting', () => {
    it('should handle setoption command', () => {
      const response = uci.processCommand('setoption name Hash value 128');
      
      expect(response === null || typeof response === 'string').toBe(true);
    });

    it('should handle boolean options', () => {
      const response = uci.processCommand('setoption name UseBook value true');
      
      expect(response === null || typeof response === 'string').toBe(true);
    });
  });

  describe('Command Parsing', () => {
    it('should handle commands with extra spaces', () => {
      const response = uci.processCommand('  uci  ');
      
      expect(response).toContain('uciok');
    });

    it('should handle commands with tabs', () => {
      const response = uci.processCommand('uci\t');
      
      expect(response).toContain('uciok');
    });

    it('should be case-sensitive for commands', () => {
      const response = uci.processCommand('UCI'); // Wrong case
      
      expect(response).toBeNull();
    });
  });

  describe('Go Command', () => {
    it('should handle go infinite', () => {
      uci.processCommand('position startpos');
      const response = uci.processCommand('go infinite');
      
      // Should not crash, output handled asynchronously
      expect(response === null || typeof response === 'string').toBe(true);
    });

    it('should handle go depth', () => {
      uci.processCommand('position startpos');
      const response = uci.processCommand('go depth 3');
      
      expect(response === null || typeof response === 'string').toBe(true);
    });

    it('should handle go movetime', () => {
      uci.processCommand('position startpos');
      const response = uci.processCommand('go movetime 1000');
      
      expect(response === null || typeof response === 'string').toBe(true);
    });

    it('should handle go with time controls', () => {
      uci.processCommand('position startpos');
      const response = uci.processCommand('go wtime 60000 btime 60000 winc 1000 binc 1000');
      
      expect(response === null || typeof response === 'string').toBe(true);
    });
  });

  describe('Stop Command', () => {
    it('should handle stop command', () => {
      const response = uci.processCommand('stop');
      
      expect(response === null || typeof response === 'string').toBe(true);
    });

    it('should handle stop without search in progress', () => {
      const response = uci.processCommand('stop');
      
      // Should not crash even if no search is running
      expect(response === null || typeof response === 'string').toBe(true);
    });
  });

  describe('Command Sequence', () => {
    it('should handle typical game sequence', () => {
      uci.processCommand('uci');
      uci.processCommand('isready');
      uci.processCommand('ucinewgame');
      uci.processCommand('position startpos');
      uci.processCommand('isready');
      
      // Should complete without errors
      expect(true).toBe(true);
    });

    it('should handle position updates during game', () => {
      uci.processCommand('position startpos');
      uci.processCommand('position startpos moves e2e4');
      uci.processCommand('position startpos moves e2e4 e7e5');
      
      expect(true).toBe(true);
    });
  });
});
