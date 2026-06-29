import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';
import { getFile, getRank } from '../core/Square';

/**
 * Evaluates structural danger independent of material.
 * Detects situations where the position is structurally collapsing,
 * such as massive pawn centers, restricted king mobility, and zero counterplay.
 */
export class StructuralDangerEvaluator {
  /**
   * Evaluate structural danger
   * Returns a penalty in centipawns. Positive penalty = White is in danger (so subtract from score),
   * Negative penalty = Black is in danger (so add to score).
   */
  evaluate(board: Board): number {
    let penalty = 0;

    penalty += this.evaluateKingMobility(board, Color.White);
    penalty -= this.evaluateKingMobility(board, Color.Black);

    penalty += this.evaluatePassedPawns(board, Color.Black); // Black passed pawns are danger to White
    penalty -= this.evaluatePassedPawns(board, Color.White); // White passed pawns are danger to Black

    penalty += this.evaluateCenterControl(board, Color.Black); // Black center control is danger to White
    penalty -= this.evaluateCenterControl(board, Color.White);

    return penalty;
  }

  /**
   * Get defensive urgency level independent of material score.
   * Returns 0-3: 0 = safe, 1 = cautious, 2 = defensive, 3 = critical.
   * Used by the search to trigger defensive extensions and time allocation
   * even when material is balanced.
   */
  getDangerLevel(board: Board): number {
    let level = 0;

    // King exposure
    const wKing = board.findKing(Color.White);
    const bKing = board.findKing(Color.Black);
    if (wKing !== null) {
      const wRank = Math.floor(wKing / 8);
      if (wRank >= 2) level += 1; // White king not safely castled
    }
    if (bKing !== null) {
      const bRank = Math.floor(bKing / 8);
      if (bRank <= 5) level += 1; // Black king not safely castled
    }

    // Exposed king mobility (king in open has limited safe squares)
    const wKingMob = this.evaluateKingMobility(board, Color.White);
    const bKingMob = this.evaluateKingMobility(board, Color.Black);
    if (wKingMob > 0) level += 1;
    if (bKingMob > 0) level += 1;

    // Advanced passed pawns
    const wPassed = this.evaluatePassedPawns(board, Color.White);
    const bPassed = this.evaluatePassedPawns(board, Color.Black);
    if (wPassed >= 80 || bPassed >= 80) level += 1;

    return Math.min(level, 3);
  }

  private evaluateKingMobility(board: Board, color: Color): number {
    const kingSquare = board.findKing(color);
    if (kingSquare === null) return 0;

    const rank = getRank(kingSquare);
    const file = getFile(kingSquare);
    
    // Low mobility is normal and expected for a king that is castled or on its starting square.
    // We only care about king mobility if the king is out in the open (rank >= 2 for White, <= 5 for Black).
    if (color === Color.White && rank < 2) return 0;
    if (color === Color.Black && rank > 5) return 0;
    
    let safeSquares = 0;
    const enemyColor = color === Color.White ? Color.Black : Color.White;

    for (let r = Math.max(0, rank - 1); r <= Math.min(7, rank + 1); r++) {
      for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
        if (r === rank && f === file) continue;
        const sq = r * 8 + f;
        const piece = board.getPiece(sq);
        
        // If square is occupied by friendly piece, king can't move there
        if (piece && piece.color === color) continue;

        // Roughly check if square is attacked (simplified for performance)
        // If it is occupied by enemy piece, that counts as unsafe
        if (piece && piece.color === enemyColor) continue;

        safeSquares++;
      }
    }

    // Danger if fewer than 3 legally accessible squares
    if (safeSquares < 3) {
      return (3 - safeSquares) * 30; // 30cp penalty per missing square
    }
    
    return 0;
  }

  private evaluatePassedPawns(board: Board, color: Color): number {
    const pawns = board.findPieces(PieceType.Pawn, color);
    let danger = 0;

    for (const sq of pawns) {
      const rank = getRank(sq);
      // If passed pawn has advanced past the 5th rank
      if ((color === Color.White && rank >= 4) || (color === Color.Black && rank <= 3)) {
        danger += 40;
      }
    }
    
    return danger;
  }

  private evaluateCenterControl(board: Board, color: Color): number {
    // Massive pawn centers
    let centralPawns = 0;
    const pawns = board.findPieces(PieceType.Pawn, color);
    
    for (const sq of pawns) {
      const file = getFile(sq);
      const rank = getRank(sq);
      // d, e files on the 4th, 5th ranks
      if ((file === 3 || file === 4) && (rank === 3 || rank === 4)) {
        centralPawns++;
      }
    }

    if (centralPawns >= 2) {
      return 50; // Central dominance is very dangerous structurally
    }

    return 0;
  }
}
