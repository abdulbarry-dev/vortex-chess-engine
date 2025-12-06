/**
 * @file PieceValues.ts
 * @description Standard piece values in centipawns (hundredths of a pawn)
 */

import { PieceType } from '../core/Piece';

/**
 * Standard material values for pieces (in centipawns)
 * These are used for basic material evaluation
 */
export const PIECE_VALUES: Record<PieceType, number> = {
  [PieceType.Pawn]: 100,
  [PieceType.Knight]: 320,
  [PieceType.Bishop]: 330,
  [PieceType.Rook]: 500,
  [PieceType.Queen]: 900,
  [PieceType.King]: 0, // King is invaluable, not counted in material
};

/**
 * Get the material value of a piece type
 * @param type The piece type
 * @returns Material value in centipawns
 */
export function getPieceValue(type: PieceType): number {
  return PIECE_VALUES[type];
}

/**
 * MVV-LVA (Most Valuable Victim - Least Valuable Attacker) scores
 * Used for move ordering in search
 */
export const MVV_LVA_SCORES: Record<PieceType, Record<PieceType, number>> = {
  // Victim: Pawn
  [PieceType.Pawn]: {
    [PieceType.Pawn]: 105,
    [PieceType.Knight]: 104,
    [PieceType.Bishop]: 103,
    [PieceType.Rook]: 102,
    [PieceType.Queen]: 101,
    [PieceType.King]: 100,
  },
  // Victim: Knight
  [PieceType.Knight]: {
    [PieceType.Pawn]: 205,
    [PieceType.Knight]: 204,
    [PieceType.Bishop]: 203,
    [PieceType.Rook]: 202,
    [PieceType.Queen]: 201,
    [PieceType.King]: 200,
  },
  // Victim: Bishop
  [PieceType.Bishop]: {
    [PieceType.Pawn]: 305,
    [PieceType.Knight]: 304,
    [PieceType.Bishop]: 303,
    [PieceType.Rook]: 302,
    [PieceType.Queen]: 301,
    [PieceType.King]: 300,
  },
  // Victim: Rook
  [PieceType.Rook]: {
    [PieceType.Pawn]: 405,
    [PieceType.Knight]: 404,
    [PieceType.Bishop]: 403,
    [PieceType.Rook]: 402,
    [PieceType.Queen]: 401,
    [PieceType.King]: 400,
  },
  // Victim: Queen
  [PieceType.Queen]: {
    [PieceType.Pawn]: 505,
    [PieceType.Knight]: 504,
    [PieceType.Bishop]: 503,
    [PieceType.Rook]: 502,
    [PieceType.Queen]: 501,
    [PieceType.King]: 500,
  },
  // Victim: King (should never happen in normal play)
  [PieceType.King]: {
    [PieceType.Pawn]: 605,
    [PieceType.Knight]: 604,
    [PieceType.Bishop]: 603,
    [PieceType.Rook]: 602,
    [PieceType.Queen]: 601,
    [PieceType.King]: 600,
  },
};

/**
 * Get MVV-LVA score for a capture
 * @param victimType Type of piece being captured
 * @param attackerType Type of piece making the capture
 * @returns MVV-LVA score for move ordering
 */
export function getMvvLvaScore(victimType: PieceType, attackerType: PieceType): number {
  return MVV_LVA_SCORES[victimType][attackerType];
}
