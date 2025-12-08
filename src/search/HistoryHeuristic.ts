/**
 * @file HistoryHeuristic.ts
 * @description History heuristic for move ordering
 * 
 * The history heuristic tracks how often moves cause beta cutoffs across
 * all positions in the search tree. Moves that historically perform well
 * are ordered earlier.
 * 
 * Benefits:
 * - Complements killer moves
 * - Works across different plies
 * - 5-15% additional node reduction
 * - Improves with longer searches
 */

import { Piece, Color as PieceColor } from '../core/Piece';
import { Move } from '../types/Move.types';

/**
 * History table tracks [piece][from][to] move success rates
 */
type HistoryTable = number[][][];

const BOARD_SIZE = 64;
const NUM_PIECES = 7; // Empty + 6 piece types

/**
 * Manages history heuristic for move ordering.
 */
export class HistoryHeuristic {
  private history: Map<PieceColor, HistoryTable>;
  private maxHistory: number;

  constructor(maxHistory: number = 10000) {
    this.maxHistory = maxHistory;
    this.history = new Map();

    // Initialize history tables for both colors
    this.history.set(PieceColor.White, this.createHistoryTable());
    this.history.set(PieceColor.Black, this.createHistoryTable());
  }

  /**
   * Create an empty history table.
   */
  private createHistoryTable(): HistoryTable {
    const table: HistoryTable = [];
    for (let piece = 0; piece < NUM_PIECES; piece++) {
      table[piece] = [];
      for (let from = 0; from < BOARD_SIZE; from++) {
        if (!table[piece]) table[piece] = [];
        table[piece]![from] = new Array(BOARD_SIZE).fill(0);
      }
    }
    return table;
  }

  /**
   * Record a successful move (caused beta cutoff).
   * 
   * @param move Move that succeeded
   * @param depth Remaining depth (more depth = more important)
   */
  recordSuccess(move: Move, depth: number): void {
    if (!move.piece) return;

    const table = this.history.get(move.piece.color);
    if (!table) return;

    const pieceIndex = move.piece.type;
    const fromSquare = move.from;
    const toSquare = move.to;

    // Increment by depth squared (exponential importance)
    const bonus = depth * depth;
    const current = table[pieceIndex]?.[fromSquare]?.[toSquare] ?? 0;
    const newValue = current + bonus;

    // Store with clamping
    if (table[pieceIndex]?.[fromSquare]) {
      table[pieceIndex][fromSquare][toSquare] = Math.min(newValue, this.maxHistory);
    }

    // Age history if approaching maximum
    if (newValue >= this.maxHistory * 0.9) {
      this.ageHistory(move.piece.color);
    }
  }

  /**
   * Record a failed move (didn't cause cutoff).
   * We track failures to maintain accuracy.
   * 
   * @param move Move that failed
   * @param depth Remaining depth
   */
  recordFailure(move: Move, depth: number): void {
    if (!move.piece) return;

    const table = this.history.get(move.piece.color);
    if (!table) return;

    const pieceIndex = move.piece.type;
    const fromSquare = move.from;
    const toSquare = move.to;

    // Small penalty (not as severe as success bonus)
    const penalty = Math.floor(depth / 2);
    const current = table[pieceIndex]?.[fromSquare]?.[toSquare] ?? 0;
    const newValue = Math.max(0, current - penalty);

    if (table[pieceIndex]?.[fromSquare]) {
      table[pieceIndex][fromSquare][toSquare] = newValue;
    }
  }

  /**
   * Get history score for a move.
   * 
   * @param move Move to score
   * @returns History score (0 if no history)
   */
  getScore(move: Move): number {
    if (!move.piece) return 0;

    const table = this.history.get(move.piece.color);
    if (!table) return 0;

    const pieceIndex = move.piece.type;
    const score = table[pieceIndex]?.[move.from]?.[move.to] ?? 0;

    return score;
  }

  /**
   * Get normalized history score (0-1000 range).
   * Useful for move ordering without huge values.
   * 
   * @param move Move to score
   * @returns Normalized score
   */
  getNormalizedScore(move: Move): number {
    const score = this.getScore(move);
    return Math.floor((score / this.maxHistory) * 1000);
  }

