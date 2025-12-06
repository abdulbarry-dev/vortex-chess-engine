/**
 * @file GameState.test.ts
 * @description Tests for GameState class
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../src/core/GameState';
import { Color } from '../src/core/Piece';
import { MoveFlags } from '../src/types/Move.types';

describe('GameState', () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState();
  });

  describe('constructor', () => {
    it('should initialize with default starting values', () => {
      expect(state.currentPlayer).toBe(Color.White);
      expect(state.enPassantSquare).toBeNull();
      expect(state.halfmoveClock).toBe(0);
      expect(state.fullmoveNumber).toBe(1);
      expect(state.moveHistory).toEqual([]);
    });

    it('should initialize with all castling rights available', () => {
      expect(state.castlingRights.white.kingSide).toBe(true);
      expect(state.castlingRights.white.queenSide).toBe(true);
      expect(state.castlingRights.black.kingSide).toBe(true);
      expect(state.castlingRights.black.queenSide).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset all values to initial state', () => {
      state.currentPlayer = Color.Black;
      state.halfmoveClock = 10;
      state.fullmoveNumber = 20;
      state.enPassantSquare = 28;
      state.removeCastlingRights(Color.White);

      state.reset();

      expect(state.currentPlayer).toBe(Color.White);
      expect(state.enPassantSquare).toBeNull();
      expect(state.halfmoveClock).toBe(0);
      expect(state.fullmoveNumber).toBe(1);
      expect(state.castlingRights.white.kingSide).toBe(true);
      expect(state.moveHistory).toEqual([]);
    });
  });

  describe('clone', () => {
    it('should create an independent copy', () => {
      state.currentPlayer = Color.Black;
      state.halfmoveClock = 5;
      state.enPassantSquare = 28;

      const cloned = state.clone();

      expect(cloned.currentPlayer).toBe(Color.Black);
      expect(cloned.halfmoveClock).toBe(5);
      expect(cloned.enPassantSquare).toBe(28);

      // Modify original
      state.currentPlayer = Color.White;
      state.halfmoveClock = 10;

      // Clone should be unchanged
      expect(cloned.currentPlayer).toBe(Color.Black);
      expect(cloned.halfmoveClock).toBe(5);
    });

    it('should deep copy castling rights', () => {
      state.removeCastlingRights(Color.White, true);
      const cloned = state.clone();

      expect(cloned.castlingRights.white.kingSide).toBe(false);

      // Modify original
      state.removeCastlingRights(Color.White, false);

      // Clone should be unchanged
      expect(cloned.castlingRights.white.queenSide).toBe(true);
    });
  });

  describe('switchTurn', () => {
    it('should switch from white to black', () => {
      expect(state.currentPlayer).toBe(Color.White);
      state.switchTurn();
      expect(state.currentPlayer).toBe(Color.Black);
    });

    it('should switch from black to white', () => {
      state.currentPlayer = Color.Black;
      state.switchTurn();
      expect(state.currentPlayer).toBe(Color.White);
    });

    it('should increment fullmove number when white moves', () => {
      state.currentPlayer = Color.Black;
      state.fullmoveNumber = 5;
      
      state.switchTurn(); // Black to White
      expect(state.fullmoveNumber).toBe(6);
    });

    it('should not increment fullmove number when black moves', () => {
      state.currentPlayer = Color.White;
      state.fullmoveNumber = 5;
      
      state.switchTurn(); // White to Black
      expect(state.fullmoveNumber).toBe(5);
    });
  });

  describe('canCastle', () => {
    it('should return true when castling rights exist', () => {
      expect(state.canCastle(Color.White, true)).toBe(true);
      expect(state.canCastle(Color.White, false)).toBe(true);
      expect(state.canCastle(Color.Black, true)).toBe(true);
      expect(state.canCastle(Color.Black, false)).toBe(true);
    });

    it('should return false after rights are removed', () => {
      state.removeCastlingRights(Color.White, true);
      expect(state.canCastle(Color.White, true)).toBe(false);
      expect(state.canCastle(Color.White, false)).toBe(true);
    });
  });

  describe('removeCastlingRights', () => {
    it('should remove kingside rights', () => {
      state.removeCastlingRights(Color.White, true);
      expect(state.castlingRights.white.kingSide).toBe(false);
      expect(state.castlingRights.white.queenSide).toBe(true);
    });

    it('should remove queenside rights', () => {
      state.removeCastlingRights(Color.Black, false);
      expect(state.castlingRights.black.queenSide).toBe(false);
      expect(state.castlingRights.black.kingSide).toBe(true);
    });

    it('should remove both rights when side not specified', () => {
      state.removeCastlingRights(Color.White);
      expect(state.castlingRights.white.kingSide).toBe(false);
      expect(state.castlingRights.white.queenSide).toBe(false);
    });
  });

  describe('halfmove clock', () => {
    it('should increment halfmove clock', () => {
      expect(state.halfmoveClock).toBe(0);
      state.incrementHalfmoveClock();
      expect(state.halfmoveClock).toBe(1);
      state.incrementHalfmoveClock();
      expect(state.halfmoveClock).toBe(2);
    });

    it('should reset halfmove clock', () => {
      state.halfmoveClock = 10;
      state.resetHalfmoveClock();
      expect(state.halfmoveClock).toBe(0);
    });
  });

  describe('isFiftyMoveRule', () => {
    it('should return false when below 100 halfmoves', () => {
      state.halfmoveClock = 99;
      expect(state.isFiftyMoveRule()).toBe(false);
    });

    it('should return true at exactly 100 halfmoves', () => {
      state.halfmoveClock = 100;
      expect(state.isFiftyMoveRule()).toBe(true);
    });

    it('should return true above 100 halfmoves', () => {
      state.halfmoveClock = 150;
      expect(state.isFiftyMoveRule()).toBe(true);
    });
  });

  describe('en passant square', () => {
    it('should set en passant square', () => {
      state.setEnPassantSquare(28);
      expect(state.enPassantSquare).toBe(28);
    });

    it('should clear en passant square', () => {
      state.setEnPassantSquare(28);
      state.setEnPassantSquare(null);
      expect(state.enPassantSquare).toBeNull();
    });
  });

  describe('move history', () => {
    it('should add moves to history', () => {
      const move1 = {
        from: 12,
        to: 28,
        piece: { type: 1, color: Color.White },
        flags: MoveFlags.None,
      };
      const move2 = {
        from: 52,
        to: 36,
        piece: { type: 1, color: Color.Black },
        flags: MoveFlags.None,
      };

      state.addMoveToHistory(move1);
      state.addMoveToHistory(move2);

      expect(state.moveHistory).toHaveLength(2);
      expect(state.moveHistory[0]).toEqual(move1);
      expect(state.moveHistory[1]).toEqual(move2);
    });

    it('should get last move', () => {
      const move = {
        from: 12,
        to: 28,
        piece: { type: 1, color: Color.White },
        flags: MoveFlags.None,
      };

      state.addMoveToHistory(move);
      expect(state.getLastMove()).toEqual(move);
    });

    it('should return null when no moves played', () => {
      expect(state.getLastMove()).toBeNull();
    });

    it('should get move count', () => {
      expect(state.getMoveCount()).toBe(0);

      const move = {
        from: 12,
        to: 28,
        piece: { type: 1, color: Color.White },
        flags: MoveFlags.None,
      };

      state.addMoveToHistory(move);
      expect(state.getMoveCount()).toBe(1);
    });
  });

  describe('isOpening', () => {
    it('should return true for early moves', () => {
      state.fullmoveNumber = 1;
      expect(state.isOpening()).toBe(true);
      
      state.fullmoveNumber = 10;
      expect(state.isOpening()).toBe(true);
    });

    it('should return false after move 10', () => {
      state.fullmoveNumber = 11;
      expect(state.isOpening()).toBe(false);
      
      state.fullmoveNumber = 20;
      expect(state.isOpening()).toBe(false);
    });
  });

  describe('getCastlingString', () => {
    it('should return "KQkq" for starting position', () => {
      expect(state.getCastlingString()).toBe('KQkq');
    });

    it('should return correct string when some rights removed', () => {
      state.removeCastlingRights(Color.White, true);
      expect(state.getCastlingString()).toBe('Qkq');
    });

    it('should return "-" when no castling rights', () => {
      state.removeCastlingRights(Color.White);
      state.removeCastlingRights(Color.Black);
      expect(state.getCastlingString()).toBe('-');
    });

    it('should handle partial rights correctly', () => {
      state.removeCastlingRights(Color.White, false);
      state.removeCastlingRights(Color.Black, true);
      expect(state.getCastlingString()).toBe('Kq');
    });
  });
});
