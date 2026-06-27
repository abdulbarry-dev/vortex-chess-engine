/**
 * @file FortressEvaluator.ts
 * @description Evaluates drawn or drawn-ish fortress configurations.
 * 
 * A fortress is a position where the defending side can hold a draw despite a
 * material deficit because the attacking side cannot make progress. Recognizing
 * fortresses is a critical defensive heuristic; it allows the engine to steer
 * into them when losing, effectively reducing the evaluation deficit and saving draws.
 */

import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';
import { getFile, getRank } from '../core/Square';

export class FortressEvaluator {
  /**
   * Calculates a fortress factor (0.0 to 1.0) to scale down the evaluation score.
   * A lower factor means a stronger fortress (more drawish).
   * 
   * @param board - Current board state
   * @param finalScore - Current evaluation score (from White's perspective)
   * @returns Scaling factor to apply to the evaluation score
   */
  evaluate(board: Board, finalScore: number): number {
    let factor = 1.0;
    
    // We only care about fortresses when one side is losing
    if (Math.abs(finalScore) < 50) return factor;

    const isWhiteLosing = finalScore < -50;

    factor *= this.evaluateOppositeColoredBishops(board);
    factor *= this.evaluateLockedPawnChains(board);
    factor *= this.evaluateRookFortress(board, isWhiteLosing);

    return factor;
  }

  /**
   * 1. Opposite Colored Bishops Fortress
   * When each side has only one bishop and they are on opposite colors,
   * the position is highly drawish, especially with fewer pieces.
   */
  private evaluateOppositeColoredBishops(board: Board): number {
    let whiteBishops = 0, blackBishops = 0;
    let whiteBishopSquare = -1, blackBishopSquare = -1;
    let otherPiecesCount = 0;

    for (let square = 0; square < 64; square++) {
      const piece = board.getPiece(square);
      if (!piece) continue;
      
      if (piece.type === PieceType.Bishop) {
        if (piece.color === Color.White) {
          whiteBishops++;
          whiteBishopSquare = square;
        } else {
          blackBishops++;
          blackBishopSquare = square;
        }
      } else if (piece.type !== PieceType.Pawn && piece.type !== PieceType.King) {
        otherPiecesCount++;
      }
    }

    const isLightSquare = (sq: number) => ((Math.floor(sq / 8) + (sq % 8)) % 2 !== 0);
    const hasOCB = whiteBishops === 1 && blackBishops === 1 && 
                   isLightSquare(whiteBishopSquare) !== isLightSquare(blackBishopSquare);

    if (hasOCB) {
      let factor = 0.5; // Base opposite-colored bishop drawishness
      if (otherPiecesCount === 0) {
        factor *= 0.5; // Only bishops and pawns -> extremely drawish
      }
      return factor;
    }
    return 1.0;
  }

  /**
   * 2. Locked Pawn Chain Fortress
   * Positions with heavily blocked pawns and no open files are extremely drawish.
   */
  private evaluateLockedPawnChains(board: Board): number {
    let blockedPawns = 0;
    let totalPawns = 0;
    let factor = 1.0;

    for (let square = 0; square < 64; square++) {
      const piece = board.getPiece(square);
      if (!piece || piece.type !== PieceType.Pawn) continue;
      
      totalPawns++;
      const direction = piece.color === Color.White ? 1 : -1;
      const advanceSquare = square + (direction * 8);
      
      if (advanceSquare >= 0 && advanceSquare <= 63 && board.getPiece(advanceSquare) !== null) {
        blockedPawns++;
      }
    }

    if (totalPawns > 0) {
      if (blockedPawns >= 10) factor *= 0.5;
      else if (blockedPawns >= 6) factor *= 0.75;
      
      // Check for lack of open files
      let openFiles = 0;
      for (let file = 0; file < 8; file++) {
        let hasPawns = false;
        for (let sq = 0; sq < 64; sq++) {
          const p = board.getPiece(sq);
          if (p && p.type === PieceType.Pawn && getFile(sq) === file) {
            hasPawns = true;
            break;
          }
        }
        if (!hasPawns) openFiles++;
      }
      
      if (openFiles === 0 && blockedPawns >= 8) factor *= 0.4;
      else if (openFiles <= 1 && blockedPawns >= 6) factor *= 0.6;
    }

    return factor;
  }

  /**
   * 3. Rook-Endgame Fortress (Boxed King)
   * A common drawing technique where the defending king is boxed in a corner
   * or edge, safely protected by pawns, and the attacker's king cannot penetrate.
   */
  private evaluateRookFortress(board: Board, isWhiteLosing: boolean): number {
    let whiteRooks = 0, blackRooks = 0;
    let otherPiecesCount = 0;

    let whiteKingSq = -1, blackKingSq = -1;

    for (let square = 0; square < 64; square++) {
      const piece = board.getPiece(square);
      if (!piece) continue;
      
      if (piece.type === PieceType.King) {
        if (piece.color === Color.White) whiteKingSq = square;
        else blackKingSq = square;
      } else if (piece.type === PieceType.Rook) {
        if (piece.color === Color.White) whiteRooks++;
        else blackRooks++;
      } else if (piece.type !== PieceType.Pawn) {
        otherPiecesCount++;
      }
    }

    // Must be a pure rook endgame (or minor pieces already traded)
    if (otherPiecesCount > 0 || (whiteRooks === 0 && blackRooks === 0)) {
      return 1.0;
    }

    let factor = 1.0;
    const defendingKingSq = isWhiteLosing ? whiteKingSq : blackKingSq;
    const defendingKingFile = getFile(defendingKingSq);
    const defendingKingRank = getRank(defendingKingSq);
    
    const isBoxedIn = (
      (defendingKingFile <= 1 || defendingKingFile >= 6) && 
      (defendingKingRank <= 1 || defendingKingRank >= 6)
    );

    if (isBoxedIn) {
      // Defending King is in a corner. If they have a rook to cut off the enemy king,
      // this is highly drawish.
      factor *= 0.6;
    }

    return factor;
  }
}
