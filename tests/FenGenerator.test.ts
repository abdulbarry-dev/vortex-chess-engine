/**
 * @file FenGenerator.test.ts
 * @description Tests for FEN generation functionality
 */

import { describe, expect, it } from 'vitest';
import * as Positions from '../src/constants/Positions';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { generateFen, generatePiecePlacementOnly, generateSimplifiedFen } from '../src/utils/FenGenerator';
import { parseFen } from '../src/utils/FenParser';

describe('FenGenerator', () => {
  describe('generateFen - Starting Position', () => {
    it('should generate correct FEN for starting position', () => {
      const board = new Board();
      board.initializeStartingPosition();
      const state = new GameState();

      const fen = generateFen(board, state);

      expect(fen).toBe(Positions.STARTING_FEN);
    });

    it('should include all FEN fields', () => {
      const board = new Board();
      board.initializeStartingPosition();
      const state = new GameState();

      const fen = generateFen(board, state);
      const fields = fen.split(' ');

      expect(fields).toHaveLength(6);
      expect(fields[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
      expect(fields[1]).toBe('w');
      expect(fields[2]).toBe('KQkq');
      expect(fields[3]).toBe('-');
      expect(fields[4]).toBe('0');
      expect(fields[5]).toBe('1');
    });
  });

  describe('generateFen - Round Trip', () => {
    it('should round-trip starting position', () => {
      const originalFen = Positions.STARTING_FEN;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toBe(originalFen);
    });

    it('should round-trip position after 1.e4', () => {
      const originalFen = Positions.AFTER_E4;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toBe(originalFen);
    });

    it('should round-trip position after 1.e4 e5', () => {
      const originalFen = Positions.AFTER_E4_E5;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toBe(originalFen);
    });

    it('should round-trip all standard test positions', () => {
      for (const originalFen of Positions.ALL_TEST_POSITIONS) {
        const { board, state } = parseFen(originalFen);
        const generatedFen = generateFen(board, state);

        expect(generatedFen).toBe(originalFen);
      }
    });
  });

  describe('generateFen - Castling Rights', () => {
    it('should generate no castling rights', () => {
      const originalFen = Positions.NO_CASTLING;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toContain(' - ');
    });

    it('should generate only white kingside castling', () => {
      const originalFen = Positions.WHITE_KINGSIDE_ONLY;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toContain(' K ');
    });

    it('should generate only black queenside castling', () => {
      const originalFen = Positions.BLACK_QUEENSIDE_ONLY;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toContain(' q ');
    });

    it('should generate all castling rights', () => {
      const originalFen = Positions.STARTING_FEN;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toContain(' KQkq ');
    });
  });

  describe('generateFen - En Passant', () => {
    it('should generate white en passant square', () => {
      const originalFen = Positions.EN_PASSANT_WHITE;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toContain(' d6 ');
    });

    it('should generate black en passant square', () => {
      const originalFen = Positions.EN_PASSANT_BLACK;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toContain(' e3 ');
    });

    it('should generate - for no en passant', () => {
      const originalFen = Positions.STARTING_FEN;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toContain(' - ');
    });
  });

  describe('generateFen - Active Color', () => {
    it('should generate white to move', () => {
      const originalFen = Positions.STARTING_FEN;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen.split(' ')[1]).toBe('w');
    });

    it('should generate black to move', () => {
      const originalFen = Positions.AFTER_E4;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen.split(' ')[1]).toBe('b');
    });
  });

  describe('generateFen - Move Counters', () => {
    it('should generate correct halfmove clock', () => {
      const board = new Board();
      board.initializeStartingPosition();
      const state = new GameState();
      state.halfmoveClock = 42;

      const fen = generateFen(board, state);

      expect(fen.split(' ')[4]).toBe('42');
    });

    it('should generate correct fullmove number', () => {
      const board = new Board();
      board.initializeStartingPosition();
      const state = new GameState();
      state.fullmoveNumber = 25;

      const fen = generateFen(board, state);

      expect(fen.split(' ')[5]).toBe('25');
    });
  });

  describe('generateFen - Endgames', () => {
    it('should generate King and Pawn vs King', () => {
      const originalFen = Positions.KP_VS_K;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toBe(originalFen);
    });

    it('should generate King and Rook vs King', () => {
      const originalFen = Positions.KR_VS_K;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toBe(originalFen);
    });

    it('should generate Lucena position', () => {
      const originalFen = Positions.LUCENA_POSITION;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toBe(originalFen);
    });
  });

  describe('generateFen - Complex Positions', () => {
    it('should generate Kiwipete position', () => {
      const originalFen = Positions.KIWIPETE;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toBe(originalFen);
    });

    it('should generate perft position 3', () => {
      const originalFen = Positions.PERFT_POSITION_3;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toBe(originalFen);
    });

    it('should generate perft position 4', () => {
      const originalFen = Positions.PERFT_POSITION_4;
      const { board, state } = parseFen(originalFen);
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toBe(originalFen);
    });
  });

  describe('generatePiecePlacementOnly', () => {
    it('should generate only piece placement for starting position', () => {
      const board = new Board();
      board.initializeStartingPosition();

      const placement = generatePiecePlacementOnly(board);

      expect(placement).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
      expect(placement).not.toContain(' ');
    });

    it('should generate only piece placement for empty board', () => {
      const board = new Board();

      const placement = generatePiecePlacementOnly(board);

      expect(placement).toBe('8/8/8/8/8/8/8/8');
    });

    it('should compress consecutive empty squares', () => {
      const { board } = parseFen(Positions.OPEN_BOARD);

      const placement = generatePiecePlacementOnly(board);

      // Should contain '8' for empty ranks
      expect(placement).toContain('8');
    });
  });

  describe('generateSimplifiedFen', () => {
    it('should generate FEN without move counters', () => {
      const board = new Board();
      board.initializeStartingPosition();
      const state = new GameState();
      state.halfmoveClock = 42;
      state.fullmoveNumber = 25;

      const simplifiedFen = generateSimplifiedFen(board, state);
      const fields = simplifiedFen.split(' ');

      expect(fields).toHaveLength(4);
      expect(fields[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
      expect(fields[1]).toBe('w');
      expect(fields[2]).toBe('KQkq');
      expect(fields[3]).toBe('-');
    });

    it('should be useful for position comparison', () => {
      const { board, state } = parseFen(Positions.STARTING_FEN);

      // Same position, different move counts
      state.halfmoveClock = 10;
      state.fullmoveNumber = 50;

      const simplified1 = generateSimplifiedFen(board, state);

      state.halfmoveClock = 0;
      state.fullmoveNumber = 1;

      const simplified2 = generateSimplifiedFen(board, state);

      // Simplified FENs should be equal (ignoring move counters)
      expect(simplified1).toBe(simplified2);
    });
  });

  describe('generateFen - Edge Cases', () => {
    it('should handle empty board', () => {
      const board = new Board();
      const state = new GameState();

      const fen = generateFen(board, state);

      expect(fen.split(' ')[0]).toBe('8/8/8/8/8/8/8/8');
    });

    it('should handle board with single piece', () => {
      const board = new Board();
      const state = new GameState();

      // Place a white king on e1
      board.setPiece(4, { type: 6, color: 1 });

      const fen = generateFen(board, state);

      expect(fen.split(' ')[0]).toContain('K');
    });

    it('should properly compress empty squares', () => {
      const { board, state } = parseFen('8/8/8/4k3/8/8/8/4K3 w - - 0 1');
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toBe('8/8/8/4k3/8/8/8/4K3 w - - 0 1');
    });

    it('should not over-compress mixed pieces and empty squares', () => {
      const { board, state } = parseFen('r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R w KQkq - 2 4');
      const generatedFen = generateFen(board, state);

      expect(generatedFen).toBe('r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R w KQkq - 2 4');
    });
  });

  describe('generateFen - Consistency', () => {
    it('should generate same FEN for cloned board and state', () => {
      const { board, state } = parseFen(Positions.KIWIPETE);

      const fen1 = generateFen(board, state);

      const clonedBoard = board.clone();
      const clonedState = state.clone();

      const fen2 = generateFen(clonedBoard, clonedState);

      expect(fen1).toBe(fen2);
    });

    it('should be deterministic across multiple calls', () => {
      const { board, state } = parseFen(Positions.BALANCED_MIDDLEGAME);

      const fen1 = generateFen(board, state);
      const fen2 = generateFen(board, state);
      const fen3 = generateFen(board, state);

      expect(fen1).toBe(fen2);
      expect(fen2).toBe(fen3);
    });
  });
});
