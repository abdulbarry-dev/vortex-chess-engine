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
    factor *= this.evaluateDrawishEndgamePatterns(board);

    return factor;
  }

  private evaluateOppositeColoredBishops(board: Board): number {
    const whiteBishops = board.findPieces(PieceType.Bishop, Color.White);
    const blackBishops = board.findPieces(PieceType.Bishop, Color.Black);
    
    let otherPiecesCount = 0;
    for (const type of [PieceType.Knight, PieceType.Rook, PieceType.Queen]) {
        otherPiecesCount += board.countPieces(type, Color.White);
        otherPiecesCount += board.countPieces(type, Color.Black);
    }

    const isLightSquare = (sq: number) => ((Math.floor(sq / 8) + (sq % 8)) % 2 !== 0);
    const hasOCB = whiteBishops.length === 1 && blackBishops.length === 1 && 
                   isLightSquare(whiteBishops[0]!) !== isLightSquare(blackBishops[0]!);

    if (hasOCB) {
      let factor = 0.5; // Base opposite-colored bishop drawishness
      if (otherPiecesCount === 0) {
        factor *= 0.5; // Only bishops and pawns -> extremely drawish
      }
      return factor;
    }
    return 1.0;
  }

  private evaluateLockedPawnChains(board: Board): number {
    let blockedPawns = 0;
    
    const whitePawns = board.findPieces(PieceType.Pawn, Color.White);
    const blackPawns = board.findPieces(PieceType.Pawn, Color.Black);
    const totalPawns = whitePawns.length + blackPawns.length;

    const fileHasPawn = [false, false, false, false, false, false, false, false];

    for (const square of whitePawns) {
      fileHasPawn[getFile(square)] = true;
      const advanceSquare = square + 8;
      if (advanceSquare <= 63 && !board.isEmpty(advanceSquare)) {
        blockedPawns++;
      }
    }
    for (const square of blackPawns) {
      fileHasPawn[getFile(square)] = true;
      const advanceSquare = square - 8;
      if (advanceSquare >= 0 && !board.isEmpty(advanceSquare)) {
        blockedPawns++;
      }
    }

    let factor = 1.0;
    if (totalPawns > 0) {
      if (blockedPawns >= 10) factor *= 0.5;
      else if (blockedPawns >= 6) factor *= 0.75;
      
      // Check for lack of open files
      let openFiles = 0;
      for (let i = 0; i < 8; i++) {
        if (!fileHasPawn[i]) openFiles++;
      }
      
      if (openFiles === 0 && blockedPawns >= 8) factor *= 0.4;
      else if (openFiles <= 1 && blockedPawns >= 6) factor *= 0.6;
    }

    return factor;
  }

  private evaluateRookFortress(board: Board, isWhiteLosing: boolean): number {
    const whiteRooks = board.countPieces(PieceType.Rook, Color.White);
    const blackRooks = board.countPieces(PieceType.Rook, Color.Black);

    let otherPiecesCount = 0;
    for (const type of [PieceType.Knight, PieceType.Bishop, PieceType.Queen]) {
        otherPiecesCount += board.countPieces(type, Color.White);
        otherPiecesCount += board.countPieces(type, Color.Black);
    }

    // Must be a pure rook endgame (or minor pieces already traded)
    if (otherPiecesCount > 0 || (whiteRooks === 0 && blackRooks === 0)) {
      return 1.0;
    }

    let factor = 1.0;
    const defendingKingSq = board.findKing(isWhiteLosing ? Color.White : Color.Black);
    if (defendingKingSq === null) return 1.0;
    
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

  private evaluateDrawishEndgamePatterns(board: Board): number {
    let factor = 1.0;
    
    const whitePawns = board.findPieces(PieceType.Pawn, Color.White);
    const blackPawns = board.findPieces(PieceType.Pawn, Color.Black);
    const totalPawns = whitePawns.length + blackPawns.length;
    
    let minPawnFile = 8, maxPawnFile = -1;
    for (const sq of whitePawns) {
        const f = getFile(sq);
        if (f < minPawnFile) minPawnFile = f;
        if (f > maxPawnFile) maxPawnFile = f;
    }
    for (const sq of blackPawns) {
        const f = getFile(sq);
        if (f < minPawnFile) minPawnFile = f;
        if (f > maxPawnFile) maxPawnFile = f;
    }

    let pieceCount = 0;
    for (const type of [PieceType.Knight, PieceType.Bishop, PieceType.Rook, PieceType.Queen]) {
        pieceCount += board.countPieces(type, Color.White);
        pieceCount += board.countPieces(type, Color.Black);
    }

    if (totalPawns > 0 && totalPawns <= 6) {
      const pawnSpan = maxPawnFile - minPawnFile;
      if (pawnSpan <= 3) {
        if (pieceCount <= 2) factor *= 0.5;
        else if (pieceCount <= 4) factor *= 0.7;
        else factor *= 0.85;
      }
    }

    return factor;
  }
}
