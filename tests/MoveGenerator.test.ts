/**
 * @file MoveGenerator.test.ts
 * @description Tests for move generation
 */

import { describe, expect, it } from 'vitest';
import * as Positions from '../src/constants/Positions';
import { MoveGenerator } from '../src/move-generation/MoveGenerator';
import { parseFen } from '../src/utils/FenParser';

describe('MoveGenerator', () => {
  const moveGen = new MoveGenerator();

  describe('Starting Position', () => {
    it('should generate 20 legal moves from starting position', () => {
      const { board, state } = parseFen(Positions.STARTING_FEN);
      const moves = moveGen.generateLegalMoves(board, state);

      // Starting position has 20 legal moves:
      // 8 pawn moves (each pawn can move 1 or 2 squares) = 16 moves
      // 2 knight moves (each knight can move to 2 squares) = 4 moves
      expect(moves).toHaveLength(20);
    });

    it('should generate pawn moves', () => {
      const { board, state } = parseFen(Positions.STARTING_FEN);
      const moves = moveGen.generateLegalMoves(board, state);

      const pawnMoves = moves.filter(m => m.piece.type === 1); // PieceType.Pawn
      expect(pawnMoves.length).toBeGreaterThan(0);
    });

    it('should generate knight moves', () => {
      const { board, state } = parseFen(Positions.STARTING_FEN);
      const moves = moveGen.generateLegalMoves(board, state);

      const knightMoves = moves.filter(m => m.piece.type === 2); // PieceType.Knight
      expect(knightMoves.length).toBe(4); // 2 knights * 2 moves each
    });
  });

  describe('After 1.e4', () => {
    it('should generate 20 legal moves for black', () => {
      const { board, state } = parseFen(Positions.AFTER_E4);
      const moves = moveGen.generateLegalMoves(board, state);

      expect(moves.length).toBe(20);
    });
  });

  describe('Empty Board with Kings', () => {
    it('should generate king moves', () => {
      const { board, state } = parseFen(Positions.OPEN_BOARD);
      const moves = moveGen.generateLegalMoves(board, state);

      // King on e4 should have 8 moves
      expect(moves.length).toBe(8);
    });
  });

  describe('Capture Moves', () => {
    it('should generate captures only', () => {
      const { board, state } = parseFen(Positions.STARTING_FEN);
      const captures = moveGen.generateCaptures(board, state);

      // Starting position has no captures
      expect(captures).toHaveLength(0);
    });
  });

  describe('Legal Moves Check', () => {
    it('should have legal moves in starting position', () => {
      const { board, state } = parseFen(Positions.STARTING_FEN);
      const hasMove = moveGen.hasLegalMoves(board, state);

      expect(hasMove).toBe(true);
    });
  });

  describe('Kiwipete Position', () => {
    it('should generate moves for complex position', () => {
      const { board, state } = parseFen(Positions.KIWIPETE);
      const moves = moveGen.generateLegalMoves(board, state);

      // Kiwipete should have moves
      expect(moves.length).toBeGreaterThan(0);
    });
  });
});
