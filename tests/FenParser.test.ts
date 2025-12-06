/**
 * @file FenParser.test.ts
 * @description Tests for FEN parsing functionality
 */

import { describe, expect, it } from 'vitest';
import * as Positions from '../src/constants/Positions';
import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { Color } from '../src/core/Piece';
import { algebraicToSquare } from '../src/core/Square';
import { parseFen } from '../src/utils/FenParser';

describe('FenParser', () => {
  describe('parseFen - Starting Position', () => {
    it('should parse the starting position correctly', () => {
      const result = parseFen(Positions.STARTING_FEN);

      expect(result.board).toBeInstanceOf(Board);
      expect(result.state).toBeInstanceOf(GameState);

      // Check some key pieces
      expect(result.board.getPiece(0)?.type).toBe(4); // White rook on a1
      expect(result.board.getPiece(4)?.type).toBe(6); // White king on e1
      expect(result.board.getPiece(60)?.type).toBe(6); // Black king on e8
      expect(result.board.getPiece(63)?.type).toBe(4); // Black rook on h8

      // Check game state
      expect(result.state.currentPlayer).toBe(Color.White);
      expect(result.state.castlingRights.white.kingSide).toBe(true);
      expect(result.state.castlingRights.white.queenSide).toBe(true);
      expect(result.state.castlingRights.black.kingSide).toBe(true);
      expect(result.state.castlingRights.black.queenSide).toBe(true);
      expect(result.state.enPassantSquare).toBe(null);
      expect(result.state.halfmoveClock).toBe(0);
      expect(result.state.fullmoveNumber).toBe(1);
    });

    it('should have 16 pieces for each side in starting position', () => {
      const result = parseFen(Positions.STARTING_FEN);
      const pieces = result.board.getAllPieces();

      const whitePieces = pieces.filter(([_, piece]) => piece.color === Color.White);
      const blackPieces = pieces.filter(([_, piece]) => piece.color === Color.Black);

      expect(whitePieces).toHaveLength(16);
      expect(blackPieces).toHaveLength(16);
    });
  });

  describe('parseFen - Various Positions', () => {
    it('should parse position after 1.e4', () => {
      const result = parseFen(Positions.AFTER_E4);

      expect(result.state.currentPlayer).toBe(Color.Black);
      expect(result.state.enPassantSquare).toBe(algebraicToSquare('e3'));
      expect(result.state.halfmoveClock).toBe(0);
      expect(result.state.fullmoveNumber).toBe(1);

      // Check that e4 square has a white pawn
      const e4Piece = result.board.getPiece(algebraicToSquare('e4'));
      expect(e4Piece?.type).toBe(1); // Pawn
      expect(e4Piece?.color).toBe(Color.White);
    });

    it('should parse position after 1.e4 e5', () => {
      const result = parseFen(Positions.AFTER_E4_E5);

      expect(result.state.currentPlayer).toBe(Color.White);
      expect(result.state.enPassantSquare).toBe(algebraicToSquare('e6'));
      expect(result.state.fullmoveNumber).toBe(2);

      // Check both pawns
      const e4Piece = result.board.getPiece(algebraicToSquare('e4'));
      const e5Piece = result.board.getPiece(algebraicToSquare('e5'));

      expect(e4Piece?.color).toBe(Color.White);
      expect(e5Piece?.color).toBe(Color.Black);
    });

    it('should parse Sicilian Defense', () => {
      const result = parseFen(Positions.SICILIAN_DEFENSE);

      const c5Piece = result.board.getPiece(algebraicToSquare('c5'));
      expect(c5Piece?.type).toBe(1); // Pawn
      expect(c5Piece?.color).toBe(Color.Black);

      expect(result.state.enPassantSquare).toBe(algebraicToSquare('c6'));
    });

    it('should parse French Defense', () => {
      const result = parseFen(Positions.FRENCH_DEFENSE);

      const e6Piece = result.board.getPiece(algebraicToSquare('e6'));
      expect(e6Piece?.type).toBe(1); // Pawn
      expect(e6Piece?.color).toBe(Color.Black);

      expect(result.state.enPassantSquare).toBe(null);
    });
  });

  describe('parseFen - Castling Rights', () => {
    it('should parse position with no castling rights', () => {
      const result = parseFen(Positions.NO_CASTLING);

      expect(result.state.castlingRights.white.kingSide).toBe(false);
      expect(result.state.castlingRights.white.queenSide).toBe(false);
      expect(result.state.castlingRights.black.kingSide).toBe(false);
      expect(result.state.castlingRights.black.queenSide).toBe(false);
    });

    it('should parse position with only white kingside castling', () => {
      const result = parseFen(Positions.WHITE_KINGSIDE_ONLY);

      expect(result.state.castlingRights.white.kingSide).toBe(true);
      expect(result.state.castlingRights.white.queenSide).toBe(false);
      expect(result.state.castlingRights.black.kingSide).toBe(false);
      expect(result.state.castlingRights.black.queenSide).toBe(false);
    });

    it('should parse position with only black queenside castling', () => {
      const result = parseFen(Positions.BLACK_QUEENSIDE_ONLY);

      expect(result.state.castlingRights.white.kingSide).toBe(false);
      expect(result.state.castlingRights.white.queenSide).toBe(false);
      expect(result.state.castlingRights.black.kingSide).toBe(false);
      expect(result.state.castlingRights.black.queenSide).toBe(true);
    });
  });

  describe('parseFen - En Passant', () => {
    it('should parse white en passant position', () => {
      const result = parseFen(Positions.EN_PASSANT_WHITE);

      expect(result.state.enPassantSquare).toBe(algebraicToSquare('d6'));
      expect(result.state.currentPlayer).toBe(Color.White);
    });

    it('should parse black en passant position', () => {
      const result = parseFen(Positions.EN_PASSANT_BLACK);

      expect(result.state.enPassantSquare).toBe(algebraicToSquare('e3'));
      expect(result.state.currentPlayer).toBe(Color.Black);
    });
  });

  describe('parseFen - Endgames', () => {
    it('should parse King and Pawn vs King', () => {
      const result = parseFen(Positions.KP_VS_K);
      const pieces = result.board.getAllPieces();

      expect(pieces).toHaveLength(3); // 2 kings + 1 pawn

      const whiteKing = result.board.findKing(Color.White);
      const blackKing = result.board.findKing(Color.Black);

      expect(whiteKing).toBeDefined();
      expect(blackKing).toBeDefined();
    });

    it('should parse King and Rook vs King', () => {
      const result = parseFen(Positions.KR_VS_K);
      const pieces = result.board.getAllPieces();

      expect(pieces).toHaveLength(3); // 2 kings + 1 rook
    });

    it('should parse King and Queen vs King', () => {
      const result = parseFen(Positions.KQ_VS_K);
      const pieces = result.board.getAllPieces();

      expect(pieces).toHaveLength(3); // 2 kings + 1 queen
    });

    it('should parse Lucena position', () => {
      const result = parseFen(Positions.LUCENA_POSITION);
      const pieces = result.board.getAllPieces();

      expect(pieces.length).toBeGreaterThan(3); // Complex endgame
    });
  });

  describe('parseFen - Tactical Positions', () => {
    it('should parse Kiwipete position (famous perft test)', () => {
      const result = parseFen(Positions.KIWIPETE);

      expect(result.state.currentPlayer).toBe(Color.White);
      expect(result.state.castlingRights.white.kingSide).toBe(true);
      expect(result.state.castlingRights.white.queenSide).toBe(true);
      expect(result.state.castlingRights.black.kingSide).toBe(true);
      expect(result.state.castlingRights.black.queenSide).toBe(true);
    });

    it('should parse perft position 3', () => {
      const result = parseFen(Positions.PERFT_POSITION_3);

      expect(result.state.currentPlayer).toBe(Color.White);
    });

    it('should parse perft position 4', () => {
      const result = parseFen(Positions.PERFT_POSITION_4);

      expect(result.state.currentPlayer).toBe(Color.White);
      // Castling rights are 'kq' meaning only black can castle
      expect(result.state.castlingRights.white.kingSide).toBe(false);
      expect(result.state.castlingRights.white.queenSide).toBe(false);
      expect(result.state.castlingRights.black.kingSide).toBe(true);
      expect(result.state.castlingRights.black.queenSide).toBe(true);
    });
  });

  describe('parseFen - Checkmate Positions', () => {
    it('should parse Scholar\'s mate position', () => {
      const result = parseFen(Positions.SCHOLARS_MATE);

      expect(result.state.currentPlayer).toBe(Color.Black);
    });

    it('should parse Fool\'s mate position', () => {
      const result = parseFen(Positions.FOOLS_MATE);

      expect(result.state.currentPlayer).toBe(Color.Black);
    });

    it('should parse back rank checkmate position', () => {
      const result = parseFen(Positions.BACK_RANK_CHECKMATE);

      expect(result.state.currentPlayer).toBe(Color.Black);
    });

    it('should parse stalemate position', () => {
      const result = parseFen(Positions.STALEMATE);

      expect(result.state.currentPlayer).toBe(Color.Black);
    });
  });

  describe('parseFen - Error Handling', () => {
    it('should throw error for empty string', () => {
      expect(() => parseFen('')).toThrow();
    });

    it('should throw error for invalid number of fields', () => {
      expect(() => parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq')).toThrow();
    });

    it('should throw error for invalid piece character', () => {
      expect(() => parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBXR w KQkq - 0 1')).toThrow();
    });

    it('should throw error for invalid rank count', () => {
      expect(() => parseFen('rnbqkbnr/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toThrow();
    });

    it('should throw error for invalid active color', () => {
      expect(() => parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1')).toThrow();
    });

    it('should throw error for invalid castling rights', () => {
      expect(() => parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkqX - 0 1')).toThrow();
    });

    it('should throw error for invalid en passant square', () => {
      expect(() => parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq z9 0 1')).toThrow();
    });

    it('should throw error for negative halfmove clock', () => {
      expect(() => parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - -1 1')).toThrow();
    });

    it('should throw error for zero fullmove number', () => {
      expect(() => parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 0')).toThrow();
    });
  });

  describe('parseFen - All Test Positions', () => {
    it('should successfully parse all standard test positions', () => {
      for (const fen of Positions.ALL_TEST_POSITIONS) {
        expect(() => parseFen(fen)).not.toThrow();
      }
    });

    it('should have correct piece counts for all positions', () => {
      for (const fen of Positions.ALL_TEST_POSITIONS) {
        const result = parseFen(fen);
        const pieces = result.board.getAllPieces();

        // Should have at least 2 pieces (both kings)
        expect(pieces.length).toBeGreaterThanOrEqual(2);

        // Should have exactly 1 king per color
        const whiteKings = pieces.filter(([_, piece]) => piece.type === 6 && piece.color === Color.White);
        const blackKings = pieces.filter(([_, piece]) => piece.type === 6 && piece.color === Color.Black);

        expect(whiteKings).toHaveLength(1);
        expect(blackKings).toHaveLength(1);
      }
    });
  });
});
