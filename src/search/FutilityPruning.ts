/**
 * @file FutilityPruning.ts
 * @description Futility pruning optimization for search
 * 
 * Futility pruning skips moves that are unlikely to improve the position
 * in quiet positions near the leaves of the search tree. If the static
 * evaluation + a margin is still below alpha, we can safely prune.
 * 
 * Benefits:
 * - 20-40% node reduction in late game
 * - Faster search with minimal accuracy loss
 * - Most effective at depths 1-3
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Evaluator } from '../evaluation/Evaluator';
import { isInCheck } from '../move-generation/LegalityChecker';
import { Move, MoveFlags } from '../types/Move.types';

/**
 * Configuration for futility pruning
 */
export interface FutilityPruningConfig {
  /** Enable futility pruning */
  enabled: boolean;
  /** Futility margin per depth (in centipawns) */
  margins: number[];
  /** Maximum depth to apply futility pruning */
  maxDepth: number;
  /** Don't prune in check */
  skipInCheck: boolean;
  /** Don't prune PV nodes */
  skipPvNodes: boolean;
}

/**
 * Default configuration with tuned margins
 */
const DEFAULT_CONFIG: FutilityPruningConfig = {
  enabled: true,
  margins: [
    0,    // Depth 0 (not used)
    100,  // Depth 1: 1 pawn
    200,  // Depth 2: 2 pawns
    300,  // Depth 3: 3 pawns
  ],
  maxDepth: 3,
  skipInCheck: true,
  skipPvNodes: true,
};

/**
 * Futility pruning statistics
 */
interface FutilityStats {
  totalChecks: number;
  pruned: number;
  notPruned: number;
  prunedByDepth: Map<number, number>;
  savedNodes: number;
}

/**
 * Manages futility pruning in search.
 */
export class FutilityPruning {
  private config: FutilityPruningConfig;
  private evaluator: Evaluator;
  private statistics: FutilityStats;

  constructor(evaluator: Evaluator, config: Partial<FutilityPruningConfig> = {}) {
    this.evaluator = evaluator;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.statistics = this.createEmptyStats();
  }

  private createEmptyStats(): FutilityStats {
    return {
      totalChecks: 0,
      pruned: 0,
      notPruned: 0,
      prunedByDepth: new Map(),
      savedNodes: 0,
    };
  }

  /**
   * Check if a position is futile and can be pruned.
   * 
   * @param board Current board position
   * @param state Current game state
   * @param depth Remaining depth
   * @param alpha Alpha bound
   * @param beta Beta bound (unused but kept for future extensions)
   * @param isPvNode Is this a PV node?
   * @returns True if position can be pruned
   */
  canPrune(
    board: Board,
    state: GameState,
    depth: number,
    alpha: number,
    _beta: number,
    isPvNode: boolean = false
  ): boolean {
    this.statistics.totalChecks++;

    // Feature disabled
    if (!this.config.enabled) {
      this.statistics.notPruned++;
      return false;
    }

    // Too deep
    if (depth > this.config.maxDepth || depth <= 0) {
      this.statistics.notPruned++;
      return false;
    }

    // Skip PV nodes
    if (isPvNode && this.config.skipPvNodes) {
      this.statistics.notPruned++;
      return false;
    }

    // Skip in check
    if (this.config.skipInCheck && isInCheck(board, state.currentPlayer)) {
      this.statistics.notPruned++;
      return false;
    }

    // Get static evaluation
    const staticEval = this.evaluator.evaluate(board, state);

    // Get futility margin for this depth
    const margin = this.getFutilityMargin(depth);

    // Futility condition: static eval + margin <= alpha
    const futile = staticEval + margin <= alpha;

    if (futile) {
      this.statistics.pruned++;
      const currentCount = this.statistics.prunedByDepth.get(depth) ?? 0;
      this.statistics.prunedByDepth.set(depth, currentCount + 1);
      
      // Estimate nodes saved (rough approximation)
      this.statistics.savedNodes += this.estimateSavedNodes(depth);
    } else {
      this.statistics.notPruned++;
    }

    return futile;
  }

  /**
   * Check if a specific move can be futility pruned.
   * Used for move-level pruning (more conservative).
   * 
   * @param board Current board
   * @param state Current state
   * @param move Move to check
   * @param depth Remaining depth
   * @param alpha Alpha bound
   * @param beta Beta bound
   * @param staticEval Static evaluation (if already computed)
   * @returns True if move can be pruned
   */
  canPruneMove(
    board: Board,
    state: GameState,
    move: Move,
    depth: number,
    alpha: number,
    _beta: number,
    staticEval?: number
  ): boolean {
    // Don't prune tactical moves
    if (this.isTacticalMove(move)) {
      return false;
    }

    // Use position-level futility check
    const eval_value = staticEval ?? this.evaluator.evaluate(board, state);
    const margin = this.getFutilityMargin(depth);

    return eval_value + margin <= alpha;
  }

