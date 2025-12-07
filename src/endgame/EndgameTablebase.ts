/**
 * @file EndgameTablebase.ts
 * @description Simple endgame tablebase with common endgames
 * 
 * This is a simplified tablebase implementation that handles common
 * theoretical endgames without needing external Syzygy files.
 * 
 * Supported endgames:
 * - KvK (draw)
 * - KQvK, KRvK, KBBvK (winning)
 * - KBvK, KNvK (draw - insufficient material)
 * - KPvK (basic pawn endgames)
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color, PieceType } from '../core/Piece';

/**
 * Endgame evaluation result
 */
export interface EndgameResult {
  isTablebase: boolean;  // True if position is in tablebase
  score: number;          // Score in centipawns
  isWin: boolean;         // True if forced win
  isDraw: boolean;        // True if forced draw
  movesToMate?: number;   // Moves to mate if known
}

/**
 * Material configuration for endgame detection
 */
interface MaterialCount {
  whiteQueens: number;
  blackQueens: number;
  whiteRooks: number;
  blackRooks: number;
  whiteBishops: number;
  blackBishops: number;
  whiteKnights: number;
  blackKnights: number;
  whitePawns: number;
  blackPawns: number;
}

/**
 * Simple endgame tablebase for common theoretical endgames.
 */
export class EndgameTablebase {
  private enabled: boolean;
  private maxPieces: number;

  constructor(enabled: boolean = true, maxPieces: number = 5) {
    this.enabled = enabled;
    this.maxPieces = maxPieces;
  }

  /**
   * Probe the tablebase for a position.
   * 
   * @param board Current board
   * @param state Game state
   * @returns Endgame result or null if not in tablebase
   */
  probe(board: Board, state: GameState): EndgameResult | null {
    if (!this.enabled) return null;

    const material = this.countMaterial(board);
    const totalPieces = this.getTotalPieces(material);

    // Only handle positions with few pieces
    if (totalPieces > this.maxPieces) return null;

    // Check for specific endgames
    return (
      this.checkKvK(material) ||
      this.checkInsufficientMaterial(material) ||
      this.checkBasicMates(material, board, state) ||
      this.checkKPvK(material, board, state) ||
      null
    );
  }

  /**
   * Count all material on the board.
   */
  private countMaterial(board: Board): MaterialCount {
    return {
      whiteQueens: board.countPieces(PieceType.Queen, Color.White),
      blackQueens: board.countPieces(PieceType.Queen, Color.Black),
      whiteRooks: board.countPieces(PieceType.Rook, Color.White),
      blackRooks: board.countPieces(PieceType.Rook, Color.Black),
      whiteBishops: board.countPieces(PieceType.Bishop, Color.White),
      blackBishops: board.countPieces(PieceType.Bishop, Color.Black),
      whiteKnights: board.countPieces(PieceType.Knight, Color.White),
      blackKnights: board.countPieces(PieceType.Knight, Color.Black),
      whitePawns: board.countPieces(PieceType.Pawn, Color.White),
      blackPawns: board.countPieces(PieceType.Pawn, Color.Black),
    };
  }

  /**
   * Get total piece count (excluding kings).
   */
  private getTotalPieces(material: MaterialCount): number {
    return (
      material.whiteQueens + material.blackQueens +
      material.whiteRooks + material.blackRooks +
      material.whiteBishops + material.blackBishops +
      material.whiteKnights + material.blackKnights +
      material.whitePawns + material.blackPawns +
      2 // Two kings
    );
  }

  /**
   * Check for KvK (king vs king) - draw.
   */
  private checkKvK(material: MaterialCount): EndgameResult | null {
    const hasOnlyKings =
      material.whiteQueens === 0 && material.blackQueens === 0 &&
      material.whiteRooks === 0 && material.blackRooks === 0 &&
      material.whiteBishops === 0 && material.blackBishops === 0 &&
      material.whiteKnights === 0 && material.blackKnights === 0 &&
      material.whitePawns === 0 && material.blackPawns === 0;

    if (hasOnlyKings) {
      return {
        isTablebase: true,
        score: 0,
        isWin: false,
        isDraw: true,
      };
    }

    return null;
  }

  /**
   * Check for insufficient material (automatic draw).
   */
  private checkInsufficientMaterial(material: MaterialCount): EndgameResult | null {
    // KBvK or KNvK
    const whiteInsufficient =
      material.whiteQueens === 0 && material.whiteRooks === 0 &&
      material.whitePawns === 0 &&
      (material.whiteBishops + material.whiteKnights) === 1;

    const blackInsufficient =
      material.blackQueens === 0 && material.blackRooks === 0 &&
      material.blackPawns === 0 &&
      (material.blackBishops + material.blackKnights) === 1;
    
    const blackHasNothing =
      material.blackQueens === 0 && material.blackRooks === 0 &&
      material.blackPawns === 0 &&
      material.blackBishops === 0 && material.blackKnights === 0;
    
    const whiteHasNothing =
      material.whiteQueens === 0 && material.whiteRooks === 0 &&
      material.whitePawns === 0 &&
      material.whiteBishops === 0 && material.whiteKnights === 0;

    // Both sides insufficient material
    if (whiteInsufficient && blackInsufficient) {
      return {
        isTablebase: true,
        score: 0,
        isWin: false,
        isDraw: true,
      };
    }
    
    // KBvK or KNvK (one side has minor piece, other has nothing)
    if (whiteInsufficient && blackHasNothing) {
      return {
        isTablebase: true,
        score: 0,
        isWin: false,
        isDraw: true,
      };
    }
    
    if (blackInsufficient && whiteHasNothing) {
      return {
        isTablebase: true,
        score: 0,
        isWin: false,
        isDraw: true,
      };
    }

    return null;
  }

