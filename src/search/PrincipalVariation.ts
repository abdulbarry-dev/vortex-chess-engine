/**
 * @file PrincipalVariation.ts
 * @description Manages principal variation (best line of play) tracking
 * 
 * The PV is the sequence of best moves found during search.
 * It's useful for:
 * - Displaying the expected continuation to the user
 * - Improving move ordering in subsequent searches
 * - Debugging search behavior
 */

import { Move } from '../types/Move.types';

/**
 * Stores and manages the principal variation (best line).
 * Uses triangular PV table for efficient storage.
 */
export class PrincipalVariation {
  private pvTable: (Move | null)[][];
  private pvLength: number[];
  private maxDepth: number;

  constructor(maxDepth: number = 64) {
    this.maxDepth = maxDepth;
    this.pvTable = [];
    this.pvLength = new Array(maxDepth).fill(0);

    // Initialize triangular array
    for (let i = 0; i < maxDepth; i++) {
      this.pvTable[i] = new Array(maxDepth).fill(null);
    }
  }

  /**
   * Update PV at a specific ply with a move.
   * Copies the PV from the next ply and prepends the current move.
   * 
   * @param ply Current ply depth
   * @param move Best move at this ply
   */
  update(ply: number, move: Move): void {
    if (ply >= this.maxDepth) return;

    this.pvTable[ply]![ply] = move;
    
    // Copy PV from next ply
    const nextLength = this.pvLength[ply + 1] ?? 0;
    for (let nextPly = ply + 1; nextPly < nextLength; nextPly++) {
      this.pvTable[ply]![nextPly] = this.pvTable[ply + 1]?.[nextPly] ?? null;
    }
    
    // Length is current ply + 1 + length of continuation
    this.pvLength[ply] = nextLength > ply ? nextLength : ply + 1;
  }

  /**
   * Clear PV at a specific ply (no move improves position).
   * 
   * @param ply Current ply depth
   */
  clear(ply: number): void {
    if (ply >= this.maxDepth) return;
    this.pvLength[ply] = ply;
  }

  /**
   * Get the principal variation from root.
   * 
   * @returns Array of moves representing the best line
   */
  getPV(): Move[] {
    const pv: Move[] = [];
    const length = this.pvLength[0] ?? 0;
    for (let i = 0; i < length; i++) {
      const move = this.pvTable[0]?.[i];
      if (move) {
        pv.push(move);
      }
    }
    return pv;
  }

  /**
   * Get PV as UCI move string (e.g., "e2e4 e7e5 g1f3").
   * 
   * @returns Space-separated UCI moves
   */
  getPVString(): string {
    const pv = this.getPV();
    return pv.map(move => {
      const fromFile = String.fromCharCode(97 + (move.from % 8));
      const fromRank = Math.floor(move.from / 8) + 1;
      const toFile = String.fromCharCode(97 + (move.to % 8));
      const toRank = Math.floor(move.to / 8) + 1;
      
      let uci = `${fromFile}${fromRank}${toFile}${toRank}`;
      
      // Add promotion piece if applicable
      if (move.promotion) {
        const promoChar = ['', 'p', 'n', 'b', 'r', 'q', 'k'][move.promotion];
        uci += promoChar;
      }
      
      return uci;
    }).join(' ');
  }

  /**
   * Get the length of the current PV.
   * 
   * @returns Number of moves in PV
   */
  getLength(): number {
    return this.pvLength[0] ?? 0;
  }

  /**
   * Get the first move in the PV (best move at root).
   * 
   * @returns Best move or null if no PV
   */
  getBestMove(): Move | null {
    const length = this.pvLength[0] ?? 0;
    if (length > 0) {
      return this.pvTable[0]?.[0] ?? null;
    }
    return null;
  }

  /**
   * Reset the PV table (typically done before new search).
   */
  reset(): void {
    for (let i = 0; i < this.maxDepth; i++) {
      this.pvLength[i] = 0;
      const row = this.pvTable[i];
      if (row) {
        for (let j = 0; j < this.maxDepth; j++) {
          row[j] = null;
        }
      }
    }
  }

  /**
   * Check if PV is valid at given ply.
   * 
   * @param ply Ply depth to check
   * @returns True if PV exists at this ply
   */
  isValid(ply: number): boolean {
    const length = this.pvLength[ply] ?? 0;
    return ply < this.maxDepth && length > ply;
  }

  /**
   * Get PV move at specific index.
   * 
   * @param index Index in PV (0 = first move)
   * @returns Move at index or null
   */
  getMoveAt(index: number): Move | null {
    const length = this.pvLength[0] ?? 0;
    if (index >= 0 && index < length) {
      return this.pvTable[0]?.[index] ?? null;
    }
    return null;
  }
}
