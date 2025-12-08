/**
 * @file CheckExtensions.ts
 * @description Search extension when king is in check
 * 
 * When the king is in check, we extend the search by 1 ply to ensure
 * we properly evaluate the tactical consequences. This prevents the
 * horizon effect where forced sequences are cut off prematurely.
 * 
 * Benefits:
 * - Better tactical play (+30-50 Elo)
 * - Avoids missing forced mates
 * - More accurate evaluation in sharp positions
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { isInCheck } from '../move-generation/LegalityChecker';

/**
 * Configuration for check extensions
 */
export interface CheckExtensionConfig {
  /** Enable check extensions */
  enabled: boolean;
  /** Extension amount in plies (typically 1) */
  extensionPly: number;
  /** Maximum cumulative extensions allowed per line */
  maxExtensions: number;
  /** Extend only if depth >= minDepth */
  minDepth: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CheckExtensionConfig = {
  enabled: true,
  extensionPly: 1,
  maxExtensions: 16,
  minDepth: 2,
};

/**
 * Tracks extension state during search
 */
export interface ExtensionState {
  /** Total extensions in current line */
  totalExtensions: number;
  /** Extensions at each ply */
  extensionsAtPly: number[];
}

/**
 * Manages check extensions in search.
 */
export class CheckExtensions {
  private config: CheckExtensionConfig;
  private statistics: {
    totalExtensions: number;
    extensionsByPly: Map<number, number>;
    checksEvaluated: number;
    extensionsDenied: number;
  };

  constructor(config: Partial<CheckExtensionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.statistics = {
      totalExtensions: 0,
      extensionsByPly: new Map(),
      checksEvaluated: 0,
      extensionsDenied: 0,
    };
  }

  /**
   * Determine if search should be extended due to check.
   * 
   * @param board Current board position
   * @param state Current game state
   * @param depth Current search depth
   * @param ply Current ply from root
   * @param extensionState Current extension state
   * @returns Extension amount (0 = no extension, 1 = extend by 1 ply)
   */
  shouldExtend(
    board: Board,
    state: GameState,
    depth: number,
    ply: number,
    extensionState: ExtensionState
  ): number {
    // Feature disabled
    if (!this.config.enabled) {
      return 0;
    }

    // Too shallow
    if (depth < this.config.minDepth) {
      return 0;
    }

    // Check if king is in check
    const inCheck = isInCheck(board, state.currentPlayer);
    this.statistics.checksEvaluated++;

    if (!inCheck) {
      return 0;
    }

    // Check extension limits
    if (extensionState.totalExtensions >= this.config.maxExtensions) {
      this.statistics.extensionsDenied++;
      return 0;
    }

    // Extend!
    extensionState.totalExtensions++;
    this.statistics.totalExtensions++;
    const currentCount = this.statistics.extensionsByPly.get(ply) ?? 0;
    this.statistics.extensionsByPly.set(ply, currentCount + 1);

    return this.config.extensionPly;
  }

  /**
   * Create initial extension state for a new search.
   * 
   * @param maxPly Maximum ply depth
   * @returns Initial extension state
   */
  createExtensionState(maxPly: number = 64): ExtensionState {
    return {
      totalExtensions: 0,
      extensionsAtPly: new Array(maxPly).fill(0),
    };
  }

  /**
   * Update extension state after extending.
   * 
   * @param state Extension state to update
   * @param ply Current ply
   * @param extension Extension amount
   * @returns Updated state
   */
  updateExtensionState(
    state: ExtensionState,
    ply: number,
    extension: number
  ): ExtensionState {
    if (extension > 0) {
      return {
        totalExtensions: state.totalExtensions + extension,
        extensionsAtPly: state.extensionsAtPly.map((count, i) =>
          i === ply ? count + extension : count
        ),
      };
    }
    return state;
  }

  /**
   * Check if extensions are available.
   * 
   * @param state Extension state
   * @returns True if more extensions allowed
   */
  canExtend(state: ExtensionState): boolean {
    return state.totalExtensions < this.config.maxExtensions;
  }

  /**
   * Get remaining extensions available.
   * 
   * @param state Extension state
   * @returns Number of extensions still available
   */
  getRemainingExtensions(state: ExtensionState): number {
    return Math.max(0, this.config.maxExtensions - state.totalExtensions);
  }

  /**
   * Get extension statistics.
   * 
   * @returns Statistics object
   */
  getStatistics(): {
    totalExtensions: number;
    extensionsByPly: { ply: number; count: number }[];
    checksEvaluated: number;
    extensionsDenied: number;
    extensionRate: number;
  } {
    const extensionsByPly = Array.from(this.statistics.extensionsByPly.entries())
      .map(([ply, count]) => ({ ply, count }))
      .sort((a, b) => a.ply - b.ply);

    const extensionRate =
      this.statistics.checksEvaluated > 0
        ? this.statistics.totalExtensions / this.statistics.checksEvaluated
        : 0;

    return {
      totalExtensions: this.statistics.totalExtensions,
      extensionsByPly,
      checksEvaluated: this.statistics.checksEvaluated,
      extensionsDenied: this.statistics.extensionsDenied,
      extensionRate,
    };
  }

  /**
   * Reset statistics.
   */
  resetStatistics(): void {
    this.statistics = {
      totalExtensions: 0,
      extensionsByPly: new Map(),
      checksEvaluated: 0,
      extensionsDenied: 0,
    };
  }

  /**
   * Get current configuration.
   * 
   * @returns Current config
   */
  getConfig(): Readonly<CheckExtensionConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration.
   * 
   * @param config Partial config to update
   */
  updateConfig(config: Partial<CheckExtensionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Enable check extensions.
   */
  enable(): void {
    this.config.enabled = true;
  }

  /**
   * Disable check extensions.
   */
  disable(): void {
    this.config.enabled = false;
  }

  /**
   * Check if extensions are enabled.
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get effective depth after extension.
   * 
   * @param originalDepth Original depth
   * @param extension Extension amount
   * @returns New depth
   */
  getExtendedDepth(originalDepth: number, extension: number): number {
    return originalDepth + extension;
  }

  /**
   * Format extension statistics for display.
   * 
   * @returns Formatted string
   */
  formatStatistics(): string {
    const stats = this.getStatistics();
    const lines: string[] = [
      'Check Extension Statistics:',
      `  Total Extensions: ${stats.totalExtensions}`,
      `  Checks Evaluated: ${stats.checksEvaluated}`,
      `  Extensions Denied: ${stats.extensionsDenied}`,
      `  Extension Rate: ${(stats.extensionRate * 100).toFixed(1)}%`,
    ];

    if (stats.extensionsByPly.length > 0) {
      lines.push('  Extensions by Ply:');
      stats.extensionsByPly.slice(0, 10).forEach(({ ply, count }) => {
        lines.push(`    Ply ${ply}: ${count}`);
      });
    }

    return lines.join('\n');
  }
}
