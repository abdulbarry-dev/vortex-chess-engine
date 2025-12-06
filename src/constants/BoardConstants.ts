/**
 * @file BoardConstants.ts
 * @description Constants related to the chess board
 */

/**
 * Board dimensions
 */
export const BOARD_SIZE = 8;
export const NUM_SQUARES = 64;

/**
 * File constants (0-7, a-h)
 */
export const FILE_A = 0;
export const FILE_B = 1;
export const FILE_C = 2;
export const FILE_D = 3;
export const FILE_E = 4;
export const FILE_F = 5;
export const FILE_G = 6;
export const FILE_H = 7;

/**
 * Rank constants (0-7, 1-8)
 */
export const RANK_1 = 0;
export const RANK_2 = 1;
export const RANK_3 = 2;
export const RANK_4 = 3;
export const RANK_5 = 4;
export const RANK_6 = 5;
export const RANK_7 = 6;
export const RANK_8 = 7;

/**
 * Direction offsets for piece movement
 */
export const NORTH = 8;
export const SOUTH = -8;
export const EAST = 1;
export const WEST = -1;
export const NORTH_EAST = 9;
export const NORTH_WEST = 7;
export const SOUTH_EAST = -7;
export const SOUTH_WEST = -9;

/**
 * Knight move offsets
 */
export const KNIGHT_OFFSETS = [-17, -15, -10, -6, 6, 10, 15, 17];

/**
 * King move offsets (8 directions)
 */
export const KING_OFFSETS = [
  NORTH, SOUTH, EAST, WEST,
  NORTH_EAST, NORTH_WEST, SOUTH_EAST, SOUTH_WEST
];

/**
 * Diagonal directions (for bishops)
 */
export const DIAGONAL_DIRECTIONS = [
  NORTH_EAST, NORTH_WEST, SOUTH_EAST, SOUTH_WEST
];

/**
 * Orthogonal directions (for rooks)
 */
export const ORTHOGONAL_DIRECTIONS = [
  NORTH, SOUTH, EAST, WEST
];

/**
 * All directions (for queens)
 */
export const ALL_DIRECTIONS = [
  ...DIAGONAL_DIRECTIONS,
  ...ORTHOGONAL_DIRECTIONS
];

/**
 * Starting position square constants
 */
export const STARTING_SQUARES = {
  WHITE_KING: 4,   // e1
  WHITE_QUEEN_ROOK: 0,  // a1
  WHITE_KING_ROOK: 7,   // h1
  BLACK_KING: 60,  // e8
  BLACK_QUEEN_ROOK: 56, // a8
  BLACK_KING_ROOK: 63,  // h8
};