  /**
   * Age history table by dividing all values by 2.
   * Prevents old history from dominating.
   * 
   * @param color Color's history to age
   */
  private ageHistory(color: PieceColor): void {
    const table = this.history.get(color);
    if (!table) return;

    for (let piece = 0; piece < NUM_PIECES; piece++) {
      for (let from = 0; from < BOARD_SIZE; from++) {
        for (let to = 0; to < BOARD_SIZE; to++) {
          if (table[piece]?.[from]?.[to]) {
            table[piece]![from]![to] = Math.floor(table[piece]![from]![to]! / 2);
          }
        }
      }
    }
  }

  /**
   * Clear all history data.
   */
  clear(): void {
    this.history.set(PieceColor.White, this.createHistoryTable());
    this.history.set(PieceColor.Black, this.createHistoryTable());
  }

  /**
   * Clear history for a specific color.
   * 
   * @param color Color to clear
   */
  clearColor(color: PieceColor): void {
    this.history.set(color, this.createHistoryTable());
  }

  /**
   * Get the best historical move for a piece from a square.
   * 
   * @param piece Piece to check
   * @param from Starting square
   * @returns Best to-square and its score, or null
   */
  getBestMove(piece: Piece, from: number): { to: number; score: number } | null {
    const table = this.history.get(piece.color);
    if (!table) return null;

    const pieceIndex = piece.type;
    let bestTo = -1;
    let bestScore = 0; // Start at 0, only return if we find something better

    for (let to = 0; to < BOARD_SIZE; to++) {
      const score = table[pieceIndex]?.[from]?.[to] ?? 0;
      if (score > bestScore) {
        bestScore = score;
        bestTo = to;
      }
    }

    return bestScore > 0 && bestTo >= 0 ? { to: bestTo, score: bestScore } : null;
  }

  /**
   * Get statistics about history table usage.
   * 
   * @returns Statistics object
   */
  getStats(): {
    whiteEntries: number;
    blackEntries: number;
    totalScore: number;
    avgScore: number;
    maxScore: number;
  } {
    let whiteEntries = 0;
    let blackEntries = 0;
    let totalScore = 0;
    let maxScore = 0;

    const processTable = (table: HistoryTable): number => {
      let entries = 0;
      for (let piece = 0; piece < NUM_PIECES; piece++) {
        for (let from = 0; from < BOARD_SIZE; from++) {
          for (let to = 0; to < BOARD_SIZE; to++) {
            const score = table[piece]?.[from]?.[to] ?? 0;
            if (score > 0) {
              entries++;
              totalScore += score;
              maxScore = Math.max(maxScore, score);
            }
          }
        }
      }
      return entries;
    };

    const whiteTable = this.history.get(PieceColor.White);
    const blackTable = this.history.get(PieceColor.Black);

    if (whiteTable) whiteEntries = processTable(whiteTable);
    if (blackTable) blackEntries = processTable(blackTable);

    const totalEntries = whiteEntries + blackEntries;
    const avgScore = totalEntries > 0 ? totalScore / totalEntries : 0;

    return {
      whiteEntries,
      blackEntries,
      totalScore,
      avgScore,
      maxScore,
    };
  }

  /**
   * Export history table for analysis or persistence.
   * 
   * @param color Color to export
   * @returns Serializable history data
   */
  export(color: PieceColor): number[][][] {
    const table = this.history.get(color);
    if (!table) return [];

    // Deep clone
    return table.map(pieceTable =>
      pieceTable.map(fromRow => [...fromRow])
    );
  }

  /**
   * Import history table from saved data.
   * 
   * @param color Color to import
   * @param data History data
   */
  import(color: PieceColor, data: number[][][]): void {
    const table = this.createHistoryTable();

    for (let piece = 0; piece < NUM_PIECES && piece < data.length; piece++) {
      const pieceData = data[piece];
      if (!pieceData) continue;
      
      for (let from = 0; from < BOARD_SIZE && from < pieceData.length; from++) {
        const fromData = pieceData[from];
        if (!fromData) continue;
        
        for (let to = 0; to < BOARD_SIZE && to < fromData.length; to++) {
          if (table[piece]?.[from]) {
            table[piece]![from]![to] = Math.min(fromData[to]!, this.maxHistory);
          }
        }
      }
    }

    this.history.set(color, table);
  }
}