  /**
   * Check for basic mate endgames (KQvK, KRvK, etc).
   */
  private checkBasicMates(
    material: MaterialCount,
    board: Board,
    state: GameState
  ): EndgameResult | null {
    // KQvK - white wins
    if (
      material.whiteQueens === 1 && material.blackQueens === 0 &&
      material.whiteRooks === 0 && material.blackRooks === 0 &&
      material.whitePawns === 0 && material.blackPawns === 0 &&
      material.whiteBishops === 0 && material.blackBishops === 0 &&
      material.whiteKnights === 0 && material.blackKnights === 0
    ) {
      return {
        isTablebase: true,
        score: state.currentPlayer === Color.White ? 9000 : -9000,
        isWin: true,
        isDraw: false,
        movesToMate: 10, // Approximate
      };
    }

    // KQvK - black wins
    if (
      material.blackQueens === 1 && material.whiteQueens === 0 &&
      material.whiteRooks === 0 && material.blackRooks === 0 &&
      material.whitePawns === 0 && material.blackPawns === 0 &&
      material.whiteBishops === 0 && material.blackBishops === 0 &&
      material.whiteKnights === 0 && material.blackKnights === 0
    ) {
      return {
        isTablebase: true,
        score: state.currentPlayer === Color.Black ? 9000 : -9000,
        isWin: true,
        isDraw: false,
        movesToMate: 10,
      };
    }

    // KRvK - white wins
    if (
      material.whiteRooks === 1 && material.blackRooks === 0 &&
      material.whiteQueens === 0 && material.blackQueens === 0 &&
      material.whitePawns === 0 && material.blackPawns === 0 &&
      material.whiteBishops === 0 && material.blackBishops === 0 &&
      material.whiteKnights === 0 && material.blackKnights === 0
    ) {
      return {
        isTablebase: true,
        score: state.currentPlayer === Color.White ? 8000 : -8000,
        isWin: true,
        isDraw: false,
        movesToMate: 16,
      };
    }

    // KRvK - black wins
    if (
      material.blackRooks === 1 && material.whiteRooks === 0 &&
      material.whiteQueens === 0 && material.blackQueens === 0 &&
      material.whitePawns === 0 && material.blackPawns === 0 &&
      material.whiteBishops === 0 && material.blackBishops === 0 &&
      material.whiteKnights === 0 && material.blackKnights === 0
    ) {
      return {
        isTablebase: true,
        score: state.currentPlayer === Color.Black ? 8000 : -8000,
        isWin: true,
        isDraw: false,
        movesToMate: 16,
      };
    }

    return null;
  }

  /**
   * Check for KPvK (king and pawn vs king).
   * Basic implementation - just returns win/draw based on pawn position.
   */
  private checkKPvK(
    material: MaterialCount,
    board: Board,
    state: GameState
  ): EndgameResult | null {
    // KPvK - white pawn
    if (
      material.whitePawns === 1 && material.blackPawns === 0 &&
      material.whiteQueens === 0 && material.blackQueens === 0 &&
      material.whiteRooks === 0 && material.blackRooks === 0 &&
      material.whiteBishops === 0 && material.blackBishops === 0 &&
      material.whiteKnights === 0 && material.blackKnights === 0
    ) {
      // Simplified: winning unless pawn is too far back
      const pawnSquares = board.findPieces(PieceType.Pawn, Color.White);
      if (pawnSquares.length > 0) {
        const pawnSquare = pawnSquares[0]!;
        const pawnRank = Math.floor(pawnSquare / 8);
        
        // Advanced pawns (rank 4+) are usually winning
        const isWinning = pawnRank >= 4;
        
        return {
          isTablebase: true,
          score: isWinning ? 500 : 0,
          isWin: isWinning,
          isDraw: !isWinning,
        };
      }
    }

    // KPvK - black pawn
    if (
      material.blackPawns === 1 && material.whitePawns === 0 &&
      material.whiteQueens === 0 && material.blackQueens === 0 &&
      material.whiteRooks === 0 && material.blackRooks === 0 &&
      material.whiteBishops === 0 && material.blackBishops === 0 &&
      material.whiteKnights === 0 && material.blackKnights === 0
    ) {
      const pawnSquares = board.findPieces(PieceType.Pawn, Color.Black);
      if (pawnSquares.length > 0) {
        const pawnSquare = pawnSquares[0]!;
        const pawnRank = Math.floor(pawnSquare / 8);
        
        // Advanced pawns (rank 3 or lower for black) are usually winning
        const isWinning = pawnRank <= 3;
        
        return {
          isTablebase: true,
          score: isWinning ? -500 : 0,
          isWin: isWinning,
          isDraw: !isWinning,
        };
      }
    }

    return null;
  }

  /**
   * Enable or disable the tablebase.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if tablebase is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get statistics about tablebase usage.
   */
  getStats(): { maxPieces: number; enabled: boolean } {
    return {
      maxPieces: this.maxPieces,
      enabled: this.enabled,
    };
  }
}
