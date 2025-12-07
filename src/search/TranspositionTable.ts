/**
 * @file TranspositionTable.ts
 * @description Hash table for caching position evaluations
 * 
 * The transposition table stores previously evaluated positions
 * to avoid re-searching the same position multiple times.
 */

import { TT_SIZE_MB } from '../constants/SearchConstants';
import { Move } from '../types/Move.types';
import { TTEntry, TTEntryType } from '../types/Search.types';

/**
 * Transposition table
 * 
 * Uses Zobrist hashing to identify positions uniquely.
 * Replacement scheme: always replace if deeper or same depth and newer.
 */
export class TranspositionTable {
  private table: (TTEntry | null)[];
  private size: number;
  private age: number = 0;

  constructor(sizeMB: number = TT_SIZE_MB) {
    // Calculate number of entries based on size
    // Each entry is approximately 48 bytes
    const bytesPerEntry = 48;
    const totalBytes = sizeMB * 1024 * 1024;
    this.size = Math.floor(totalBytes / bytesPerEntry);

    // Make size a power of 2 for efficient modulo with bitwise AND
    this.size = 1 << Math.floor(Math.log2(this.size));

    this.table = new Array(this.size).fill(null);
  }

  /**
   * Store an entry in the table
   * 
   * @param key Zobrist hash key
   * @param depth Search depth
   * @param score Evaluation score
   * @param type Entry type (exact, alpha, beta)
   * @param bestMove Best move from this position
   */
  store(
    key: bigint,
    depth: number,
    score: number,
    type: TTEntryType,
    bestMove: Move | null = null
  ): void {
    const index = this.getIndex(key);
    const existing = this.table[index];

    // Replacement scheme:
    // 1. Empty slot - always replace
    // 2. Same position - always replace if depth >= existing
    // 3. Different position - replace if depth > existing or age is old
    
    if (existing === undefined || existing === null) {
      // Empty slot - always replace
      this.table[index] = {
        zobristKey: key,
        depth,
        score,
        flag: this.typeToFlag(type),
        bestMove: bestMove || undefined,
        age: this.age,
      };
      return;
    }
    
    const shouldReplace =
      existing.zobristKey === key ||
      depth > existing.depth ||
      (depth === existing.depth && this.age > existing.age);

    if (shouldReplace) {
      this.table[index] = {
        zobristKey: key,
        depth,
        score,
        flag: this.typeToFlag(type),
        bestMove: bestMove || undefined,
        age: this.age,
      };
    }
  }

  /**
   * Probe the table for an entry
   * 
   * @param key Zobrist hash key
   * @returns Entry if found, null otherwise
   */
  probe(key: bigint): TTEntry | null {
    const index = this.getIndex(key);
    const entry = this.table[index];

    // Verify it's the correct position (handle hash collisions)
    if (entry && entry.zobristKey === key) {
      return entry;
    }

    return null;
  }

  /**
   * Get best move from table
   */
  getBestMove(key: bigint): Move | undefined {
    const entry = this.probe(key);
    return entry?.bestMove;
  }

  /**
   * Check if we can use this entry's score
   * 
   * @param entry Table entry
   * @param depth Current search depth
   * @param alpha Current alpha
   * @param beta Current beta
   * @returns Score if usable, null otherwise
   */
  getScore(
    entry: TTEntry,
    depth: number,
    alpha: number,
    beta: number
  ): number | null {
    // Entry must be from at least as deep a search
    if (entry.depth < depth) {
      return null;
    }

    // Check entry flag
    switch (entry.flag) {
      case 'exact':
        // Exact score - always usable
        return entry.score;

      case 'upperbound':
        // Upperbound - score was <= alpha
        if (entry.score <= alpha) {
          return entry.score;
        }
        break;

      case 'lowerbound':
        // Lowerbound - score was >= beta (cutoff)
        if (entry.score >= beta) {
          return entry.score;
        }
        break;
    }

    return null;
  }

  /**
   * Increment age (call at start of new search)
   */
  incrementAge(): void {
    this.age++;
  }

  /**
   * Clear the table
   */
  clear(): void {
    this.table.fill(null);
    this.age = 0;
  }

  /**
   * Get table statistics
   */
  getStats(): { size: number; filled: number; fillRate: number } {
    const filled = this.table.filter(e => e !== null).length;
    return {
      size: this.size,
      filled,
      fillRate: filled / this.size,
    };
  }

  /**
   * Get index from key (bitwise AND for fast modulo)
   */
  private getIndex(key: bigint): number {
    return Number(key & BigInt(this.size - 1));
  }

  /**
   * Convert TTEntryType to flag string
   */
  private typeToFlag(type: TTEntryType): 'exact' | 'lowerbound' | 'upperbound' {
    switch (type) {
      case TTEntryType.Exact:
        return 'exact';
      case TTEntryType.Alpha:
        return 'upperbound';
      case TTEntryType.Beta:
        return 'lowerbound';
    }
  }
}
