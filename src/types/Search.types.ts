/**
 * @file Search.types.ts
 * @description Type definitions for search-related structures
 */

import { Move } from './Move.types';

/**
 * Result of a search operation
 */
export interface SearchResult {
  move: Move | null; // Alias for bestMove
  bestMove: Move | null;
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
  pv: Move[];
  isMate: boolean;
  mateIn?: number;
  stats: SearchStats; // Statistics about the search
}

/**
 * Search statistics for debugging
 */
export interface SearchStats {
  nodesSearched: number; // Total nodes searched
  nodes: number; // Alias for nodesSearched
  nodesByDepth: number[];
  ttHits: number;
  ttMisses: number;
  betaCutoffs: number;
  quiescenceNodes: number;
  timeMs: number;
  nodesPerSecond: number; // Nodes per second
}

/**
 * Search configuration
 */
export interface SearchConfig {
  maxDepth: number;
  timeLimitMs?: number;
  useIterativeDeepening: boolean;
  useTranspositionTable: boolean;
  useQuiescence: boolean;
  useMoveOrdering: boolean;
}

/**
 * Transposition table entry types
 */
export enum TTEntryType {
  Exact = 0,
  Alpha = 1,
  Beta = 2,
}

/**
 * Transposition table entry
 */
export interface TTEntry {
  zobristKey: bigint;
  depth: number;
  score: number;
  flag: 'exact' | 'lowerbound' | 'upperbound';
  bestMove?: Move;
  age: number;
}

/**
 * Search statistics
 */
export interface SearchInfo {
  nodesSearched: number;
  depth: number;
  timeElapsed: number;
  currentMove?: Move;
}
