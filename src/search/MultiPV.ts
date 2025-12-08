/**
 * @file MultiPV.ts
 * @description Multi-PV (Principal Variation) support for analysis
 * 
 * Multi-PV allows the engine to track and display multiple best lines
 * simultaneously. This is primarily used for analysis mode where users
 * want to see alternative variations.
 * 
 * Benefits:
 * - Better analysis experience
 * - Shows alternative plans
 * - Helps understand position complexity
 * - UCI "MultiPV" option support
 */

import { Move } from '../types/Move.types';
import { toUci } from '../utils/MoveNotation';

/**
 * Information about a principal variation
 */
export interface PVInfo {
  /** Variation number (1 = best, 2 = second best, etc.) */
  index: number;
  /** Score in centipawns */
  score: number;
  /** Depth searched */
  depth: number;
  /** Selective depth (max ply reached) */
  selectiveDepth: number;
  /** Principal variation moves */
  pv: Move[];
  /** PV in algebraic notation */
  pvString: string;
  /** Nodes searched for this PV */
  nodes: number;
  /** Time spent (ms) */
  time: number;
}

/**
 * Configuration for Multi-PV
 */
export interface MultiPVConfig {
  /** Number of variations to track (1 = normal search) */
  numPV: number;
  /** Maximum number of variations */
  maxPV: number;
}

const DEFAULT_CONFIG: MultiPVConfig = {
  numPV: 1,
  maxPV: 10,
};

/**
 * Manages multiple principal variations.
 */
export class MultiPV {
  private config: MultiPVConfig;
  private variations: PVInfo[];
  private excludedMoves: Set<string>; // Track excluded root moves

  constructor(config: Partial<MultiPVConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.variations = [];
    this.excludedMoves = new Set();
  }

  /**
   * Initialize for a new search.
   */
  initialize(): void {
    this.variations = [];
    this.excludedMoves.clear();
  }

  /**
   * Add a principal variation.
   * 
   * @param pvInfo Variation information
   */
  addVariation(pvInfo: Omit<PVInfo, 'index' | 'pvString'>): void {
    const index = this.variations.length + 1;

    // Generate PV string
    const pvString = pvInfo.pv.map(move => this.moveToString(move)).join(' ');

    const fullPVInfo: PVInfo = {
      ...pvInfo,
      index,
      pvString,
    };

    this.variations.push(fullPVInfo);

    // Sort by score (best first)
    this.variations.sort((a, b) => b.score - a.score);

    // Re-index after sorting
    this.variations.forEach((pv, idx) => {
      pv.index = idx + 1;
    });

    // Trim if exceeding numPV
    if (this.variations.length > this.config.numPV) {
      this.variations = this.variations.slice(0, this.config.numPV);
    }

    // Add first move to excluded list for next iteration
    if (pvInfo.pv.length > 0) {
      const firstMove = pvInfo.pv[0];
      if (firstMove) {
        this.excludedMoves.add(this.moveToKey(firstMove));
      }
    }
  }

  /**
   * Update an existing variation.
   * 
   * @param index Variation index (1-based)
   * @param updates Updates to apply
   */
  updateVariation(
    index: number,
    updates: Partial<Omit<PVInfo, 'index' | 'pvString'>>
  ): void {
    const variation = this.variations[index - 1];
    if (!variation) return;

    Object.assign(variation, updates);

    // Regenerate PV string if PV changed
    if (updates.pv) {
      variation.pvString = updates.pv.map(move => this.moveToString(move)).join(' ');
    }

    // Re-sort if score changed
    if (updates.score !== undefined) {
      this.variations.sort((a, b) => b.score - a.score);
      this.variations.forEach((pv, idx) => {
        pv.index = idx + 1;
      });
    }
  }

  /**
   * Get all variations.
   * 
   * @returns Array of variations
   */
  getVariations(): readonly PVInfo[] {
    return [...this.variations];
  }

  /**
   * Get a specific variation.
   * 
   * @param index Variation index (1-based)
   * @returns Variation or undefined
   */
  getVariation(index: number): PVInfo | undefined {
    return this.variations[index - 1];
  }

  /**
   * Get the best variation.
   * 
   * @returns Best variation or undefined
   */
  getBestVariation(): PVInfo | undefined {
    return this.variations[0];
  }

  /**
   * Get excluded moves for next iteration.
   * 
   * @returns Set of move keys
   */
  getExcludedMoves(): ReadonlySet<string> {
    return this.excludedMoves;
  }

  /**
   * Check if a move should be excluded.
   * 
   * @param move Move to check
   * @returns True if excluded
   */
  isExcluded(move: Move): boolean {
    return this.excludedMoves.has(this.moveToKey(move));
  }

  /**
   * Get number of variations to track.
   * 
   * @returns Number of PVs
   */
  getNumPV(): number {
    return this.config.numPV;
  }

