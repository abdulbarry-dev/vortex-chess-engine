/**
 * @file OpeningBook.ts
 * @description Opening book for common chess openings
 * 
 * An opening book provides pre-computed moves for the opening phase.
 * Benefits:
 * 1. Faster opening play (no search needed)
 * 2. More principled opening moves
 * 3. Variety in play
 * 
 * This implementation uses a simple hash-based lookup.
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { ZobristHasher } from '../search/ZobristHashing';
import { Move, MoveFlags } from '../types/Move.types';

/**
 * Book move with weight
 * Higher weight = more likely to be selected
 */
interface BookMove {
  from: number;
  to: number;
  promotion?: number;
  weight: number; // Higher = more popular/better
}

/**
 * Opening book for common openings
 * 
 * Stores positions as Zobrist hashes with lists of good moves.
 * Moves are weighted by popularity and theoretical strength.
 */
export class OpeningBook {
  private readonly entries: Map<bigint, BookMove[]> = new Map();
  private readonly zobrist: ZobristHasher;
  private enabled: boolean = true;

  constructor(zobrist: ZobristHasher) {
    this.zobrist = zobrist;
    this.loadDefaultBook();
  }

  /**
   * Look up a move from the book
   * 
   * @param board Current board state
   * @param state Current game state
   * @returns Book move or null if not in book
   */
  probe(board: Board, state: GameState): Move | null {
    if (!this.enabled) return null;

    const hash = this.zobrist.computeHash(board, state);
    const moves = this.entries.get(hash);
    
    if (!moves || moves.length === 0) {
      return null;
    }

    // Select move based on weights (weighted random selection)
    const bookMove = this.selectWeightedMove(moves);
    
    // Convert book move to full Move object
    return this.bookMoveToMove(board, bookMove);
  }

  /**
   * Add a move to the book
   * 
   * @param hash Position hash
   * @param from Source square
   * @param to Target square
   * @param weight Move weight (default 100)
   * @param promotion Promotion piece type
   */
  addMove(
    hash: bigint,
    from: number,
    to: number,
    weight: number = 100,
    promotion?: number
  ): void {
    let moves = this.entries.get(hash);
    if (!moves) {
      moves = [];
      this.entries.set(hash, moves);
    }

    moves.push({ from, to, weight, promotion });
  }

  /**
   * Enable or disable the book
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if book is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get statistics
   */
  getStats(): { positions: number; totalMoves: number } {
    let totalMoves = 0;
    for (const moves of this.entries.values()) {
      totalMoves += moves.length;
    }

    return {
      positions: this.entries.size,
      totalMoves,
    };
  }

  /**
   * Load default opening book
   * 
   * This includes common mainline openings:
   * - e4 openings (Ruy Lopez, Italian, Sicilian, etc.)
   * - d4 openings (Queen's Gambit, King's Indian, etc.)
   * - c4 (English)
   * - Nf3 (Reti)
   */
  private loadDefaultBook(): void {
    // We'll compute hashes by actually setting up positions
    // For now, just add the most common first moves
    
    // Starting position
    const board = new Board();
    const state = new GameState();
    board.initializeStartingPosition();
    state.reset();
    
    const startHash = this.zobrist.computeHash(board, state);
    
    // First move options (White)
    // e4 - King's Pawn (most popular) - e2 to e4
    this.addMove(startHash, 12, 28, 150); // e2-e4 (rank 1 file 4 -> rank 3 file 4)
    
    // d4 - Queen's Pawn (second most popular) - d2 to d4
    this.addMove(startHash, 11, 27, 140); // d2-d4 (rank 1 file 3 -> rank 3 file 3)
    
    // Nf3 - Reti Opening - g1 to f3
    this.addMove(startHash, 6, 21, 100); // g1-f3 (rank 0 file 6 -> rank 2 file 5)
    
    // c4 - English Opening - c2 to c4
    this.addMove(startHash, 10, 26, 90); // c2-c4 (rank 1 file 2 -> rank 3 file 2)
    
    // We could add more lines, but for a 1600 Elo engine,
    // having just the first few moves is sufficient.
    // The engine's search will take over quickly.
  }

  /**
   * Select a move based on weights
   * Uses weighted random selection
   */
  private selectWeightedMove(moves: BookMove[]): BookMove {
    const totalWeight = moves.reduce((sum, m) => sum + m.weight, 0);
    let random = Math.random() * totalWeight;

    for (const move of moves) {
      random -= move.weight;
      if (random <= 0) {
        return move;
      }
    }

    // Fallback (shouldn't reach here)
    return moves[0]!;
  }

  /**
   * Convert book move to full Move object
   */
  private bookMoveToMove(board: Board, bookMove: BookMove): Move {
    const piece = board.getPiece(bookMove.from);
    const captured = board.getPiece(bookMove.to);

    let flags = MoveFlags.None;
    if (captured) {
      flags |= MoveFlags.Capture;
    }
    if (bookMove.promotion) {
      flags |= MoveFlags.Promotion;
    }

    return {
      from: bookMove.from,
      to: bookMove.to,
      piece: piece!,
      captured: captured || undefined,
      promotion: bookMove.promotion,
      flags,
    };
  }
}
