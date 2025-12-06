/**
 * @file index.ts
 * @description Central export point for all type definitions
 */

// Board types
export type {
    AllCastlingRights, CastlingRights, UndoInfo
} from './Board.types';

// Move types
export { MoveFlags } from './Move.types';
export type { Move } from './Move.types';

// Search types
export type {
    SearchInfo, SearchResult,
    TTEntry
} from './Search.types';

// Evaluation types
export { GamePhase } from './Evaluation.types';
export type { EvaluationWeights } from './Evaluation.types';

// Re-export core types for convenience
export { Color, PieceType } from '../core/Piece';
export type { Piece } from '../core/Piece';
export type { Square } from '../core/Square';

