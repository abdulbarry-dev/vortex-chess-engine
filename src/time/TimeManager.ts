/**
 * @file TimeManager.ts
 * @description Time management for chess engine
 * 
 * Allocates search time intelligently based on:
 * 1. Remaining time on clock
 * 2. Increment per move
 * 3. Number of moves played
 * 4. Expected moves remaining
 * 
 * Prevents time pressure and ensures time for endgame.
 */

/**
 * Time control information
 */
export interface TimeControl {
  /** White's remaining time (ms) */
  whiteTime: number;
  
  /** Black's remaining time (ms) */
  blackTime: number;
  
  /** White's increment per move (ms) */
  whiteIncrement?: number;
  
  /** Black's increment per move (ms) */
  blackIncrement?: number;
  
  /** Moves until time control (0 = no limit) */
  movesToGo?: number;
}

/**
 * Time allocation result
 */
export interface TimeAllocation {
  /** Optimal time for this move (ms) */
  optimalTime: number;
  
  /** Maximum time for this move (ms) */
  maxTime: number;
  
  /** Minimum time for this move (ms) */
  minTime: number;
}

/**
 * Time manager for search
 * 
 * Allocates time intelligently to avoid time pressure
 * while ensuring enough time for critical positions.
 */
export class TimeManager {
  // Constants for time allocation
  private readonly EXPECTED_MOVES_REMAINING = 40;
  private readonly TIME_CUSHION = 0.95; // Use 95% of available time
  private readonly MIN_TIME_MS = 10; // Never allocate less than 10ms
  private readonly EMERGENCY_TIME_FRACTION = 0.1; // Reserve 10% for emergencies
  
  /**
   * Calculate time allocation for current move
   * 
   * @param timeControl Current time control
   * @param isWhite Is white to move
   * @param moveNumber Current move number
   * @returns Time allocation
   */
  allocateTime(
    timeControl: TimeControl,
    isWhite: boolean,
    moveNumber: number = 1
  ): TimeAllocation {
    const myTime = isWhite ? timeControl.whiteTime : timeControl.blackTime;
    const myIncrement = isWhite 
      ? (timeControl.whiteIncrement || 0)
      : (timeControl.blackIncrement || 0);
    const movesToGo = timeControl.movesToGo || this.EXPECTED_MOVES_REMAINING;

    // Calculate base time per move
    const timePerMove = this.calculateTimePerMove(
      myTime,
      myIncrement,
      movesToGo,
      moveNumber
    );

    // Calculate optimal time (what we aim for)
    const optimalTime = Math.max(
      this.MIN_TIME_MS,
      Math.floor(timePerMove * this.TIME_CUSHION)
    );

    // Calculate max time (absolute limit)
    const maxTime = Math.max(
      optimalTime * 3,
      Math.floor(myTime * 0.4) // Never use more than 40% of remaining time
    );

    // Calculate min time (minimum we should use)
    const minTime = Math.max(
      this.MIN_TIME_MS,
      Math.floor(optimalTime * 0.5)
    );

    return {
      optimalTime: Math.min(optimalTime, myTime - 100),
      maxTime: Math.min(maxTime, myTime - 100),
      minTime: Math.min(minTime, myTime - 100),
    };
  }

  /**
   * Calculate base time per move
   */
  private calculateTimePerMove(
    remainingTime: number,
    increment: number,
    movesToGo: number,
    _moveNumber: number // Unused but kept for future time management heuristics
  ): number {
    // Reserve emergency time
    const usableTime = remainingTime * (1 - this.EMERGENCY_TIME_FRACTION);

    // If we have increment, we can use more time
    if (increment > 0) {
      // With increment, we gain time each move
      // So we can use: (remaining time + expected increments) / moves
      const expectedIncrements = increment * Math.min(movesToGo, 20);
      return (usableTime + expectedIncrements) / movesToGo;
    } else {
      // Without increment, we must conserve time
      // Use slightly less per move to avoid time pressure
      return usableTime / (movesToGo + 5);
    }
  }

  /**
   * Adjust time allocation based on position complexity
   * 
   * @param baseAllocation Base time allocation
   * @param complexity Position complexity (0-1)
   * @returns Adjusted allocation
   */
  adjustForComplexity(
    baseAllocation: TimeAllocation,
    complexity: number
  ): TimeAllocation {
    // Clamp complexity to 0-1
    complexity = Math.max(0, Math.min(1, complexity));

    // Adjust optimal time based on complexity
    // Simple positions: use less time
    // Complex positions: use more time
    const factor = 0.7 + (complexity * 0.6); // Range: 0.7 to 1.3

    return {
      optimalTime: Math.floor(baseAllocation.optimalTime * factor),
      maxTime: baseAllocation.maxTime,
      minTime: baseAllocation.minTime,
    };
  }

  /**
   * Calculate position complexity (0-1)
   * 
   * Factors:
   * - Number of legal moves
   * - Number of pieces
   * - Whether position is tactical
   * 
   * @param legalMoves Number of legal moves
   * @param pieceCount Number of pieces on board
   * @param isTactical Is position tactical (checks, captures)
   * @returns Complexity score (0-1)
   */
  calculateComplexity(
    legalMoves: number,
    pieceCount: number,
    isTactical: boolean = false
  ): number {
    // Normalize legal moves (20 is average, 40+ is complex)
    const moveComplexity = Math.min(legalMoves / 40, 1);

    // Normalize piece count (16 pieces is complex opening, 6 is simple endgame)
    const pieceComplexity = Math.min(pieceCount / 16, 1);

    // Tactical positions need more time
    const tacticalBonus = isTactical ? 0.3 : 0;

    // Weighted average
    const complexity = 
      moveComplexity * 0.4 +
      pieceComplexity * 0.4 +
      tacticalBonus;

    return Math.min(complexity, 1);
  }

  /**
   * Check if we're in time pressure
   * 
   * @param remainingTime Time remaining (ms)
   * @param increment Increment per move (ms)
   * @returns True if in time pressure
   */
  isTimePressure(remainingTime: number, increment: number = 0): boolean {
    // Time pressure if we have less than 10 seconds
    // (unless we have a good increment)
    const threshold = increment > 1000 ? 5000 : 10000;
    return remainingTime < threshold;
  }
}
