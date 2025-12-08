/**
 * @file PrincipalVariationSearch.ts
 * @description Principal Variation Search (PVS) optimization for alpha-beta
 */

import { Move } from '../types/Move.types';

/**
 * Configuration for Principal Variation Search.
 */
export interface PVSConfig {
  /** Enable PVS */
  enabled: boolean;
  /** Minimum depth to use PVS */
  minDepth: number;
  /** Use zero-window search for non-PV nodes */
  useZeroWindow: boolean;
}

const DEFAULT_CONFIG: PVSConfig = {
  enabled: true,
  minDepth: 2,
  useZeroWindow: true,
};

/**
 * Node type in search tree.
 */
export enum NodeType {
  /** PV node - part of principal variation */
  PV = 'pv',
  /** All node - all children searched (fail-low) */
  All = 'all',
  /** Cut node - beta cutoff occurred (fail-high) */
  Cut = 'cut',
}

/**
 * Statistics for Principal Variation Search.
 */
export interface PVSStatistics {
  /** PV nodes searched */
  pvNodes: number;
  /** All nodes searched */
  allNodes: number;
  /** Cut nodes searched */
  cutNodes: number;
  /** Zero window searches */
  zeroWindowSearches: number;
  /** Zero window re-searches */
  zeroWindowResearches: number;
  /** Research rate */
  researchRate: number;
}

/**
 * Search result from PVS.
 */
export interface PVSResult {
  /** Search score */
  score: number;
  /** Best move found */
  bestMove: Move | null;
  /** Node type */
  nodeType: NodeType;
  /** Whether a research was needed */
  researched: boolean;
}

/**
 * Manages Principal Variation Search.
 * Optimizes alpha-beta by doing zero-window searches on non-PV nodes.
 */
export class PrincipalVariationSearch {
  private config: PVSConfig;
  private statistics: {
    pvNodes: number;
    allNodes: number;
    cutNodes: number;
    zeroWindowSearches: number;
    zeroWindowResearches: number;
  };

  constructor(config: Partial<PVSConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.statistics = {
      pvNodes: 0,
      allNodes: 0,
      cutNodes: 0,
      zeroWindowSearches: 0,
      zeroWindowResearches: 0,
    };
  }

  /**
   * Determine if PVS should be used at this depth.
   * 
   * @param depth Current search depth
   * @returns True if should use PVS
   */
  shouldUsePVS(depth: number): boolean {
    return this.config.enabled && depth >= this.config.minDepth;
  }

  /**
   * Get search window for a move.
   * First move gets full window, rest get zero window.
   * 
   * @param alpha Current alpha
   * @param beta Current beta
   * @param isPVNode Whether this is a PV node
   * @param isFirstMove Whether this is the first move searched
   * @returns Alpha and beta for this move's search
   */
  getSearchWindow(
    alpha: number,
    beta: number,
    isPVNode: boolean,
    isFirstMove: boolean
  ): { searchAlpha: number; searchBeta: number; isZeroWindow: boolean } {
    // PVS disabled
    if (!this.config.enabled) {
      return {
        searchAlpha: alpha,
        searchBeta: beta,
        isZeroWindow: false,
      };
    }

    // First move always gets full window
    if (isFirstMove) {
      return {
        searchAlpha: alpha,
        searchBeta: beta,
        isZeroWindow: false,
      };
    }

    // PV nodes: subsequent moves get zero window for scout
    if (isPVNode && this.config.useZeroWindow) {
      this.statistics.zeroWindowSearches++;
      return {
        searchAlpha: alpha,
        searchBeta: alpha + 1, // Zero window
        isZeroWindow: true,
      };
    }

    // Non-PV nodes: use full window
    return {
      searchAlpha: alpha,
      searchBeta: beta,
      isZeroWindow: false,
    };
  }

  /**
   * Determine if research is needed after zero-window search.
   * Research is needed if zero-window search returned score > alpha.
   * 
   * @param score Score from zero-window search
   * @param alpha Current alpha
   * @param beta Current beta
   * @returns True if research needed
   */
  needsResearch(score: number, alpha: number, beta: number): boolean {
    // Score improved alpha in zero-window search
    const needsResearch = score > alpha && score < beta;

    if (needsResearch) {
      this.statistics.zeroWindowResearches++;
    }

    return needsResearch;
  }

  /**
   * Record node type based on search result.
   * 
   * @param score Final score
   * @param alpha Original alpha
   * @param beta Original beta
   * @param isPVNode Whether this is a PV node
   * @returns Node type
   */
  recordNodeType(
    score: number,
    alpha: number,
    beta: number,
    _isPVNode: boolean
  ): NodeType {
    let nodeType: NodeType;

    if (score >= beta) {
      // Beta cutoff
      nodeType = NodeType.Cut;
      this.statistics.cutNodes++;
    } else if (score > alpha) {
      // Score improved alpha
      nodeType = NodeType.PV;
      this.statistics.pvNodes++;
    } else {
      // All moves searched, none improved alpha
      nodeType = NodeType.All;
      this.statistics.allNodes++;
    }

    return nodeType;
  }

  /**
   * Check if node is expected to be a PV node.
   * First child of PV node is expected to be PV.
   * 
   * @param parentIsPV Whether parent is PV node
   * @param isFirstMove Whether this is first move
   * @returns True if expected to be PV
   */
  isExpectedPVNode(parentIsPV: boolean, isFirstMove: boolean): boolean {
    return parentIsPV && isFirstMove;
  }

  /**
   * Get PVS statistics.
   * 
   * @returns Statistics object
   */
  getStatistics(): PVSStatistics {
    return {
      pvNodes: this.statistics.pvNodes,
      allNodes: this.statistics.allNodes,
      cutNodes: this.statistics.cutNodes,
      zeroWindowSearches: this.statistics.zeroWindowSearches,
      zeroWindowResearches: this.statistics.zeroWindowResearches,
      researchRate:
        this.statistics.zeroWindowSearches > 0
          ? this.statistics.zeroWindowResearches /
            this.statistics.zeroWindowSearches
          : 0,
    };
  }

  /**
   * Clear statistics.
   */
  clearStatistics(): void {
    this.statistics.pvNodes = 0;
    this.statistics.allNodes = 0;
    this.statistics.cutNodes = 0;
    this.statistics.zeroWindowSearches = 0;
    this.statistics.zeroWindowResearches = 0;
  }

  /**
   * Update configuration.
   * 
   * @param config Partial configuration to update
   */
  updateConfig(config: Partial<PVSConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   * 
   * @returns Current configuration
   */
  getConfig(): Readonly<PVSConfig> {
    return { ...this.config };
  }

  /**
   * Calculate expected node type distribution for debugging.
   * In a well-ordered search:
   * - ~85% Cut nodes (beta cutoff on first move)
   * - ~10% All nodes (no moves improve alpha)
   * - ~5% PV nodes (score in window)
   * 
   * @returns Expected distribution
   */
  getExpectedDistribution(): { cut: number; all: number; pv: number } {
    return {
      cut: 0.85,
      all: 0.1,
      pv: 0.05,
    };
  }

  /**
   * Get actual node type distribution.
   * 
   * @returns Actual distribution
   */
  getActualDistribution(): { cut: number; all: number; pv: number } {
    const total =
      this.statistics.pvNodes +
      this.statistics.allNodes +
      this.statistics.cutNodes;

    if (total === 0) {
      return { cut: 0, all: 0, pv: 0 };
    }

    return {
      cut: this.statistics.cutNodes / total,
      all: this.statistics.allNodes / total,
      pv: this.statistics.pvNodes / total,
    };
  }
}
