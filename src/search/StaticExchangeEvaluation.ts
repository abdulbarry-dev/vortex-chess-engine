/**
 * @file StaticExchangeEvaluation.ts
 * @description Implements Static Exchange Evaluation (SEE) using bitboard occupancy
 * for move ordering and quiescence pruning.
 */

import {
  getBishopAttacks,
  getRookAttacks,
  KING_ATTACKS,
  KNIGHT_ATTACKS,
  PAWN_ATTACKS,
  pawnAttackIndex,
} from '../bitboard/AttackTables';
import { bitScanForward, clearBit, EMPTY_BB } from '../bitboard/Bitboard';
import { PIECE_VALUES } from '../constants/PieceValues';
import { Board } from '../core/Board';
import { Color, PieceType, oppositeColor } from '../core/Piece';
import { Square } from '../core/Square';
import { Move } from '../types/Move.types';

/** Piece values indexed by PieceType for quick lookup during SEE */
const SEE_VALUES: number[] = [
  0,   // 0 (unused)
  100, // Pawn (1)
  320, // Knight (2)
  330, // Bishop (3)
  500, // Rook (4)
  900, // Queen (5)
  20000, // King (6) — effectively infinite
];

/**
 * Evaluates the material outcome of a sequence of captures on a specific square.
 * Positive score means the side to move wins material.
 * Negative score means the side to move loses material.
 * Zero means equal trade.
 */
export function staticExchangeEvaluation(board: Board, move: Move): number {
  // If it's not a capture and not a promotion, SEE is generally 0
  if (!move.captured && !move.promotion) {
    return 0;
  }

  const targetSquare = move.to;
  let currentAttacker = move.piece;
  let colorToMove = oppositeColor(move.piece.color);

  const pieceValues: number[] = [];

  let currentCapturedValue = move.captured ? PIECE_VALUES[move.captured.type] : 0;
  if (move.promotion) {
    currentCapturedValue += PIECE_VALUES[move.promotion] - PIECE_VALUES[PieceType.Pawn];
  }

  pieceValues.push(currentCapturedValue);

  // Use bigint occupancy instead of Set<Square>
  let occupancy = board.getOccupancy();
  occupancy = clearBit(occupancy, move.from); // Remove initial attacker

  let depth = 0;

  while (true) {
    depth++;

    const nextAttackerSq = getLeastValuableAttacker(board, occupancy, targetSquare, colorToMove);
    if (nextAttackerSq === -1) break;

    const nextAttackerPiece = board.getPiece(nextAttackerSq);
    if (!nextAttackerPiece) break;

    pieceValues.push(SEE_VALUES[currentAttacker.type] ?? 0);
    occupancy = clearBit(occupancy, nextAttackerSq);

    currentAttacker = nextAttackerPiece;
    colorToMove = oppositeColor(colorToMove);
  }

  while (depth > 0) {
    depth--;
    const currentVal = pieceValues[depth] ?? 0;
    const nextVal = pieceValues[depth + 1] ?? 0;
    const captureScore = currentVal - nextVal;
    
    // We can stop the capture sequence (stand pat) for all but the first move
    if (depth === 0) {
      pieceValues[0] = captureScore;
    } else {
      pieceValues[depth] = Math.max(0, captureScore);
    }
  }

  return pieceValues[0] ?? 0;
}

/**
 * Find the least valuable attacker of a square for a given color,
 * considering only pieces in the current occupancy mask.
 * Returns square index of the attacker, or -1 if none found.
 */
function getLeastValuableAttacker(
  board: Board,
  occupancy: bigint,
  targetSquare: Square,
  color: Color
): number {
  // Check in order of ascending piece value: Pawn, Knight, Bishop, Rook, Queen, King

  // 1. Pawn
  const reversePawnIdx = pawnAttackIndex(color === Color.White ? Color.Black : Color.White);
  const pawnAttackers = ((PAWN_ATTACKS[reversePawnIdx]?.[targetSquare]) ?? EMPTY_BB)
    & board.getPieceBitboard(PieceType.Pawn, color) & occupancy;
  if (pawnAttackers !== EMPTY_BB) return bitScanForward(pawnAttackers);

  // 2. Knight
  const knightAttackers = ((KNIGHT_ATTACKS[targetSquare]) ?? EMPTY_BB)
    & board.getPieceBitboard(PieceType.Knight, color) & occupancy;
  if (knightAttackers !== EMPTY_BB) return bitScanForward(knightAttackers);

  // 3. Bishop
  const bishopAttacks = getBishopAttacks(targetSquare, occupancy);
  const bishopAttackers = bishopAttacks
    & board.getPieceBitboard(PieceType.Bishop, color) & occupancy;
  if (bishopAttackers !== EMPTY_BB) return bitScanForward(bishopAttackers);

  // 4. Rook
  const rookAttacks = getRookAttacks(targetSquare, occupancy);
  const rookAttackers = rookAttacks
    & board.getPieceBitboard(PieceType.Rook, color) & occupancy;
  if (rookAttackers !== EMPTY_BB) return bitScanForward(rookAttackers);

  // 5. Queen (check both diagonal and orthogonal)
  const queenAttackers = (bishopAttacks | rookAttacks)
    & board.getPieceBitboard(PieceType.Queen, color) & occupancy;
  if (queenAttackers !== EMPTY_BB) return bitScanForward(queenAttackers);

  // 6. King
  const kingAttackers = ((KING_ATTACKS[targetSquare]) ?? EMPTY_BB)
    & board.getPieceBitboard(PieceType.King, color) & occupancy;
  if (kingAttackers !== EMPTY_BB) return bitScanForward(kingAttackers);

  return -1;
}
