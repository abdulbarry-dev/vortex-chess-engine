/**
 * @file Search.types.ts
 * @description Type definitions for search-related structures
 */

import { Move } from './Move.types';

/**
 * Result of a search operation
 */
export interface SearchResult {
  bestMove: Move | null;
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
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
