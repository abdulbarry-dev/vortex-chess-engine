/**
 * @file SearchConstants.ts
 * @description Constants for search algorithm
 */

/**
 * Search depth limits
 */
export const MAX_SEARCH_DEPTH = 50;
export const DEFAULT_SEARCH_DEPTH = 5;

/**
 * Score bounds for checkmate detection
 */
export const CHECKMATE_SCORE = 100000;
export const MATE_IN_MAX_PLY = CHECKMATE_SCORE - MAX_SEARCH_DEPTH;

/**
 * Alpha-beta bounds
 */
export const ALPHA_START = -Infinity;
export const BETA_START = Infinity;

/**
 * Transposition table constants
 */
export const TT_SIZE_MB = 64; // 64 MB default
export const TT_EXACT = 0;
export const TT_ALPHA = 1;
export const TT_BETA = 2;

/**
 * Move ordering scores
 */
export const MVV_LVA_OFFSET = 10000;
export const KILLER_MOVE_SCORE = 9000;
export const HASH_MOVE_SCORE = 20000;
export const PROMOTION_SCORE = 8000;
export const CASTLING_SCORE = 100;

/**
 * Quiescence search constants
 */
export const MAX_QUIESCENCE_DEPTH = 10;

/**
 * Time management
 */
export const DEFAULT_TIME_LIMIT_MS = 5000; // 5 seconds
export const TIME_BUFFER_MS = 50; // Safety buffer
