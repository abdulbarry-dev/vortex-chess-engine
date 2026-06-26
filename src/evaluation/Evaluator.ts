/**
 * @file Evaluator.ts
 * @description Main evaluation coordinator
 * 
 * Combines all evaluation components with appropriate weights
 * to produce a single score representing the position's value.
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color, PieceType } from '../core/Piece';
import { KingSafetyEvaluator } from './KingSafetyEvaluator';
import { MaterialEvaluator } from './MaterialEvaluator';
import { MobilityEvaluator } from './MobilityEvaluator';
import { PawnStructureEvaluator } from './PawnStructureEvaluator';
import { PieceSquareEvaluator } from './PieceSquareTables';
import { NnueEvaluator } from '../nnue/NnueEvaluator';
import { CoordinationEvaluator } from './CoordinationEvaluator';
import { OverextensionEvaluator } from './OverextensionEvaluator';
import { BlockadeEvaluator } from './BlockadeEvaluator';


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
  COORDINATION: 0.3,       // Defensive piece clustering
  OVEREXTENSION: 1.2,      // Penalize opponent for unsupported aggression
  BLOCKADE: 1.0,           // Pawn structure gridlocking (closed/locked positions)
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
  private readonly coordination: CoordinationEvaluator;
  private readonly overextension: OverextensionEvaluator;

  private readonly blockade: BlockadeEvaluator;
  private readonly nnue: NnueEvaluator;
  
  /** Toggle NNUE evaluation */
  public useNnue: boolean = false;

  constructor(
    material?: MaterialEvaluator,
    pieceSquare?: PieceSquareEvaluator,
    pawnStructure?: PawnStructureEvaluator,
    kingSafety?: KingSafetyEvaluator,
    mobility?: MobilityEvaluator | null,
    coordination?: CoordinationEvaluator
  ) {
    this.material = material || new MaterialEvaluator();
    this.pieceSquare = pieceSquare || new PieceSquareEvaluator();
    this.pawnStructure = pawnStructure || new PawnStructureEvaluator();
    this.kingSafety = kingSafety || new KingSafetyEvaluator();
    this.mobility = mobility || null; // Null = skip mobility evaluation
    this.coordination = coordination || new CoordinationEvaluator();
    this.overextension = new OverextensionEvaluator();

    this.blockade = new BlockadeEvaluator();
    this.nnue = new NnueEvaluator();
  }

  /**
   * Evaluate position
   * Returns score from white's perspective (positive = white advantage)
   * 
   * @param board Current board state
   * @param state Current game state
   * @returns Evaluation score in centipawns
   */
  evaluate(board: Board, state: GameState, _currentVolatility: number = 0): number {
    if (this.useNnue) {
      // NNUE returns score from perspective of side to move
      const nnueScore = this.nnue.evaluate(board, state);
      // Evaluator interface returns score from white's perspective
      return state.currentPlayer === Color.White ? nnueScore : -nnueScore;
    }

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
      score += this.pawnStructure.evaluate(board, isEndgame) * EVALUATION_WEIGHTS.PAWN_STRUCTURE;
    }

    if (EVALUATION_WEIGHTS.KING_SAFETY > 0) {
      score += this.kingSafety.evaluate(board, isEndgame) * EVALUATION_WEIGHTS.KING_SAFETY;
    }

    if (EVALUATION_WEIGHTS.COORDINATION > 0) {
      score += this.coordination.evaluate(board, state, isEndgame) * EVALUATION_WEIGHTS.COORDINATION;
    }

    // Mobility is expensive, only calculate if needed
    if (this.mobility && EVALUATION_WEIGHTS.MOBILITY > 0) {
      score += this.mobility.evaluate(board, state, isEndgame) * EVALUATION_WEIGHTS.MOBILITY;
    }

    let overextensionScore = 0;
    if (EVALUATION_WEIGHTS.OVEREXTENSION > 0) {
      overextensionScore = this.overextension.evaluate(board) * EVALUATION_WEIGHTS.OVEREXTENSION;
      score += overextensionScore;
    }

    // Pawn Structure Gridlocking (Blockade Evaluator)
    // Rewards locked pawn structures that extend game length and reduce the opponent's
    // attacking options. Core to Vortex's long defensive game strategy.
    if (EVALUATION_WEIGHTS.BLOCKADE > 0 && !isEndgame) {
      score += this.blockade.evaluate(board) * EVALUATION_WEIGHTS.BLOCKADE;
    }

    let finalScore = Math.round(score);

    // Kramnik's Berlin Heuristic
    if (queenCount === 0 && totalMaterial >= ENDGAME_MATERIAL_THRESHOLD) {
      finalScore -= 30; // Bonus for Black
    }

    // Fortress Mode Trigger
    if (Math.abs(finalScore) > 200) {
      const fortressFactor = this.calculateFortressFactor(board, isEndgame);
      finalScore = Math.round(finalScore * fortressFactor);
    }

    // Swindle Mode Trigger (Anti-Trade Heuristic)
    // When heavily losing, artificially inflate the evaluation slightly to discourage
    // trading into a trivially lost endgame. (Complexity removed for performance).
    if (finalScore < -200) {
      finalScore += 25;
    } else if (finalScore > 200) {
      finalScore -= 25;
    }

    // (Counterattack Mode and Stability Grind Mode removed for performance.
    // Generating attacks and complexity at every leaf node caused severe depth collapse.)

    // Endgame Tablebase Magnetism (Piece Count Gravity)
    // When losing, reward positions that approach the 7-piece tablebase threshold,
    // incentivizing the engine to seek drawn endgames mathematically.
    finalScore += this.calculateTablebaseMagnetism(board, finalScore);

    // 50-Move Rule Gravity (Draw by Attrition)
    // When losing, reward positions with a high halfmoveClock to incentivise
    // piece shuffles over pawn pushes or captures, running down the draw clock.
    finalScore += this.calculateAttritionBonus(finalScore, state.halfmoveClock);

    return finalScore;
  }

  /**
   * Calculate the Attrition Bonus for the 50-Move Rule Gravity system.
   *
   * Applies an increasing bonus to positions where the halfmoveClock is high
   * and the engine is losing, steering the search toward non-resetting moves.
   * Activates Clock Danger Mode (higher bonus) when halfmoveClock >= 80 plies.
   *
   * @param finalScore    - Current evaluation score from White's perspective
   * @param halfmoveClock - Current halfmove clock value (100 = fifty-move draw)
   * @returns Bonus in centipawns (positive favours White, negative favours Black)
   */
  private calculateAttritionBonus(finalScore: number, halfmoveClock: number): number {
    // Only activate when meaningfully behind and the clock is advanced
    if (halfmoveClock < 10) return 0;
    if (Math.abs(finalScore) < 100) return 0; // Position roughly equal — no attrition needed

    // Clock Danger Mode: boost the bonus significantly when 40+ moves have elapsed without reset
    const maxBonus = halfmoveClock >= 80 ? 60 : 40;
    const bonus = Math.round((halfmoveClock / 100) * maxBonus);

    if (finalScore < -100) {
      // White is losing — raise White's score toward 0 to reward non-resetting moves
      return bonus;
    } else if (finalScore > 100) {
      // Black is losing — lower White's score toward 0 to reward Black's non-resetting moves
      return -bonus;
    }

    return 0;
  }

  /**
   * Calculate the Tablebase Magnetism Bonus.
   *
   * Simulates Syzygy tablebase gravity by heavily rewarding the defending side
   * for reaching 7-piece endgames, and providing a steady gravitational pull
   * toward simplification.
   *
   * @param board      - Current board state
   * @param finalScore - Current evaluation score (White's perspective)
   * @returns Bonus in centipawns (positive helps White, negative helps Black)
   */
  private calculateTablebaseMagnetism(board: Board, finalScore: number): number {
    if (Math.abs(finalScore) < 50) return 0; // Only activates when tangibly behind

    let totalPieces = 0;
    let nonPawnPieces = 0;

    for (const [_sq, piece] of board.getAllPieces()) {
      totalPieces++;
      if (piece.type !== PieceType.Pawn && piece.type !== PieceType.King) {
        nonPawnPieces++;
      }
    }

    // 1. Simplification Gravity (+8cp per traded non-pawn piece)
    let bonus = (14 - nonPawnPieces) * 8;

    // 2. Tablebase Threshold Anchor (+50cp flat if <= 7 pieces total)
    if (totalPieces <= 7) {
      bonus += 50;
    }

    // Cap the bonus so we never flip the sign or completely flatten the evaluation gradient.
    // We allow reducing the magnitude of the advantage by at most 50%.
    bonus = Math.min(bonus, Math.abs(finalScore) * 0.5);

    if (finalScore < -50) {
      // White is losing — reward White for nearing tablebases
      return bonus;
    } else if (finalScore > 50) {
      // Black is losing — reward Black for nearing tablebases
      return -bonus;
    }

    return 0;
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
   * Calculates a factor between 0.0 and 1.0 to scale down the score if fortress conditions are met.
   */
  private calculateFortressFactor(board: Board, _isEndgame: boolean): number {
    let factor = 1.0;
    
    // 1. Opposite Colored Bishops
    let whiteBishops = 0;
    let blackBishops = 0;
    let whiteBishopSquare = -1;
    let blackBishopSquare = -1;
    
    let otherPiecesCount = 0;

    for (const [square, piece] of board.getAllPieces()) {
      if (piece.type === PieceType.Bishop) {
        if (piece.color === Color.White) {
          whiteBishops++;
          whiteBishopSquare = square;
        } else {
          blackBishops++;
          blackBishopSquare = square;
        }
      } else if (piece.type !== PieceType.Pawn && piece.type !== PieceType.King) {
        otherPiecesCount++;
      }
    }

    const isLightSquare = (sq: number) => ((Math.floor(sq / 8) + (sq % 8)) % 2 !== 0);
    const hasOppositeColoredBishops = 
      whiteBishops === 1 && 
      blackBishops === 1 && 
      isLightSquare(whiteBishopSquare) !== isLightSquare(blackBishopSquare);

    if (hasOppositeColoredBishops) {
      factor *= 0.5; // Opposite colored bishops heavily drawish
      if (otherPiecesCount === 0) {
        factor *= 0.5; // Only bishops and pawns -> very high draw tendency
      }
    }

    // 2. Locked pawn chains
    let blockedPawns = 0;
    let totalPawns = 0;
    for (const [square, piece] of board.getAllPieces()) {
      if (piece.type === PieceType.Pawn) {
        totalPawns++;
        const direction = piece.color === Color.White ? 1 : -1;
        const advanceSquare = square + (direction * 8);
        if (advanceSquare >= 0 && advanceSquare <= 63 && board.getPiece(advanceSquare) !== null) {
          blockedPawns++;
        }
      }
    }

    if (totalPawns > 0) {
      // If a large number of pawns are blocked, the position is closed/locked
      if (blockedPawns >= 10) {
        factor *= 0.5;
      } else if (blockedPawns >= 6) {
        factor *= 0.75;
      }
      
      // 3. Lack of Open Files for heavy pieces
      let openFiles = 0;
      for (let file = 0; file < 8; file++) {
        let hasPawns = false;
        for (const [sq, p] of board.getAllPieces()) {
          if (p.type === PieceType.Pawn && (sq % 8) === file) {
            hasPawns = true;
            break;
          }
        }
        if (!hasPawns) openFiles++;
      }
      
      // If there are no open files and many pawns are blocked, it is a very strong fortress
      if (openFiles === 0 && blockedPawns >= 8) {
        factor *= 0.4; // Extreme drawish tendency
      } else if (openFiles <= 1 && blockedPawns >= 6) {
        factor *= 0.6;
      }
    }

    return factor;
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
    coordination: number;
    total: number;
  } {
    const isEndgame = this.isEndgame(board);

    const material = this.material.evaluate(board) * EVALUATION_WEIGHTS.MATERIAL;
    const pieceSquare = this.pieceSquare.evaluate(board, isEndgame) * EVALUATION_WEIGHTS.PIECE_SQUARE;
    const pawnStructure = this.pawnStructure.evaluate(board, isEndgame) * EVALUATION_WEIGHTS.PAWN_STRUCTURE;
    const kingSafety = this.kingSafety.evaluate(board, isEndgame) * EVALUATION_WEIGHTS.KING_SAFETY;
    const coordination = this.coordination.evaluate(board, state, isEndgame) * EVALUATION_WEIGHTS.COORDINATION;
    const mobility = this.mobility ? this.mobility.evaluate(board, state, isEndgame) * EVALUATION_WEIGHTS.MOBILITY : 0;

    return {
      material,
      pieceSquare,
      pawnStructure,
      kingSafety,
      mobility,
      coordination,
      total: Math.round(material + pieceSquare + pawnStructure + kingSafety + coordination + mobility),
    };
  }
}
