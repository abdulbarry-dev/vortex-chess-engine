/**
 * @file AttackDetector.ts
 * @description Detect if a square is under attack using bitboard lookups.
 */

import {
  getBishopAttacks,
  getRookAttacks,
  KING_ATTACKS,
  KNIGHT_ATTACKS,
  PAWN_ATTACKS,
  pawnAttackIndex,
} from '../bitboard/AttackTables';

import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';
import { Square } from '../core/Square';

/**
 * Check if a square is attacked by the given color.
 * Uses bitboard attack tables for O(1) leaper checks and fast slider checks.
 *
 * @param board Current board state
 * @param square Square to check
 * @param attackingColor Color of the attacking pieces
 * @returns True if the square is under attack
 */
export function isSquareAttacked(
  board: Board,
  square: Square,
  attackingColor: Color
): boolean {
  const occupancy = board.getOccupancy();

  // 1. Pawn attacks — check if any enemy pawn attacks this square
  const enemyPawns = board.getPieceBitboard(PieceType.Pawn, attackingColor);
  // Instead of looking at pawn attacks FROM enemy pawns, we look at the
  // *reverse* pawn attacks from the target square to see if they hit an enemy pawn.
  // Reverse: if we're checking attacks by White, we look at Black's pawn attack
  // pattern from the target square and see if it overlaps with White pawns.
  const reversePawnIdx = pawnAttackIndex(attackingColor === Color.White ? Color.Black : Color.White);
  if (((PAWN_ATTACKS[reversePawnIdx]?.[square]) ?? 0n) & enemyPawns) {
    return true;
  }

  // 2. Knight attacks
  const enemyKnights = board.getPieceBitboard(PieceType.Knight, attackingColor);
  if (((KNIGHT_ATTACKS[square]) ?? 0n) & enemyKnights) {
    return true;
  }

  // 3. King attacks
  const enemyKings = board.getPieceBitboard(PieceType.King, attackingColor);
  if (((KING_ATTACKS[square]) ?? 0n) & enemyKings) {
    return true;
  }

  // 4. Bishop/Queen attacks (diagonal)
  const enemyBishops = board.getPieceBitboard(PieceType.Bishop, attackingColor);
  const enemyQueens = board.getPieceBitboard(PieceType.Queen, attackingColor);
  const bishopAttacks = getBishopAttacks(square, occupancy);
  if (bishopAttacks & (enemyBishops | enemyQueens)) {
    return true;
  }

  // 5. Rook/Queen attacks (orthogonal)
  const enemyRooks = board.getPieceBitboard(PieceType.Rook, attackingColor);
  const rookAttacks = getRookAttacks(square, occupancy);
  if (rookAttacks & (enemyRooks | enemyQueens)) {
    return true;
  }

  return false;
}

/**
 * Get a bitboard of all squares attacked by a given color.
 *
 * @param board Current board state
 * @param attackingColor Color to query attacks for
 * @returns Bitboard of all attacked squares
 */
export function getAttackedSquares(
  board: Board,
  attackingColor: Color
): bigint {
  let attacked = 0n;
  const occupancy = board.getOccupancy();
  const pIdx = pawnAttackIndex(attackingColor);

  // Pawns
  let pawns = board.getPieceBitboard(PieceType.Pawn, attackingColor);
  while (pawns) {
    const sq = Number(BigInt(pawns & -pawns).toString(2).length - 1);
    attacked |= (PAWN_ATTACKS[pIdx]?.[sq]) ?? 0n;
    pawns &= pawns - 1n;
  }

  // Knights
  let knights = board.getPieceBitboard(PieceType.Knight, attackingColor);
  while (knights) {
    const sq = Number(BigInt(knights & -knights).toString(2).length - 1);
    attacked |= (KNIGHT_ATTACKS[sq]) ?? 0n;
    knights &= knights - 1n;
  }

  // King
  const kingBB = board.getPieceBitboard(PieceType.King, attackingColor);
  if (kingBB) {
    const kingSq = Number(BigInt(kingBB & -kingBB).toString(2).length - 1);
    attacked |= (KING_ATTACKS[kingSq]) ?? 0n;
  }

  // Bishops + Queens (diagonal)
  let bishops = board.getPieceBitboard(PieceType.Bishop, attackingColor) |
                board.getPieceBitboard(PieceType.Queen, attackingColor);
  while (bishops) {
    const sq = Number(BigInt(bishops & -bishops).toString(2).length - 1);
    attacked |= getBishopAttacks(sq, occupancy);
    bishops &= bishops - 1n;
  }

  // Rooks + Queens (orthogonal)
  let rooks = board.getPieceBitboard(PieceType.Rook, attackingColor) |
              board.getPieceBitboard(PieceType.Queen, attackingColor);
  while (rooks) {
    const sq = Number(BigInt(rooks & -rooks).toString(2).length - 1);
    attacked |= getRookAttacks(sq, occupancy);
    rooks &= rooks - 1n;
  }

  return attacked;
}

/**
 * Get a bitboard of all attackers of a specific square.
 *
 * @param board Current board state
 * @param square Target square
 * @param attackingColor Color of attacking pieces
 * @returns Bitboard of all pieces of the given color attacking the square
 */
export function getAttackersOf(
  board: Board,
  square: Square,
  attackingColor: Color
): bigint {
  let attackers = 0n;
  const occupancy = board.getOccupancy();
  const sq = square;

  // Pawns (reverse attack lookup)
  const reversePawnIdx = pawnAttackIndex(attackingColor === Color.White ? Color.Black : Color.White);
  attackers |= ((PAWN_ATTACKS[reversePawnIdx]?.[sq]) ?? 0n) & board.getPieceBitboard(PieceType.Pawn, attackingColor);

  // Knights
  attackers |= ((KNIGHT_ATTACKS[sq]) ?? 0n) & board.getPieceBitboard(PieceType.Knight, attackingColor);

  // King
  attackers |= ((KING_ATTACKS[sq]) ?? 0n) & board.getPieceBitboard(PieceType.King, attackingColor);

  // Bishops + Queens (diagonal)
  const bAttacks = getBishopAttacks(sq, occupancy);
  attackers |= bAttacks & (board.getPieceBitboard(PieceType.Bishop, attackingColor) |
                            board.getPieceBitboard(PieceType.Queen, attackingColor));

  // Rooks + Queens (orthogonal)
  const rAttacks = getRookAttacks(sq, occupancy);
  attackers |= rAttacks & (board.getPieceBitboard(PieceType.Rook, attackingColor) |
                            board.getPieceBitboard(PieceType.Queen, attackingColor));

  return attackers;
}
