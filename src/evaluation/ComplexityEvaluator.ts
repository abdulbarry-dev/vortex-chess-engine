import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';
import { getAttackedSquares } from '../move-generation/AttackDetector';

/**
 * Evaluates the "complexity" of a position.
 * High complexity means the position is sharp, tense, and difficult to calculate.
 * Used primarily for the Swindle Engine: when losing, Vortex prefers complex positions
 * to maximize the opponent's chances of blundering.
 */
export class ComplexityEvaluator {
  /**
   * Calculate a complexity score between 0 and ~300.
   */
  evaluate(board: Board): number {
    let complexity = 0;

    // 1. Material Imbalance / Pieces on board (Base Complexity)
    // The more pieces on the board, the more complex the position.
    let whitePieces = 0;
    let blackPieces = 0;
    
    for (const [_square, piece] of board.getAllPieces()) {
      if (piece.type === PieceType.Queen) complexity += 30;
      else if (piece.type === PieceType.Rook) complexity += 10;
      else if (piece.type === PieceType.Knight || piece.type === PieceType.Bishop) complexity += 8;
      else if (piece.type === PieceType.Pawn) complexity += 2;

      if (piece.color === Color.White) whitePieces++;
      else blackPieces++;
    }

    // High asymmetry in piece count (e.g. 3 minor pieces vs Queen) adds complexity
    const pieceCountDiff = Math.abs(whitePieces - blackPieces);
    complexity += pieceCountDiff * 5;

    // 2. Tension (Attacked Pieces)
    // If many pieces are under attack, the position is tactically sharp.
    const whiteAttacks = getAttackedSquares(board, Color.White);
    const blackAttacks = getAttackedSquares(board, Color.Black);

    for (const [square, piece] of board.getAllPieces()) {
      const isAttackedByWhite = (whiteAttacks & (1n << BigInt(square))) !== 0n;
      const isAttackedByBlack = (blackAttacks & (1n << BigInt(square))) !== 0n;

      if (piece.color === Color.Black && isAttackedByWhite) {
        complexity += this.getPieceTensionValue(piece.type);
      } else if (piece.color === Color.White && isAttackedByBlack) {
        complexity += this.getPieceTensionValue(piece.type);
      }
    }

    // 3. Pawn Asymmetry
    // If pawns are scattered across many files, it's more complex than locked chains.
    let whitePawnFiles = 0;
    let blackPawnFiles = 0;
    
    for (const [square, piece] of board.getAllPieces()) {
      if (piece.type === PieceType.Pawn) {
        const file = square % 8;
        if (piece.color === Color.White) whitePawnFiles |= (1 << file);
        else blackPawnFiles |= (1 << file);
      }
    }
    
    // Count bits (number of files with pawns)
    const whiteFilesCount = this.countBits(whitePawnFiles);
    const blackFilesCount = this.countBits(blackPawnFiles);
    
    complexity += Math.abs(whiteFilesCount - blackFilesCount) * 5;

    return complexity;
  }

  private getPieceTensionValue(type: PieceType): number {
    switch (type) {
      case PieceType.Queen: return 20; // Hanging queen is extreme tension
      case PieceType.Rook: return 10;
      case PieceType.Bishop:
      case PieceType.Knight: return 8;
      case PieceType.Pawn: return 3;
      default: return 0;
    }
  }

  private countBits(n: number): number {
    let count = 0;
    while (n) {
      count += n & 1;
      n >>= 1;
    }
    return count;
  }
}
