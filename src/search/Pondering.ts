/**
 * @file Pondering.ts
 * @description Implements pondering (thinking on opponent's time)
 * 
 * Pondering allows the engine to think during the opponent's turn,
 * speculating on the most likely move. If the speculation is correct,
 * we save search time. If wrong, we still explored useful positions.
 * 
 * Benefits:
 * - Effective doubling of search time in favorable positions
 * - Better responses to expected moves
 * - Utilizes otherwise idle CPU time
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Move } from '../types/Move.types';

/**
 * Status of pondering operation
 */
export enum PonderStatus {
  Idle = 'idle',
  Pondering = 'pondering',
  PonderHit = 'ponderhit', // Opponent played predicted move
  PonderMiss = 'pondermiss', // Opponent played different move
  Stopped = 'stopped',
}

/**
 * Result from pondering operation
 */
export interface PonderResult {
  ponderMove: Move | null;
  bestResponse: Move | null;
  depth: number;
  nodes: number;
  score: number;
  hit: boolean; // True if opponent played pondered move
}

/**
 * Configuration for pondering
 */
export interface PonderConfig {
  enabled: boolean;
  maxDepth: number;  // Maximum depth to ponder
  stopOnHit: boolean; // Stop immediately on ponder hit
}

/**
 * Manages pondering during opponent's time.
 */
export class PonderingManager {
  private status: PonderStatus;
  private ponderMove: Move | null;
  private ponderBoard: Board | null;
  private ponderState: GameState | null;
  private config: PonderConfig;
  private stopRequested: boolean;

  constructor(config?: Partial<PonderConfig>) {
    this.status = PonderStatus.Idle;
    this.ponderMove = null;
    this.ponderBoard = null;
    this.ponderState = null;
    this.stopRequested = false;

    this.config = {
      enabled: config?.enabled ?? true,
      maxDepth: config?.maxDepth ?? 20,
      stopOnHit: config?.stopOnHit ?? false,
    };
  }

  /**
   * Start pondering on expected opponent move.
   * 
   * @param board Current board position after our move
   * @param state Current game state after our move
   * @param expectedMove Move we expect opponent to play
   */
  startPondering(board: Board, state: GameState, expectedMove: Move): void {
    if (!this.config.enabled) return;

    this.status = PonderStatus.Pondering;
    this.ponderMove = expectedMove;
    this.stopRequested = false;

    // Clone board and state for pondering
    this.ponderBoard = board.clone();
    this.ponderState = state.clone();

    // Apply the expected move on ponder board
    // Move piece from source to destination
    const piece = this.ponderBoard.getPiece(expectedMove.from);
    if (piece) {
      this.ponderBoard.setPiece(expectedMove.to, piece);
      this.ponderBoard.setPiece(expectedMove.from, null);
      
      // Update state
      this.ponderState.switchTurn();
    }
  }

  /**
   * Handle ponder hit (opponent played expected move).
   * Continue search with normal time controls.
   * 
   * @returns True if we were pondering on this move
   */
  ponderHit(): boolean {
    if (this.status !== PonderStatus.Pondering) {
      return false;
    }

    this.status = PonderStatus.PonderHit;

    // Continue search without stopping (unless configured otherwise)
    if (this.config.stopOnHit) {
      this.stop();
    }

    return true;
  }

  /**
   * Handle ponder miss (opponent played different move).
   * Stop pondering and discard results.
   */
  ponderMiss(): void {
    if (this.status === PonderStatus.Pondering) {
      this.status = PonderStatus.PonderMiss;
      this.stopRequested = true;
      this.ponderBoard = null;
      this.ponderState = null;
    }
  }

  /**
   * Stop pondering gracefully.
   */
  stop(): void {
    this.stopRequested = true;
    if (this.status !== PonderStatus.PonderMiss) {
      this.status = PonderStatus.Stopped;
    }
    this.ponderBoard = null;
    this.ponderState = null;
  }

  /**
   * Check if pondering is currently active.
   * 
   * @returns True if pondering
   */
  isPondering(): boolean {
    return this.status === PonderStatus.Pondering;
  }

  /**
   * Check if stop was requested.
   * 
   * @returns True if stop requested
   */
  shouldStop(): boolean {
    return this.stopRequested;
  }

  /**
   * Get current ponder status.
   * 
   * @returns Current status
   */
  getStatus(): PonderStatus {
    return this.status;
  }

  /**
   * Get pondered board position (after expected move).
   * 
   * @returns Ponder board or null
   */
  getPonderBoard(): Board | null {
    return this.ponderBoard;
  }

  /**
   * Get pondered game state.
   * 
   * @returns Ponder state or null
   */
  getPonderState(): GameState | null {
    return this.ponderState;
  }

  /**
   * Get the move we're pondering on.
   * 
   * @returns Expected opponent move
   */
  getPonderMove(): Move | null {
    return this.ponderMove;
  }

  /**
   * Check if pondering is enabled.
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable or disable pondering.
   * 
   * @param enabled True to enable
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled && this.isPondering()) {
      this.stop();
    }
  }

  /**
   * Update pondering configuration.
   * 
   * @param config Partial config to update
   */
  updateConfig(config: Partial<PonderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   * 
   * @returns Current config
   */
  getConfig(): PonderConfig {
    return { ...this.config };
  }

  /**
   * Reset pondering manager to idle state.
   */
  reset(): void {
    this.stop();
    this.status = PonderStatus.Idle;
    this.ponderMove = null;
  }

  /**
   * Check if we had a ponder hit (good prediction).
   * 
   * @returns True if opponent played our predicted move
   */
  hadPonderHit(): boolean {
    return this.status === PonderStatus.PonderHit;
  }

  /**
   * Get statistics about pondering effectiveness.
   * 
   * @param totalPonders Total ponder attempts
   * @param hits Number of ponder hits
   * @returns Statistics string
   */
  static getEffectivenessStats(totalPonders: number, hits: number): string {
    if (totalPonders === 0) return 'No ponder attempts';

    const hitRate = (hits / totalPonders) * 100;
    return `Ponder hit rate: ${hitRate.toFixed(1)}% (${hits}/${totalPonders})`;
  }
}
