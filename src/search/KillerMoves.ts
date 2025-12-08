/**
 * @file KillerMoves.ts
 * @description Killer move heuristic for move ordering
 * 
 * Killer moves are non-capture moves that caused beta cutoffs at the same ply
 * in other branches of the search tree. These moves are likely to be good in
 * similar positions, so we try them early in move ordering.
 * 
 * Benefits:
 * - Improves move ordering without hash table
 * - 10-20% node reduction
 * - Very fast lookup (constant time)
 */

import { Move } from '../types/Move.types';

/**
 * Maximum number of killer moves to store per ply
 */
const KILLERS_PER_PLY = 2;

/**
 * Manages killer moves for move ordering optimization.
 */
export class KillerMoves {
  private killers: (Move | null)[][];
  private maxPly: number;

  constructor(maxPly: number = 64) {
    this.maxPly = maxPly;
    this.killers = [];

    // Initialize killer array
    for (let ply = 0; ply < maxPly; ply++) {
      this.killers[ply] = new Array(KILLERS_PER_PLY).fill(null);
    }
  }

  /**
   * Store a killer move at a specific ply.
   * 
   * @param move Move that caused beta cutoff
   * @param ply Current ply depth
   */
  store(move: Move, ply: number): void {
    if (ply >= this.maxPly) return;

    const killerRow = this.killers[ply];
    if (!killerRow) return;

    // Don't store if it's already the primary killer
    if (this.isSameMove(killerRow[0] ?? null, move)) return;

    // Shift killers: move secondary to position 1, store new as primary
    killerRow[1] = killerRow[0] ?? null;
    killerRow[0] = move;
  }

  /**
   * Check if a move is a killer move at a specific ply.
   * 
   * @param move Move to check
   * @param ply Current ply depth
   * @returns True if move is a killer at this ply
   */
  isKiller(move: Move, ply: number): boolean {
    if (ply >= this.maxPly) return false;

    const killerRow = this.killers[ply];
    if (!killerRow) return false;

    return (
      this.isSameMove(killerRow[0] ?? null, move) ||
      this.isSameMove(killerRow[1] ?? null, move)
    );
  }

  /**
   * Get killer move score for move ordering.
   * Primary killer gets higher score than secondary.
   * 
   * @param move Move to score
   * @param ply Current ply depth
   * @returns Killer score (0 if not a killer)
   */
  getKillerScore(move: Move, ply: number): number {
    if (ply >= this.maxPly) return 0;

    const killerRow = this.killers[ply];
    if (!killerRow) return 0;

    if (this.isSameMove(killerRow[0] ?? null, move)) {
      return 9000; // Primary killer
    }
    if (this.isSameMove(killerRow[1] ?? null, move)) {
      return 8000; // Secondary killer
    }

    return 0;
  }

  /**
   * Get all killer moves at a specific ply.
   * 
   * @param ply Current ply depth
   * @returns Array of killer moves (may contain nulls)
   */
  getKillers(ply: number): (Move | null)[] {
    if (ply >= this.maxPly) return [];
    return [...(this.killers[ply] ?? [])];
  }

  /**
   * Clear all killer moves (typically at start of new search).
   */
  clear(): void {
    for (let ply = 0; ply < this.maxPly; ply++) {
      const row = this.killers[ply];
      if (row) {
        row.fill(null);
      }
    }
  }

  /**
   * Clear killer moves at a specific ply.
   * 
   * @param ply Ply to clear
   */
  clearPly(ply: number): void {
    if (ply < this.maxPly) {
      const row = this.killers[ply];
      if (row) {
        row.fill(null);
      }
    }
  }

  /**
   * Check if two moves are the same (same from/to squares).
   * 
   * @param move1 First move
   * @param move2 Second move
   * @returns True if moves are the same
   */
  private isSameMove(move1: Move | null, move2: Move | null): boolean {
    if (!move1 || !move2) return false;
    return move1.from === move2.from && move1.to === move2.to;
  }

  /**
   * Get statistics about killer move usage.
   * 
   * @returns Statistics object
   */
  getStats(): { totalKillers: number; pliesWithKillers: number } {
    let totalKillers = 0;
    let pliesWithKillers = 0;

    for (let ply = 0; ply < this.maxPly; ply++) {
      const row = this.killers[ply];
      if (!row) continue;

      let plyHasKillers = false;
      for (const killer of row) {
        if (killer !== null) {
          totalKillers++;
          plyHasKillers = true;
        }
      }
      if (plyHasKillers) pliesWithKillers++;
    }

    return { totalKillers, pliesWithKillers };
  }

  /**
   * Age killer moves (optionally reduce their relevance over time).
   * For now, just clear all since we clear between searches anyway.
   */
  age(): void {
    // Could implement aging by shifting or reducing scores
    // For simplicity, we just clear on new search
    this.clear();
  }
}
