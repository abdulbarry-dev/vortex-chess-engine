/**
 * @file Bitboard.ts
 * @description Core bitboard utilities using bigint for 64-bit board representation.
 * Square mapping: 0 = a1, 63 = h8 (LERF - Little-Endian Rank-File).
 */

/** Empty bitboard */
export const EMPTY_BB: bigint = 0n;

/** Full bitboard (all 64 squares set) */
export const FULL_BB: bigint = 0xFFFFFFFFFFFFFFFFn;

// ── File masks ──────────────────────────────────────────────────────────────
export const FILE_A: bigint = 0x0101010101010101n;
export const FILE_B: bigint = FILE_A << 1n;
export const FILE_C: bigint = FILE_A << 2n;
export const FILE_D: bigint = FILE_A << 3n;
export const FILE_E: bigint = FILE_A << 4n;
export const FILE_F: bigint = FILE_A << 5n;
export const FILE_G: bigint = FILE_A << 6n;
export const FILE_H: bigint = FILE_A << 7n;

// ── Rank masks ──────────────────────────────────────────────────────────────
export const RANK_1: bigint = 0xFFn;
export const RANK_2: bigint = RANK_1 << 8n;
export const RANK_3: bigint = RANK_1 << 16n;
export const RANK_4: bigint = RANK_1 << 24n;
export const RANK_5: bigint = RANK_1 << 32n;
export const RANK_6: bigint = RANK_1 << 40n;
export const RANK_7: bigint = RANK_1 << 48n;
export const RANK_8: bigint = RANK_1 << 56n;

// ── Negated file masks (for wrapping checks) ────────────────────────────────
export const NOT_FILE_A: bigint = ~FILE_A & FULL_BB;
export const NOT_FILE_H: bigint = ~FILE_H & FULL_BB;
export const NOT_FILE_AB: bigint = ~(FILE_A | FILE_B) & FULL_BB;
export const NOT_FILE_GH: bigint = ~(FILE_G | FILE_H) & FULL_BB;

// ── Bit manipulation ────────────────────────────────────────────────────────

/**
 * Returns a bitboard with only the given square set.
 */
export function squareBB(sq: number): bigint {
  return 1n << BigInt(sq);
}

/**
 * Sets a bit at the given square.
 */
export function setBit(bb: bigint, sq: number): bigint {
  return bb | squareBB(sq);
}

/**
 * Clears a bit at the given square.
 */
export function clearBit(bb: bigint, sq: number): bigint {
  return bb & ~squareBB(sq);
}

/**
 * Tests if a bit is set at the given square.
 */
export function hasBit(bb: bigint, sq: number): boolean {
  return (bb & squareBB(sq)) !== 0n;
}

/**
 * Counts the number of set bits in a bitboard.
 */
export function popCount(bb: bigint): number {
  let count = 0;
  let b = bb;
  while (b !== 0n) {
    b &= b - 1n; // Clear lowest set bit
    count++;
  }
  return count;
}

/**
 * Returns the index (0-63) of the lowest set bit, or -1 if empty.
 */
export function bitScanForward(bb: bigint): number {
  if (bb === 0n) return -1;
  // Isolate the lowest bit and count trailing zeros
  let sq = 0;
  let isolated = bb & (-bb); // Isolate lowest bit
  // Use successive halving
  if ((isolated & 0xFFFFFFFF00000000n) !== 0n) sq += 32;
  if ((isolated & 0xFFFF0000FFFF0000n) !== 0n) sq += 16;
  if ((isolated & 0xFF00FF00FF00FF00n) !== 0n) sq += 8;
  if ((isolated & 0xF0F0F0F0F0F0F0F0n) !== 0n) sq += 4;
  if ((isolated & 0xCCCCCCCCCCCCCCCCn) !== 0n) sq += 2;
  if ((isolated & 0xAAAAAAAAAAAAAAAAn) !== 0n) sq += 1;
  return sq;
}

/**
 * Returns the index (0-63) of the highest set bit, or -1 if empty.
 */
export function bitScanReverse(bb: bigint): number {
  if (bb === 0n) return -1;
  let sq = 0;
  let b = bb;
  if ((b & 0xFFFFFFFF00000000n) !== 0n) { sq += 32; b >>= 32n; }
  if ((b & 0x00000000FFFF0000n) !== 0n) { sq += 16; b >>= 16n; }
  if ((b & 0x000000000000FF00n) !== 0n) { sq += 8; b >>= 8n; }
  if ((b & 0x00000000000000F0n) !== 0n) { sq += 4; b >>= 4n; }
  if ((b & 0x000000000000000Cn) !== 0n) { sq += 2; b >>= 2n; }
  if ((b & 0x0000000000000002n) !== 0n) { sq += 1; }
  return sq;
}

// ── Iteration ───────────────────────────────────────────────────────────────

/**
 * Removes the lowest set bit and returns its index plus the updated bitboard.
 */
export function popLSB(bb: bigint): { sq: number; bb: bigint } {
  const sq = bitScanForward(bb);
  return { sq, bb: bb & (bb - 1n) };
}

/**
 * Calls callback for every set bit in the bitboard.
 */
export function forEachBit(bb: bigint, callback: (sq: number) => void): void {
  let b = bb;
  while (b !== 0n) {
    const result = popLSB(b);
    callback(result.sq);
    b = result.bb;
  }
}

// ── Debug display ───────────────────────────────────────────────────────────

/**
 * Returns an 8×8 string representation of a bitboard (rank 8 on top).
 */
export function bitboardToString(bb: bigint): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = `${rank + 1} `;
    for (let file = 0; file < 8; file++) {
      const sq = rank * 8 + file;
      row += hasBit(bb, sq) ? '1 ' : '. ';
    }
    rows.push(row);
  }
  rows.push('  a b c d e f g h');
  return rows.join('\n');
}
