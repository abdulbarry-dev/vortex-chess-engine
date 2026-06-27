/**
 * @file AttackTables.ts
 * @description Precomputed attack bitboards for all piece types.
 * Knight, king, and pawn attacks are precomputed per-square at module load.
 * Sliding piece attacks are computed on-the-fly using classical ray casting.
 */

import { Color } from "../core/Piece";
import {
  EMPTY_BB,
  FULL_BB,
  NOT_FILE_A,
  NOT_FILE_AB,
  NOT_FILE_GH,
  NOT_FILE_H,
  squareBB,
} from "./Bitboard";

// ── Precomputed attack tables ───────────────────────────────────────────────

/** Knight attacks indexed by square (0-63) */
export const KNIGHT_ATTACKS: bigint[] = new Array<bigint>(64).fill(EMPTY_BB);

/** King attacks indexed by square (0-63) */
export const KING_ATTACKS: bigint[] = new Array<bigint>(64).fill(EMPTY_BB);

/**
 * Pawn attacks indexed by [colorIndex][square].
 * Index 0 = White, Index 1 = Black.
 */
export const PAWN_ATTACKS: bigint[][] = [
  new Array<bigint>(64).fill(EMPTY_BB), // White
  new Array<bigint>(64).fill(EMPTY_BB), // Black
];

/**
 * Convert Color enum to pawn attack table index.
 * White (1) → 0, Black (-1) → 1.
 */
export function pawnAttackIndex(color: Color): number {
  return color === Color.White ? 0 : 1;
}

// ── Initialization ──────────────────────────────────────────────────────────

function initKnightAttacks(): void {
  for (let sq = 0; sq < 64; sq++) {
    const bb = squareBB(sq);
    let attacks = EMPTY_BB;

    // NNE: +17 (2 ranks up, 1 file right) — must not be on file H
    attacks |= (bb << 17n) & NOT_FILE_A;
    // NNW: +15 (2 ranks up, 1 file left) — must not be on file A (after shift, bit wraps to H)
    attacks |= (bb << 15n) & NOT_FILE_H;
    // NEE: +10 (1 rank up, 2 files right) — must not be on files G,H
    attacks |= (bb << 10n) & NOT_FILE_AB;
    // NWW: +6 (1 rank up, 2 files left) — must not be on files A,B
    attacks |= (bb << 6n) & NOT_FILE_GH;
    // SSE: -15 (2 ranks down, 1 file right) — must not be on file H
    attacks |= (bb >> 15n) & NOT_FILE_A;
    // SSW: -17 (2 ranks down, 1 file left) — must not be on file A
    attacks |= (bb >> 17n) & NOT_FILE_H;
    // SEE: -6 (1 rank down, 2 files right) — must not be on files G,H
    attacks |= (bb >> 6n) & NOT_FILE_AB;
    // SWW: -10 (1 rank down, 2 files left) — must not be on files A,B
    attacks |= (bb >> 10n) & NOT_FILE_GH;

    KNIGHT_ATTACKS[sq] = attacks & FULL_BB;
  }
}

function initKingAttacks(): void {
  for (let sq = 0; sq < 64; sq++) {
    const bb = squareBB(sq);
    let attacks = EMPTY_BB;

    // North: +8
    attacks |= (bb << 8n) & FULL_BB;
    // South: -8
    attacks |= bb >> 8n;
    // East: +1 (must not wrap from H to A)
    attacks |= (bb << 1n) & NOT_FILE_A;
    // West: -1 (must not wrap from A to H)
    attacks |= (bb >> 1n) & NOT_FILE_H;
    // NE: +9
    attacks |= (bb << 9n) & NOT_FILE_A;
    // NW: +7
    attacks |= (bb << 7n) & NOT_FILE_H;
    // SE: -7
    attacks |= (bb >> 7n) & NOT_FILE_A;
    // SW: -9
    attacks |= (bb >> 9n) & NOT_FILE_H;

    KING_ATTACKS[sq] = attacks & FULL_BB;
  }
}

function initPawnAttacks(): void {
  for (let sq = 0; sq < 64; sq++) {
    const bb = squareBB(sq);

    // White pawn attacks: up-left (+7) and up-right (+9)
    let whiteAttacks = EMPTY_BB;
    whiteAttacks |= (bb << 7n) & NOT_FILE_H; // Up-left: must not wrap from A to H
    whiteAttacks |= (bb << 9n) & NOT_FILE_A; // Up-right: must not wrap from H to A
    PAWN_ATTACKS[0]![sq] = whiteAttacks & FULL_BB;

    // Black pawn attacks: down-left (-9) and down-right (-7)
    let blackAttacks = EMPTY_BB;
    blackAttacks |= (bb >> 7n) & NOT_FILE_A; // Down-right: must not wrap from H to A
    blackAttacks |= (bb >> 9n) & NOT_FILE_H; // Down-left: must not wrap from A to H
    PAWN_ATTACKS[1]![sq] = blackAttacks;
  }
}

// ── Sliding attack generation (classical ray approach) ──────────────────────

/**
 * Cast a ray from a square in a given direction until hitting a blocker or
 * the board edge. Returns a bitboard of all attacked squares (including the
 * first blocker).
 *
 * @param sq Starting square (0-63)
 * @param direction Step delta (+8 = north, -8 = south, +1 = east, etc.)
 * @param occupancy All occupied squares
 */
function castRay(sq: number, direction: number, occupancy: bigint): bigint {
  let attacks = EMPTY_BB;
  let current = sq + direction;
  let prevFile = sq % 8;

  while (current >= 0 && current < 64) {
    const currentFile = current % 8;

    // Check for file wrapping (east/west/diagonal moves)
    const fileDiff = Math.abs(currentFile - prevFile);
    if (fileDiff > 1) break; // Wrapped around the board edge

    attacks |= squareBB(current);

    // Stop if we hit an occupied square (can capture but not slide through)
    if ((occupancy & squareBB(current)) !== 0n) break;

    prevFile = currentFile;
    current += direction;
  }

  return attacks;
}

/**
 * Compute rook attacks for a square given current occupancy.
 * Casts rays in 4 orthogonal directions: N (+8), S (-8), E (+1), W (-1).
 */
export function getRookAttacks(sq: number, occupancy: bigint): bigint {
  return (
    castRay(sq, 8, occupancy) | // North
    castRay(sq, -8, occupancy) | // South
    castRay(sq, 1, occupancy) | // East
    castRay(sq, -1, occupancy) // West
  );
}

/**
 * Compute bishop attacks for a square given current occupancy.
 * Casts rays in 4 diagonal directions: NE (+9), NW (+7), SE (-7), SW (-9).
 */
export function getBishopAttacks(sq: number, occupancy: bigint): bigint {
  return (
    castRay(sq, 9, occupancy) | // NE
    castRay(sq, 7, occupancy) | // NW
    castRay(sq, -7, occupancy) | // SE
    castRay(sq, -9, occupancy) // SW
  );
}

/**
 * Compute queen attacks for a square given current occupancy.
 * Union of rook and bishop attacks.
 */
export function getQueenAttacks(sq: number, occupancy: bigint): bigint {
  return getRookAttacks(sq, occupancy) | getBishopAttacks(sq, occupancy);
}

// ── Initialize all tables at module load ────────────────────────────────────
initKnightAttacks();
initKingAttacks();
initPawnAttacks();
