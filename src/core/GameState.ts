/**
 * @file GameState.ts
 * @description Game state management beyond board position
 */

import { AllCastlingRights } from '../types/Board.types';
import { Move } from '../types/Move.types';
import { Color, oppositeColor } from './Piece';
import { Square } from './Square';

/**
 * Game state tracking (turn, castling rights, en passant, clocks, history)
 */
export class GameState {
  /**
   * Current player to move
   */
  currentPlayer: Color;

  /**
   * Castling rights for both players
   */
  castlingRights: AllCastlingRights;

  /**
   * En passant target square (the square behind a pawn that just moved two squares)
   */
  enPassantSquare: Square | null;

  /**
   * Halfmove clock for fifty-move rule (resets on pawn move or capture)
   */
  halfmoveClock: number;

  /**
   * Fullmove number (increments after Black's move)
   */
  fullmoveNumber: number;

  /**
   * History of moves played in this game
   */
  moveHistory: Move[];

  /**
   * Create a new game state with default starting values
   */
  constructor() {
    this.currentPlayer = Color.White;
    this.castlingRights = {
      white: { kingSide: true, queenSide: true },
      black: { kingSide: true, queenSide: true },
    };
    this.enPassantSquare = null;
    this.halfmoveClock = 0;
    this.fullmoveNumber = 1;
    this.moveHistory = [];
  }

  /**
   * Reset game state to starting position
   */
  reset(): void {
    this.currentPlayer = Color.White;
    this.castlingRights = {
      white: { kingSide: true, queenSide: true },
      black: { kingSide: true, queenSide: true },
    };
    this.enPassantSquare = null;
    this.halfmoveClock = 0;
    this.fullmoveNumber = 1;
    this.moveHistory = [];
  }

  /**
   * Create a deep copy of the game state
   * @returns A new GameState instance with the same values
   */
  clone(): GameState {
    const newState = new GameState();
    newState.currentPlayer = this.currentPlayer;
    newState.castlingRights = {
      white: { ...this.castlingRights.white },
      black: { ...this.castlingRights.black },
    };
    newState.enPassantSquare = this.enPassantSquare;
    newState.halfmoveClock = this.halfmoveClock;
    newState.fullmoveNumber = this.fullmoveNumber;
    newState.moveHistory = [...this.moveHistory];
    return newState;
  }

  /**
   * Switch to the other player's turn
   */
  switchTurn(): void {
    this.currentPlayer = oppositeColor(this.currentPlayer);
    if (this.currentPlayer === Color.White) {
      this.fullmoveNumber++;
    }
  }

  /**
   * Check if a specific castling is allowed
   * @param color Color of the player
   * @param kingSide True for kingside (O-O), false for queenside (O-O-O)
   * @returns True if castling is allowed
   */
  canCastle(color: Color, kingSide: boolean): boolean {
    const rights = color === Color.White ? this.castlingRights.white : this.castlingRights.black;
    return kingSide ? rights.kingSide : rights.queenSide;
  }

  /**
   * Remove castling rights for a color
   * @param color Color to remove castling rights from
   * @param kingSide True to remove kingside, false for queenside, undefined for both
   */
  removeCastlingRights(color: Color, kingSide?: boolean): void {
    const rights = color === Color.White ? this.castlingRights.white : this.castlingRights.black;
    if (kingSide === undefined) {
      rights.kingSide = false;
      rights.queenSide = false;
    } else if (kingSide) {
      rights.kingSide = false;
    } else {
      rights.queenSide = false;
    }
  }

  /**
   * Increment the halfmove clock
   */
  incrementHalfmoveClock(): void {
    this.halfmoveClock++;
  }

  /**
   * Reset the halfmove clock (after pawn move or capture)
   */
  resetHalfmoveClock(): void {
    this.halfmoveClock = 0;
  }

  /**
   * Check if the fifty-move rule has been reached
   * @returns True if 50 moves have been made without a pawn move or capture
   */
  isFiftyMoveRule(): boolean {
    return this.halfmoveClock >= 100; // 100 half-moves = 50 full moves
  }

  /**
   * Set the en passant target square
   * @param square Square behind the pawn that just moved two squares, or null
   */
  setEnPassantSquare(square: Square | null): void {
    this.enPassantSquare = square;
  }

  /**
   * Add a move to the game history
   * @param move Move to add
   */
  addMoveToHistory(move: Move): void {
    this.moveHistory.push(move);
  }

  /**
   * Get the last move played, if any
   * @returns Last move or null if no moves have been played
   */
  getLastMove(): Move | null {
    return this.moveHistory.length > 0 
      ? this.moveHistory[this.moveHistory.length - 1] ?? null 
      : null;
  }

  /**
   * Get the number of moves played in the game
   * @returns Number of moves in history
   */
  getMoveCount(): number {
    return this.moveHistory.length;
  }

  /**
   * Check if it's the opening phase (first few moves)
   * @returns True if in opening phase
   */
  isOpening(): boolean {
    return this.fullmoveNumber <= 10;
  }

  /**
   * Get a string representation of castling rights
   * @returns String like "KQkq" (FEN format)
   */
  getCastlingString(): string {
    let result = '';
    if (this.castlingRights.white.kingSide) result += 'K';
    if (this.castlingRights.white.queenSide) result += 'Q';
    if (this.castlingRights.black.kingSide) result += 'k';
    if (this.castlingRights.black.queenSide) result += 'q';
    return result || '-';
  }
}
