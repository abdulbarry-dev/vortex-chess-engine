import { Board } from './Board';
import { GameState } from './GameState';
import { Move, MoveFlags } from '../types/Move.types';
import { Color, Piece } from './Piece';
import { Square } from './Square';
import { AllCastlingRights } from '../types/Board.types';

/**
 * Information needed to undo a move
 */
export interface MoveHistory {
  move: Move;
  capturedPiece: Piece | null;
  epSquare: Square | null;
  castlingRights: AllCastlingRights;
  halfmoveClock: number;
}

export class MoveExecutor {
  /**
   * Apply a move to the board and state in-place, returning history to undo it.
   */
  static makeMove(board: Board, state: GameState, move: Move): MoveHistory {
    const history: MoveHistory = {
      move,
      capturedPiece: null,
      epSquare: state.enPassantSquare,
      castlingRights: {
        white: { ...state.castlingRights.white },
        black: { ...state.castlingRights.black }
      },
      halfmoveClock: state.halfmoveClock
    };

    // Determine captured piece (en passant is a special case)
    if (move.flags & MoveFlags.EnPassant) {
      const epFile = move.to % 8;
      const captureRank = move.piece.color === Color.White ? 4 : 3;
      const captureSquare = captureRank * 8 + epFile;
      history.capturedPiece = board.getPiece(captureSquare);
      board.setPiece(captureSquare, null);
    } else {
      history.capturedPiece = board.getPiece(move.to);
    }

    // Apply move to board
    board.setPiece(move.from, null);
    
    if (move.flags & MoveFlags.Promotion && move.promotion) {
      board.setPiece(move.to, { type: move.promotion, color: move.piece.color });
    } else {
      board.setPiece(move.to, move.piece);
    }

    // Handle castling rook movement
    if (move.flags & MoveFlags.Castle) {
      const kingside = move.to > move.from;
      if (kingside) {
        const rookFrom = move.from + 3;
        const rookTo = move.from + 1;
        const rook = board.getPiece(rookFrom);
        if (rook) {
          board.setPiece(rookTo, rook);
          board.setPiece(rookFrom, null);
        }
      } else {
        const rookFrom = move.from - 4;
        const rookTo = move.from - 1;
        const rook = board.getPiece(rookFrom);
        if (rook) {
          board.setPiece(rookTo, rook);
          board.setPiece(rookFrom, null);
        }
      }
    }

    // Update GameState
    state.switchTurn();
    
    // Update en passant square
    if (move.flags & MoveFlags.DoublePawnPush) {
      const direction = move.piece.color === Color.White ? 1 : -1;
      state.enPassantSquare = move.from + direction * 8;
    } else {
      state.enPassantSquare = null;
    }

    // Update castling rights
    // If king moved
    if (move.piece.type === 6) { // King
      if (move.piece.color === Color.White) {
        state.castlingRights.white.kingSide = false;
        state.castlingRights.white.queenSide = false;
      } else {
        state.castlingRights.black.kingSide = false;
        state.castlingRights.black.queenSide = false;
      }
    }
    
    // If rook moved or was captured
    const checkRookRights = (sq: Square) => {
      if (sq === 0) state.castlingRights.white.queenSide = false; // a1
      if (sq === 7) state.castlingRights.white.kingSide = false;  // h1
      if (sq === 56) state.castlingRights.black.queenSide = false; // a8
      if (sq === 63) state.castlingRights.black.kingSide = false;  // h8
    };
    checkRookRights(move.from);
    checkRookRights(move.to);

    // Update clocks
    if (move.captured || move.piece.type === 1) { // Pawn
      state.halfmoveClock = 0;
    } else {
      state.halfmoveClock++;
    }

    if (move.piece.color === Color.Black) {
      state.fullmoveNumber++;
    }

    return history;
  }

  /**
   * Undo a move on the board and state in-place using the history object.
   */
  static unmakeMove(board: Board, state: GameState, history: MoveHistory): void {
    const { move } = history;

    // Restore state
    state.switchTurn();
    state.enPassantSquare = history.epSquare;
    state.castlingRights = history.castlingRights;
    state.halfmoveClock = history.halfmoveClock;
    
    if (move.piece.color === Color.Black) {
      state.fullmoveNumber--;
    }

    // Move piece back
    board.setPiece(move.from, move.piece);
    
    // Handle castling rook movement
    if (move.flags & MoveFlags.Castle) {
      const kingside = move.to > move.from;
      if (kingside) {
        const rookFrom = move.from + 3;
        const rookTo = move.from + 1;
        const rook = board.getPiece(rookTo);
        if (rook) {
          board.setPiece(rookFrom, rook);
          board.setPiece(rookTo, null);
        }
      } else {
        const rookFrom = move.from - 4;
        const rookTo = move.from - 1;
        const rook = board.getPiece(rookTo);
        if (rook) {
          board.setPiece(rookFrom, rook);
          board.setPiece(rookTo, null);
        }
      }
    }

    // Restore captured piece or clear target square
    if (move.flags & MoveFlags.EnPassant) {
      board.setPiece(move.to, null);
      const epFile = move.to % 8;
      const captureRank = move.piece.color === Color.White ? 4 : 3;
      const captureSquare = captureRank * 8 + epFile;
      board.setPiece(captureSquare, history.capturedPiece);
    } else {
      board.setPiece(move.to, history.capturedPiece);
    }
  }
}
