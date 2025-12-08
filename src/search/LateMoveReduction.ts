/**
 * @file LateMoveReduction.ts
 * @description Late Move Reduction (LMR) for reducing search depth on later moves
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Move, MoveFlags } from '../types/Move.types';

/**
 * Configuration for Late Move Reduction.
 */
export interface LMRConfig {
  /** Enable LMR */
  enabled: boolean;
  /** Minimum depth to apply LMR */
  minDepth: number;
  /** Minimum move number to start reducing */
  fullDepthMoves: number;
  /** Base reduction amount */
  baseReduction: number;
  /** Additional reduction per move */
  reductionPerMove: number;
  /** Maximum reduction allowed */
  maxReduction: number;
}

const DEFAULT_CONFIG: LMRConfig = {
  enabled: true,
  minDepth: 3,
  fullDepthMoves: 4,
  baseReduction: 1,
  reductionPerMove: 0.5,
  maxReduction: 3,
};

/**
 * Statistics for LMR.
 */
export interface LMRStatistics {
  /** Total moves reduced */
  movesReduced: number;
  /** Total reduction amount */
  totalReduction: number;
  /** Reductions by depth */
  reductionsByDepth: { depth: number; count: number; avgReduction: number }[];
  /** Research count (when reduction failed) */
  researchCount: number;
  /** Average reduction */
  averageReduction: number;
}

/**
 * Manages Late Move Reduction in search.
 * Reduces search depth for moves that are unlikely to be best.
 */
export class LateMoveReduction {
  private config: LMRConfig;
  private statistics: {
    movesReduced: number;
    totalReduction: number;
    reductionsByDepth: Map<number, { count: number; totalReduction: number }>;
    researchCount: number;
  };

  constructor(config: Partial<LMRConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.statistics = {
      movesReduced: 0,
      totalReduction: 0,
      reductionsByDepth: new Map(),
      researchCount: 0,
    };
  }

  /**
   * Calculate reduction amount for a move.
   * 
   * @param board Current board position
   * @param state Current game state
   * @param move Move to potentially reduce
   * @param depth Current search depth
   * @param moveNumber Move index in move list (0-based)
   * @param pvNode Whether this is a PV node
   * @returns Reduction amount (0 = no reduction)
   */
  getReduction(
    board: Board,
    state: GameState,
    move: Move,
    depth: number,
    moveNumber: number,
    pvNode: boolean
  ): number {
    // Feature disabled
    if (!this.config.enabled) {
      return 0;
    }

    // Too shallow
    if (depth < this.config.minDepth) {
      return 0;
    }

    // Don't reduce early moves (likely good)
    if (moveNumber < this.config.fullDepthMoves) {
      return 0;
    }

    // Don't reduce in PV nodes (expected best line)
    if (pvNode) {
      return 0;
    }

    // Don't reduce tactical moves
    if (this.isTacticalMove(board, state, move)) {
      return 0;
    }

    // Calculate reduction based on move number and depth
    const basedOnMoves = Math.floor(
      (moveNumber - this.config.fullDepthMoves) * this.config.reductionPerMove
    );
    const reduction = Math.min(
      this.config.baseReduction + basedOnMoves,
      this.config.maxReduction
    );

    // Track statistics
    this.statistics.movesReduced++;
    this.statistics.totalReduction += reduction;

    const depthStats = this.statistics.reductionsByDepth.get(depth) ?? {
      count: 0,
      totalReduction: 0,
    };
    depthStats.count++;
    depthStats.totalReduction += reduction;
    this.statistics.reductionsByDepth.set(depth, depthStats);

    return reduction;
  }

  /**
   * Check if a move is tactical and should not be reduced.
   * 
   * @param board Current board position
   * @param state Current game state
   * @param move Move to check
   * @returns True if move is tactical
   */
  private isTacticalMove(board: Board, state: GameState, move: Move): boolean {
    // Captures
    if (move.flags & MoveFlags.Capture) {
      return true;
    }

    // Promotions
    if (move.flags & MoveFlags.Promotion) {
      return true;
    }

    // En passant
    if (move.flags & MoveFlags.EnPassant) {
      return true;
    }

    // Checks (need to make move and check)
    // Note: This is expensive, so we skip it for now
    // In production, you'd maintain an "gives check" flag

    return false;
  }

  /**
   * Record a research (when reduced search failed).
   */
  recordResearch(): void {
    this.statistics.researchCount++;
  }

  /**
   * Get LMR statistics.
   * 
   * @returns Statistics object
   */
  getStatistics(): LMRStatistics {
    const reductionsByDepth: { depth: number; count: number; avgReduction: number }[] = [];

    this.statistics.reductionsByDepth.forEach((stats, depth) => {
      reductionsByDepth.push({
        depth,
        count: stats.count,
        avgReduction: stats.totalReduction / stats.count,
      });
    });

    // Sort by depth
    reductionsByDepth.sort((a, b) => a.depth - b.depth);

    return {
      movesReduced: this.statistics.movesReduced,
      totalReduction: this.statistics.totalReduction,
      reductionsByDepth,
      researchCount: this.statistics.researchCount,
      averageReduction:
        this.statistics.movesReduced > 0
          ? this.statistics.totalReduction / this.statistics.movesReduced
          : 0,
    };
  }

  /**
   * Clear statistics.
   */
  clearStatistics(): void {
    this.statistics.movesReduced = 0;
    this.statistics.totalReduction = 0;
    this.statistics.reductionsByDepth.clear();
    this.statistics.researchCount = 0;
  }

  /**
   * Update configuration.
   * 
   * @param config Partial configuration to update
   */
  updateConfig(config: Partial<LMRConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   * 
   * @returns Current configuration
   */
  getConfig(): Readonly<LMRConfig> {
    return { ...this.config };
  }
}
