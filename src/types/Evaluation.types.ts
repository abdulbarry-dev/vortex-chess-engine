/**
 * @file Evaluation.types.ts
 * @description Type definitions for evaluation-related structures
 */

/**
 * Game phase indicator
 */
export enum GamePhase {
  Opening = 'opening',
  Middlegame = 'middlegame',
  Endgame = 'endgame',
}

/**
 * Evaluation weights configuration
 */
export interface EvaluationWeights {
  material: {
    pawn: number;
    knight: number;
    bishop: number;
    rook: number;
    queen: number;
  };
  positional: {
    pieceSquareTableWeight: number;
    mobilityWeight: number;
  };
  pawnStructure: {
    doubledPawnPenalty: number;
    isolatedPawnPenalty: number;
    passedPawnBonus: number;
  };
  kingSafety: {
    pawnShieldBonus: number;
    openFileNearKingPenalty: number;
  };
}
