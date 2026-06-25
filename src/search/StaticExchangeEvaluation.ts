/**
 * @file StaticExchangeEvaluation.ts
 * @description Implements Static Exchange Evaluation (SEE) for move ordering and quiescence pruning.
 */

import { Board } from '../core/Board';
import { Move } from '../types/Move.types';
import { PieceType, Color, oppositeColor } from '../core/Piece';
import { PIECE_VALUES } from '../constants/PieceValues';
import { Square, squareToCoords, coordsToSquare } from '../core/Square';
import { DIAGONAL_DIRECTIONS, ORTHOGONAL_DIRECTIONS } from '../move-generation/SlidingMoves';

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
    let currentAttackerSquare = move.from;
    let currentAttacker = move.piece;
    let colorToMove = oppositeColor(move.piece.color);

    const pieceValues: number[] = [];
    
    let currentCapturedValue = move.captured ? PIECE_VALUES[move.captured.type] : 0;
    if (move.promotion) {
        currentCapturedValue += PIECE_VALUES[move.promotion] - PIECE_VALUES[PieceType.Pawn];
    }
    
    pieceValues.push(currentCapturedValue);

    const occupied = new Set<Square>();
    for (let sq = 0; sq < 64; sq++) {
        if (board.getPiece(sq)) {
            occupied.add(sq);
        }
    }

    occupied.delete(currentAttackerSquare);

    let depth = 0;
    
    while (true) {
        depth++;
        
        const nextAttackerSquare = getLeastValuableAttacker(board, occupied, targetSquare, colorToMove);
        if (nextAttackerSquare === null) {
            break;
        }
        
        const nextAttackerPiece = board.getPiece(nextAttackerSquare);
        if (!nextAttackerPiece) break;

        pieceValues.push(PIECE_VALUES[currentAttacker.type]);
        occupied.delete(nextAttackerSquare);
        
        currentAttackerSquare = nextAttackerSquare;
        currentAttacker = nextAttackerPiece;
        colorToMove = oppositeColor(colorToMove);
    }

    while (depth > 0) {
        depth--;
        const currentVal = pieceValues[depth] ?? 0;
        const nextVal = pieceValues[depth + 1] ?? 0;
        const captureScore = currentVal - nextVal;
        pieceValues[depth] = Math.max(0, captureScore);
    }

    return pieceValues[0] ?? 0;
}

function getLeastValuableAttacker(board: Board, occupied: Set<Square>, targetSquare: Square, color: Color): Square | null {
    const pawnSquare = getPawnAttacker(board, occupied, targetSquare, color);
    if (pawnSquare !== null) return pawnSquare;
    
    const knightSquare = getKnightAttacker(board, occupied, targetSquare, color);
    if (knightSquare !== null) return knightSquare;
    
    const bishopSquare = getSlidingAttacker(board, occupied, targetSquare, color, DIAGONAL_DIRECTIONS, PieceType.Bishop);
    if (bishopSquare !== null) return bishopSquare;
    
    const rookSquare = getSlidingAttacker(board, occupied, targetSquare, color, ORTHOGONAL_DIRECTIONS, PieceType.Rook);
    if (rookSquare !== null) return rookSquare;
    
    const queenDiagonal = getSlidingAttacker(board, occupied, targetSquare, color, DIAGONAL_DIRECTIONS, PieceType.Queen);
    if (queenDiagonal !== null) return queenDiagonal;
    const queenOrthogonal = getSlidingAttacker(board, occupied, targetSquare, color, ORTHOGONAL_DIRECTIONS, PieceType.Queen);
    if (queenOrthogonal !== null) return queenOrthogonal;
    
    const kingSquare = getKingAttacker(board, occupied, targetSquare, color);
    if (kingSquare !== null) return kingSquare;
    
    return null;
}

function getPawnAttacker(board: Board, occupied: Set<Square>, targetSquare: Square, color: Color): Square | null {
    const { rank, file } = squareToCoords(targetSquare);
    const pawnDirection = color === Color.White ? -1 : 1;
    const pawnRank = rank + pawnDirection;
    
    for (const fileDelta of [-1, 1]) {
        const pawnFile = file + fileDelta;
        if (pawnFile >= 0 && pawnFile <= 7 && pawnRank >= 0 && pawnRank <= 7) {
            const sq = coordsToSquare(pawnRank, pawnFile);
            if (occupied.has(sq)) {
                const piece = board.getPiece(sq);
                if (piece && piece.type === PieceType.Pawn && piece.color === color) {
                    return sq;
                }
            }
        }
    }
    return null;
}

function getKnightAttacker(board: Board, occupied: Set<Square>, targetSquare: Square, color: Color): Square | null {
    const { rank, file } = squareToCoords(targetSquare);
    const knightOffsets: [number, number][] = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    
    for (const [rD, fD] of knightOffsets) {
        if (rD === undefined || fD === undefined) continue;
        const r = rank + rD;
        const f = file + fD;
        if (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
            const sq = coordsToSquare(r, f);
            if (occupied.has(sq)) {
                const piece = board.getPiece(sq);
                if (piece && piece.type === PieceType.Knight && piece.color === color) {
                    return sq;
                }
            }
        }
    }
    return null;
}

function getSlidingAttacker(
    board: Board, 
    occupied: Set<Square>, 
    targetSquare: Square, 
    color: Color, 
    directions: readonly (readonly [number, number])[], 
    pieceType: PieceType
): Square | null {
    const { rank, file } = squareToCoords(targetSquare);
    
    for (const [rD, fD] of directions) {
        if (rD === undefined || fD === undefined) continue;
        let r = rank + rD;
        let f = file + fD;
        
        while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
            const sq = coordsToSquare(r, f);
            if (occupied.has(sq)) {
                const piece = board.getPiece(sq);
                if (piece && piece.color === color && piece.type === pieceType) {
                    return sq;
                } else {
                    break;
                }
            }
            r += rD;
            f += fD;
        }
    }
    return null;
}

function getKingAttacker(board: Board, occupied: Set<Square>, targetSquare: Square, color: Color): Square | null {
    const { rank, file } = squareToCoords(targetSquare);
    const kingOffsets: [number, number][] = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1],
    ];
    
    for (const [rD, fD] of kingOffsets) {
        if (rD === undefined || fD === undefined) continue;
        const r = rank + rD;
        const f = file + fD;
        if (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
            const sq = coordsToSquare(r, f);
            if (occupied.has(sq)) {
                const piece = board.getPiece(sq);
                if (piece && piece.type === PieceType.King && piece.color === color) {
                    return sq;
                }
            }
        }
    }
    return null;
}