  /**
   * Set number of variations to track.
   * 
   * @param numPV Number of PVs (1-maxPV)
   */
  setNumPV(numPV: number): void {
    this.config.numPV = Math.max(1, Math.min(numPV, this.config.maxPV));

    // Trim variations if reducing numPV
    if (this.variations.length > this.config.numPV) {
      this.variations = this.variations.slice(0, this.config.numPV);
    }
  }

  /**
   * Check if currently in Multi-PV mode.
   * 
   * @returns True if numPV > 1
   */
  isMultiPVMode(): boolean {
    return this.config.numPV > 1;
  }

  /**
   * Check if we need another iteration.
   * 
   * @returns True if more variations needed
   */
  needsAnotherIteration(): boolean {
    return this.variations.length < this.config.numPV;
  }

  /**
   * Get current iteration number.
   * 
   * @returns Current iteration (1-based)
   */
  getCurrentIteration(): number {
    return this.variations.length + 1;
  }

  /**
   * Format variations for UCI output.
   * 
   * @returns Array of UCI info strings
   */
  formatUCI(): string[] {
    return this.variations.map(pv => {
      const parts: string[] = [
        `info`,
        `depth ${pv.depth}`,
        `seldepth ${pv.selectiveDepth}`,
        `multipv ${pv.index}`,
        `score cp ${pv.score}`,
        `nodes ${pv.nodes}`,
        `time ${pv.time}`,
        `pv ${pv.pvString}`,
      ];
      return parts.join(' ');
    });
  }

  /**
   * Format variations for display.
   * 
   * @returns Formatted string
   */
  formatDisplay(): string {
    if (this.variations.length === 0) {
      return 'No variations';
    }

    const lines: string[] = ['Principal Variations:'];
    this.variations.forEach(pv => {
      const scoreStr = (pv.score / 100).toFixed(2);
      lines.push(
        `  ${pv.index}. ${scoreStr} (d${pv.depth}): ${pv.pvString}`
      );
    });

    return lines.join('\n');
  }

  /**
   * Convert move to string using UCI notation.
   * 
   * @param move Move
   * @returns Move string
   */
  private moveToString(move: Move): string {
    try {
      return toUci(move);
    } catch {
      return `${move.from}-${move.to}`;
    }
  }

  /**
   * Convert move to unique key for exclusion.
   * 
   * @param move Move
   * @returns Move key
   */
  private moveToKey(move: Move): string {
    return `${move.from}-${move.to}`;
  }

  /**
   * Clear all variations.
   */
  clear(): void {
    this.variations = [];
    this.excludedMoves.clear();
  }

  /**
   * Get statistics about variations.
   * 
   * @returns Statistics object
   */
  getStatistics(): {
    numVariations: number;
    totalNodes: number;
    avgDepth: number;
    scoreSpread: number;
  } {
    if (this.variations.length === 0) {
      return {
        numVariations: 0,
        totalNodes: 0,
        avgDepth: 0,
        scoreSpread: 0,
      };
    }

    const totalNodes = this.variations.reduce((sum, pv) => sum + pv.nodes, 0);
    const avgDepth =
      this.variations.reduce((sum, pv) => sum + pv.depth, 0) /
      this.variations.length;

    const scores = this.variations.map(pv => pv.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const scoreSpread = maxScore - minScore;

    return {
      numVariations: this.variations.length,
      totalNodes,
      avgDepth,
      scoreSpread,
    };
  }

  /**
   * Export variations for analysis or persistence.
   * 
   * @returns Serializable variation data
   */
  export(): PVInfo[] {
    return this.variations.map(pv => ({ ...pv }));
  }

  /**
   * Import variations from saved data.
   * 
   * @param variations Variation data
   */
  import(variations: PVInfo[]): void {
    this.variations = variations
      .map(pv => ({ ...pv }))
      .slice(0, this.config.numPV);

    // Re-sort and re-index
    this.variations.sort((a, b) => b.score - a.score);
    this.variations.forEach((pv, idx) => {
      pv.index = idx + 1;
    });

    // Rebuild excluded moves
    this.excludedMoves.clear();
    this.variations.forEach(pv => {
      if (pv.pv.length > 0) {
        const firstMove = pv.pv[0];
        if (firstMove) {
          this.excludedMoves.add(this.moveToKey(firstMove));
        }
      }
    });
  }

  /**
   * Get configuration.
   * 
   * @returns Current config
   */
  getConfig(): Readonly<MultiPVConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration.
   * 
   * @param config Partial config
   */
  updateConfig(config: Partial<MultiPVConfig>): void {
    this.config = { ...this.config, ...config };

    // Clamp numPV
    this.config.numPV = Math.max(1, Math.min(this.config.numPV, this.config.maxPV));

    // Trim variations if needed
    if (this.variations.length > this.config.numPV) {
      this.variations = this.variations.slice(0, this.config.numPV);
    }
  }
}
