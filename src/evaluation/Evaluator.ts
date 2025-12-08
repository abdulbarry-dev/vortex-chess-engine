/**
 * @file Evaluator.ts
 * @description Main evaluation coordinator
 * 
 * Combines all evaluation components with appropriate weights
 * to produce a single score representing the position's value.
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { PieceType } from '../core/Piece';
import { KingSafetyEvaluator } from './KingSafetyEvaluator';
import { MaterialEvaluator } from './MaterialEvaluator';
import { MobilityEvaluator } from './MobilityEvaluator';
import { PawnStructureEvaluator } from './PawnStructureEvaluator';
import { PieceSquareEvaluator } from './PieceSquareTables';

/**
 * Evaluation component weights
 * Tune these values to adjust engine style
 */
export const EVALUATION_WEIGHTS = {
  MATERIAL: 1.0,           // Material is most important
  PIECE_SQUARE: 1.0,       // Positional bonuses
  PAWN_STRUCTURE: 0.5,     // Pawn structure
  KING_SAFETY: 1.5,        // King safety (critical in middlegame)
  MOBILITY: 0.1,           // Piece mobility (subtle influence)
};

/**
 * Threshold for determining endgame
 * Based on material count (queens + rooks + minors)
 */
const ENDGAME_MATERIAL_THRESHOLD = 1300; // ~Q+R or 2R+minor

/**
 * Main evaluation coordinator
 * Combines all evaluation components
 */
export class Evaluator {
  private readonly material: MaterialEvaluator;
  private readonly pieceSquare: PieceSquareEvaluator;
  private readonly pawnStructure: PawnStructureEvaluator;
  private readonly kingSafety: KingSafetyEvaluator;
  private readonly mobility: MobilityEvaluator | null;

  constructor(
    material?: MaterialEvaluator,
    pieceSquare?: PieceSquareEvaluator,
    pawnStructure?: PawnStructureEvaluator,
    kingSafety?: KingSafetyEvaluator,
    mobility?: MobilityEvaluator | null
  ) {
    this.material = material || new MaterialEvaluator();
    this.pieceSquare = pieceSquare || new PieceSquareEvaluator();
    this.pawnStructure = pawnStructure || new PawnStructureEvaluator();
    this.kingSafety = kingSafety || new KingSafetyEvaluator();
    this.mobility = mobility || null; // Null = skip mobility evaluation
  }

  /**
   * Evaluate position
   * Returns score from white's perspective (positive = white advantage)
   * 
   * @param board Current board state
   * @param state Current game state
   * @returns Evaluation score in centipawns
   */
  evaluate(board: Board, state: GameState): number {
    // Material evaluation (most important) - always fast
    const materialScore = this.material.evaluate(board) * EVALUATION_WEIGHTS.MATERIAL;

    // Quick endgame check (inlined for performance)
    let totalMaterial = 0;
    let queenCount = 0;
    for (const [_square, piece] of board.getAllPieces()) {
      if (piece.type === PieceType.Knight || piece.type === PieceType.Bishop) {
        totalMaterial += 320;
      } else if (piece.type === PieceType.Rook) {
        totalMaterial += 500;
      } else if (piece.type === PieceType.Queen) {
        totalMaterial += 900;
        queenCount++;
      }
    }
    const isEndgame = queenCount === 0 || totalMaterial < ENDGAME_MATERIAL_THRESHOLD;

    // Piece-square tables (positional evaluation) - fast lookup
    const pieceSquareScore = this.pieceSquare.evaluate(board, isEndgame) * EVALUATION_WEIGHTS.PIECE_SQUARE;

    // Combined base score
    let score = materialScore + pieceSquareScore;

    // Only compute expensive evaluations if weights are non-zero
    if (EVALUATION_WEIGHTS.PAWN_STRUCTURE > 0) {
      score += this.pawnStructure.evaluate(board) * EVALUATION_WEIGHTS.PAWN_STRUCTURE;
    }

    if (EVALUATION_WEIGHTS.KING_SAFETY > 0) {
      score += this.kingSafety.evaluate(board, isEndgame) * EVALUATION_WEIGHTS.KING_SAFETY;
    }

    // Mobility is expensive, only calculate if needed
    if (this.mobility && EVALUATION_WEIGHTS.MOBILITY > 0) {
      score += this.mobility.evaluate(board, state, isEndgame) * EVALUATION_WEIGHTS.MOBILITY;
    }

    return Math.round(score);
  }

  /**
   * Determine if position is endgame
   * Endgame is defined as having low material (no queens or limited pieces)
   * 
   * @param board Current board state
   * @returns True if position is endgame
   */
  private isEndgame(board: Board): boolean {
    let totalMaterial = 0;
    let queenCount = 0;

    for (const [_square, piece] of board.getAllPieces()) {
      // Count material (excluding pawns and kings)
      if (piece.type === PieceType.Knight || piece.type === PieceType.Bishop) {
        totalMaterial += 320; // Average minor piece value
      } else if (piece.type === PieceType.Rook) {
        totalMaterial += 500;
      } else if (piece.type === PieceType.Queen) {
        totalMaterial += 900;
        queenCount++;
      }
    }

    // Endgame if:
    // 1. No queens on board, OR
    // 2. Total material is low (both sides combined)
    return queenCount === 0 || totalMaterial < ENDGAME_MATERIAL_THRESHOLD;
  }

  /**
   * Get evaluation components breakdown
   * Useful for debugging and tuning
   * 
   * @param board Current board state
   * @param state Current game state
   * @returns Object with individual component scores
   */
  getEvaluationBreakdown(board: Board, state: GameState): {
    material: number;
    pieceSquare: number;
    pawnStructure: number;
    kingSafety: number;
    mobility: number;
    total: number;
  } {
    const isEndgame = this.isEndgame(board);

    const material = this.material.evaluate(board) * EVALUATION_WEIGHTS.MATERIAL;
    const pieceSquare = this.pieceSquare.evaluate(board, isEndgame) * EVALUATION_WEIGHTS.PIECE_SQUARE;
    const pawnStructure = this.pawnStructure.evaluate(board) * EVALUATION_WEIGHTS.PAWN_STRUCTURE;
    const kingSafety = this.kingSafety.evaluate(board, isEndgame) * EVALUATION_WEIGHTS.KING_SAFETY;
    const mobility = this.mobility ? this.mobility.evaluate(board, state, isEndgame) * EVALUATION_WEIGHTS.MOBILITY : 0;

    return {
      material,
      pieceSquare,
      pawnStructure,
      kingSafety,
      mobility,
      total: Math.round(material + pieceSquare + pawnStructure + kingSafety + mobility),
    };
  }
}