  /**
   * Check if move is tactical (capture, promotion, etc).
   * 
   * @param move Move to check
   * @returns True if tactical
   */
  private isTacticalMove(move: Move): boolean {
    return !!(
      move.flags & MoveFlags.Capture ||
      move.flags & MoveFlags.Promotion ||
      move.flags & MoveFlags.EnPassant
    );
  }

  /**
   * Get futility margin for a given depth.
   * 
   * @param depth Depth
   * @returns Margin in centipawns
   */
  getFutilityMargin(depth: number): number {
    if (depth <= 0 || depth >= this.config.margins.length) {
      // Use last margin for deeper depths (shouldn't happen if maxDepth set correctly)
      return this.config.margins[this.config.margins.length - 1] ?? 300;
    }
    return this.config.margins[depth] ?? 0;
  }

  /**
   * Estimate nodes saved by pruning at this depth.
   * 
   * @param depth Depth
   * @returns Estimated nodes
   */
  private estimateSavedNodes(depth: number): number {
    // Rough branching factor of 35
    const branchingFactor = 35;
    return Math.pow(branchingFactor, depth);
  }

  /**
   * Get pruning statistics.
   * 
   * @returns Statistics object
   */
  getStatistics(): {
    totalChecks: number;
    pruned: number;
    notPruned: number;
    pruneRate: number;
    prunedByDepth: { depth: number; count: number }[];
    savedNodes: number;
  } {
    const pruneRate =
      this.statistics.totalChecks > 0
        ? this.statistics.pruned / this.statistics.totalChecks
        : 0;

    const prunedByDepth = Array.from(this.statistics.prunedByDepth.entries())
      .map(([depth, count]) => ({ depth, count }))
      .sort((a, b) => a.depth - b.depth);

    return {
      totalChecks: this.statistics.totalChecks,
      pruned: this.statistics.pruned,
      notPruned: this.statistics.notPruned,
      pruneRate,
      prunedByDepth,
      savedNodes: this.statistics.savedNodes,
    };
  }

  /**
   * Reset statistics.
   */
  resetStatistics(): void {
    this.statistics = this.createEmptyStats();
  }

  /**
   * Get current configuration.
   * 
   * @returns Current config
   */
  getConfig(): Readonly<FutilityPruningConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration.
   * 
   * @param config Partial config to update
   */
  updateConfig(config: Partial<FutilityPruningConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update futility margins.
   * 
   * @param margins New margins array
   */
  setMargins(margins: number[]): void {
    this.config.margins = [...margins];
  }

  /**
   * Enable futility pruning.
   */
  enable(): void {
    this.config.enabled = true;
  }

  /**
   * Disable futility pruning.
   */
  disable(): void {
    this.config.enabled = false;
  }

  /**
   * Check if pruning is enabled.
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Format statistics for display.
   * 
   * @returns Formatted string
   */
  formatStatistics(): string {
    const stats = this.getStatistics();
    const lines: string[] = [
      'Futility Pruning Statistics:',
      `  Total Checks: ${stats.totalChecks}`,
      `  Pruned: ${stats.pruned}`,
      `  Not Pruned: ${stats.notPruned}`,
      `  Prune Rate: ${(stats.pruneRate * 100).toFixed(1)}%`,
      `  Estimated Nodes Saved: ${stats.savedNodes.toLocaleString()}`,
    ];

    if (stats.prunedByDepth.length > 0) {
      lines.push('  Pruned by Depth:');
      stats.prunedByDepth.forEach(({ depth, count }) => {
        lines.push(`    Depth ${depth}: ${count}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Check if conditions are right for futility pruning.
   * This is a pre-check before the full canPrune() call.
   * 
   * @param depth Depth
   * @param inCheck Is king in check?
   * @param isPvNode Is PV node?
   * @returns True if conditions allow pruning
   */
  conditionsAllowPruning(
    depth: number,
    inCheck: boolean,
    isPvNode: boolean
  ): boolean {
    if (!this.config.enabled) return false;
    if (depth > this.config.maxDepth || depth <= 0) return false;
    if (isPvNode && this.config.skipPvNodes) return false;
    if (inCheck && this.config.skipInCheck) return false;
    return true;
  }
}
