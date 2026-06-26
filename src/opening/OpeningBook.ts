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
import { MoveExecutor } from '../core/MoveExecutor';
import { ZobristHasher } from '../search/ZobristHashing';
import { Move, MoveFlags } from '../types/Move.types';
import * as MoveNotation from '../utils/MoveNotation';

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

    // Check if move already exists
    const existing = moves.find(m => m.from === from && m.to === to && m.promotion === promotion);
    if (existing) {
      // Update weight if new weight is higher, to prevent massive weight accumulation
      // from multiple overlapping lines.
      if (weight > existing.weight) {
        existing.weight = weight;
      }
      return;
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
    // 1. Caro-Kann Defense (Solid, Defensive)
    this.loadLine("e2e4 c7c6", 150);
    this.loadLine("e2e4 c7c6 d2d4 d7d5", 140);
    this.loadLine("e2e4 c7c6 d2d4 d7d5 e4d5 c6d5", 130); // Exchange Variation
    this.loadLine("e2e4 c7c6 d2d4 d7d5 e4e5 c8f5", 130); // Advance Variation
    this.loadLine("e2e4 c7c6 d2d4 d7d5 b1d2 d5e4", 130); // Classical

    // 2. Berlin Defense (The "Berlin Wall" - extremely solid)
    this.loadLine("e2e4 e7e5", 140);
    this.loadLine("e2e4 e7e5 g1f3 b8c6", 130);
    this.loadLine("e2e4 e7e5 g1f3 b8c6 f1b5 g8f6", 150); // Berlin Defense
    this.loadLine("e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4", 140); // Berlin Main Line
    this.loadLine("e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4 e4d6", 130); 
    this.loadLine("e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4 e4d6 b5c6 d7c6", 120); 

    // 3. Slav Defense (Solid response to d4)
    this.loadLine("d2d4 d7d5", 140);
    this.loadLine("d2d4 d7d5 c2c4 c7c6", 150);
    this.loadLine("d2d4 d7d5 c2c4 c7c6 g1f3 g8f6", 140);
    this.loadLine("d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4", 130); // Main Line

    // 4. French Defense (Solid, counter-attacking)
    this.loadLine("e2e4 e7e6", 120);
    this.loadLine("e2e4 e7e6 d2d4 d7d5", 130);
    this.loadLine("e2e4 e7e6 d2d4 d7d5 e4e5 c7c5", 120); // Advance Variation

    // 5. Queen's Gambit Declined (Orthodox, extremely solid)
    this.loadLine("d2d4 d7d5 c2c4 e7e6", 140);
    this.loadLine("d2d4 d7d5 c2c4 e7e6 b1c3 g8f6", 130);
    this.loadLine("d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7", 120);

    // 6. Nimzo-Indian Defense (Solid, positional)
    this.loadLine("d2d4 g8f6", 130);
    this.loadLine("d2d4 g8f6 c2c4 e7e6", 130);
    this.loadLine("d2d4 g8f6 c2c4 e7e6 b1c3 f8b4", 140);

    // 7. Reti/English setups
    this.loadLine("g1f3 d7d5", 120);
    this.loadLine("c2c4 e7e5", 120);
    this.loadLine("c2c4 c7c5", 110);
  }

  /**
   * Helper to load a line of moves into the book using actual board state transitions
   */
  private loadLine(uciLine: string, weight: number): void {
    const board = new Board();
    const state = new GameState();
    board.initializeStartingPosition();
    state.reset();

    const moves = uciLine.split(' ');
    for (let i = 0; i < moves.length; i++) {
      const moveStr = moves[i]!;
      const hash = this.zobrist.computeHash(board, state);
      
      const move = MoveNotation.fromUci(moveStr, board, state);
      if (!move) {
        console.error(`Invalid opening book move in line: ${uciLine}`);
        break;
      }
      
      // If we are at the last move, we should add it to the book
      // Wait, we should add EVERY move in the sequence to the book for that specific position
      // For example, if line is e2e4 c7c6, we add e2e4 from startpos, and c7c6 from the resulting position
      this.addMove(hash, move.from, move.to, weight, move.promotion);

      MoveExecutor.makeMove(board, state, move);
    }
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
