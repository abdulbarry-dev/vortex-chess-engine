/**
 * @file AspirationWindows.ts
 * @description Implements aspiration windows for alpha-beta search
 * 
 * Aspiration windows narrow the alpha-beta window around the expected score,
 * allowing for faster searches. If the search fails (score outside window),
 * we re-search with wider windows.
 * 
 * Benefits:
 * - 30-50% speed improvement in most positions
 * - More beta cutoffs due to narrower window
 * - Better move ordering from previous iteration
 */

/**
 * Result of an aspiration window search
 */
export interface AspirationResult {
  score: number;
  failedLow: boolean;  // Score below alpha (actual score is lower)
  failedHigh: boolean; // Score above beta (actual score is higher)
  searchCount: number; // Number of searches performed (1 if no fail)
}

/**
 * Manages aspiration windows for iterative deepening search.
 */
export class AspirationWindows {
  private initialWindow: number;
  private windowGrowthFactor: number;
  private maxWindow: number;

  /**
   * @param initialWindow Initial window size in centipawns (default: 50)
   * @param windowGrowthFactor Factor to widen window on fail (default: 2.0)
   * @param maxWindow Maximum window size before full search (default: 500)
   */
  constructor(
    initialWindow: number = 50,
    windowGrowthFactor: number = 2.0,
    maxWindow: number = 500
  ) {
    this.initialWindow = initialWindow;
    this.windowGrowthFactor = windowGrowthFactor;
    this.maxWindow = maxWindow;
  }

  /**
   * Calculate initial alpha-beta window around expected score.
   * 
   * @param expectedScore Score from previous iteration
   * @param depth Current search depth
   * @returns Object with alpha and beta values
   */
  getInitialWindow(expectedScore: number, depth: number): { alpha: number; beta: number } {
    // Use wider window for shallow depths (less reliable scores)
    const windowSize = depth <= 4 ? this.initialWindow * 2 : this.initialWindow;

    return {
      alpha: expectedScore - windowSize,
      beta: expectedScore + windowSize,
    };
  }

  /**
   * Widen the window after a search failure.
   * 
   * @param currentAlpha Current alpha value
   * @param currentBeta Current beta value
   * @param score Score that caused the failure
   * @param failedLow True if score <= alpha, false if score >= beta
   * @returns New widened window
   */
  widenWindow(
    currentAlpha: number,
    currentBeta: number,
    score: number,
    failedLow: boolean
  ): { alpha: number; beta: number } {
    const currentWindow = currentBeta - currentAlpha;
    const newWindowSize = Math.min(
      currentWindow * this.windowGrowthFactor,
      this.maxWindow
    );

    let newWindow: { alpha: number; beta: number };

    if (failedLow) {
      // Score is lower than expected, widen down
      newWindow = {
        alpha: score - newWindowSize,
        beta: currentBeta,
      };
    } else {
      // Score is higher than expected, widen up
      newWindow = {
        alpha: currentAlpha,
        beta: score + newWindowSize,
      };
    }
    
    // Ensure total window size doesn't exceed maximum
    const totalWindowSize = newWindow.beta - newWindow.alpha;
    if (totalWindowSize > this.maxWindow) {
      const center = (newWindow.alpha + newWindow.beta) / 2;
      newWindow.alpha = center - this.maxWindow / 2;
      newWindow.beta = center + this.maxWindow / 2;
    }
    
    return newWindow;
  }

  /**
   * Check if we should use full window instead (no aspiration).
   * 
   * @param depth Search depth
   * @param iteration Current iteration number in iterative deepening
   * @returns True if full window should be used
   */
  shouldUseFullWindow(depth: number, iteration: number): boolean {
    // Use full window for first few iterations (unreliable scores)
    if (iteration <= 2) return true;

    // Use full window for very shallow depths
    if (depth <= 2) return true;

    return false;
  }

  /**
   * Get full window (no aspiration).
   * 
   * @returns Full alpha-beta window
   */
  getFullWindow(): { alpha: number; beta: number } {
    return {
      alpha: -Infinity,
      beta: Infinity,
    };
  }

  /**
   * Determine if window has grown too large (should switch to full).
   * 
   * @param alpha Current alpha
   * @param beta Current beta
   * @returns True if window is effectively full
   */
  isEffectivelyFullWindow(alpha: number, beta: number): boolean {
    const windowSize = beta - alpha;
    return windowSize >= this.maxWindow * 2 || !isFinite(windowSize);
  }

  /**
   * Calculate search statistics for debugging.
   * 
   * @param result Aspiration result
   * @returns Statistics string
   */
  getStats(result: AspirationResult): string {
    const status = result.failedLow
      ? 'FAIL LOW'
      : result.failedHigh
      ? 'FAIL HIGH'
      : 'EXACT';

    return `Score: ${result.score} | Status: ${status} | Searches: ${result.searchCount}`;
  }

  /**
   * Adjust window size based on position volatility.
   * More volatile positions (many captures) need wider windows.
   * 
   * @param baseWindow Base window size
   * @param captureCount Number of legal captures
   * @param totalMoves Total number of legal moves
   * @returns Adjusted window size
   */
  adjustForVolatility(
    baseWindow: number,
    captureCount: number,
    totalMoves: number
  ): number {
    if (totalMoves === 0) return baseWindow;

    const captureRatio = captureCount / totalMoves;

    // Widen window for tactical positions (many captures)
    if (captureRatio > 0.3) {
      return baseWindow * 1.5;
    }

    // Standard window for quiet positions
    return baseWindow;
  }
}
