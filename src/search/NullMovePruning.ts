/**
 * @file NullMovePruning.ts
 * @description Null Move Pruning for aggressive forward pruning
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';

/**
 * Configuration for Null Move Pruning.
 */
export interface NullMoveConfig {
  /** Enable null move pruning */
  enabled: boolean;
  /** Minimum depth to apply null move */
  minDepth: number;
  /** Reduction depth (R value) */
  reduction: number;
  /** Adaptive reduction based on depth */
  adaptiveReduction: boolean;
  /** Verification search for zugzwang positions */
  verification: boolean;
  /** Verification depth reduction */
  verificationReduction: number;
}

const DEFAULT_CONFIG: NullMoveConfig = {
  enabled: true,
  minDepth: 3,
  reduction: 2,
  adaptiveReduction: true,
  verification: false,
  verificationReduction: 3,
};

/**
 * Statistics for Null Move Pruning.
 */
export interface NullMoveStatistics {
  /** Null moves attempted */
  nullMovesAttempted: number;
  /** Null moves that caused cutoff */
  nullMoveCutoffs: number;
  /** Cutoff rate */
  cutoffRate: number;
  /** Verifications performed */
  verificationsPerformed: number;
  /** Failed verifications (zugzwang detected) */
  failedVerifications: number;
  /** Average reduction used */
  averageReduction: number;
}

/**
 * Manages Null Move Pruning in search.
 * Allows the side to move to "pass" their turn to prove position is good.
 */
export class NullMovePruning {
  private config: NullMoveConfig;
  private statistics: {
    nullMovesAttempted: number;
    nullMoveCutoffs: number;
    totalReduction: number;
    verificationsPerformed: number;
    failedVerifications: number;
  };

  constructor(config: Partial<NullMoveConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.statistics = {
      nullMovesAttempted: 0,
      nullMoveCutoffs: 0,
      totalReduction: 0,
      verificationsPerformed: 0,
      failedVerifications: 0,
    };
  }

  /**
   * Determine if null move pruning should be tried.
   * 
   * @param board Current board position
   * @param state Current game state
   * @param depth Current search depth
   * @param beta Beta value
   * @param inCheck Whether side to move is in check
   * @param nullMoveUsed Whether null move was used in parent
   * @returns True if should try null move
   */
  shouldTryNullMove(
    board: Board,
    state: GameState,
    depth: number,
    _beta: number,
    inCheck: boolean,
    nullMoveUsed: boolean
  ): boolean {
    // Feature disabled
    if (!this.config.enabled) {
      return false;
    }

    // Too shallow
    if (depth < this.config.minDepth) {
      return false;
    }

    // Can't make null move in check
    if (inCheck) {
      return false;
    }

    // Don't make consecutive null moves
    if (nullMoveUsed) {
      return false;
    }

    // Don't use in endgame with only pawns (zugzwang risk)
    if (this.isZugzwangRisk(board, state)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate reduction for null move search.
   * 
   * @param depth Current search depth
   * @returns Reduction amount
   */
  getReduction(depth: number): number {
    let reduction = this.config.reduction;

    // Adaptive reduction based on depth
    if (this.config.adaptiveReduction) {
      if (depth >= 6) {
        reduction = 3;
      } else if (depth >= 4) {
        reduction = 2;
      }
    }

    this.statistics.totalReduction += reduction;

    return reduction;
  }

  /**
   * Record null move attempt.
   */
  recordAttempt(): void {
    this.statistics.nullMovesAttempted++;
  }

  /**
   * Record null move cutoff.
   */
  recordCutoff(): void {
    this.statistics.nullMoveCutoffs++;
  }

  /**
   * Check if position has zugzwang risk.
   * Positions with only king and pawns are risky.
   * 
   * @param board Current board position
   * @param state Current game state
   * @returns True if zugzwang risk exists
   */
  private isZugzwangRisk(board: Board, state: GameState): boolean {
    const currentColor = state.currentPlayer;
    let hasPieces = false;

    // Check if side has any pieces other than king and pawns
    for (let square = 0; square < 64; square++) {
      const piece = board.getPiece(square);
      if (!piece || piece.color !== currentColor) continue;

      // King doesn't count
      if (piece.type === 6) continue; // King

      // Pawns are risky
      if (piece.type === 1) continue; // Pawn

      // Has other pieces
      hasPieces = true;
      break;
    }

    return !hasPieces;
  }

  /**
   * Should perform verification search.
   * Used to detect zugzwang in endgame positions.
   * 
   * @param board Current board position
   * @param state Current game state
   * @returns True if verification needed
   */
  shouldVerify(board: Board, state: GameState): boolean {
    if (!this.config.verification) {
      return false;
    }

    return this.isZugzwangRisk(board, state);
  }

  /**
   * Get verification reduction.
   * 
   * @returns Verification reduction amount
   */
  getVerificationReduction(): number {
    return this.config.verificationReduction;
  }

  /**
   * Record verification attempt.
   */
  recordVerification(): void {
    this.statistics.verificationsPerformed++;
  }

  /**
   * Record failed verification (zugzwang detected).
   */
  recordFailedVerification(): void {
    this.statistics.failedVerifications++;
  }

  /**
   * Get null move statistics.
   * 
   * @returns Statistics object
   */
  getStatistics(): NullMoveStatistics {
    return {
      nullMovesAttempted: this.statistics.nullMovesAttempted,
      nullMoveCutoffs: this.statistics.nullMoveCutoffs,
      cutoffRate:
        this.statistics.nullMovesAttempted > 0
          ? this.statistics.nullMoveCutoffs / this.statistics.nullMovesAttempted
          : 0,
      verificationsPerformed: this.statistics.verificationsPerformed,
      failedVerifications: this.statistics.failedVerifications,
      averageReduction:
        this.statistics.nullMovesAttempted > 0
          ? this.statistics.totalReduction / this.statistics.nullMovesAttempted
          : 0,
    };
  }

  /**
   * Clear statistics.
   */
  clearStatistics(): void {
    this.statistics.nullMovesAttempted = 0;
    this.statistics.nullMoveCutoffs = 0;
    this.statistics.totalReduction = 0;
    this.statistics.verificationsPerformed = 0;
    this.statistics.failedVerifications = 0;
  }

  /**
   * Update configuration.
   * 
   * @param config Partial configuration to update
   */
  updateConfig(config: Partial<NullMoveConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   * 
   * @returns Current configuration
   */
  getConfig(): Readonly<NullMoveConfig> {
    return { ...this.config };
  }
}
