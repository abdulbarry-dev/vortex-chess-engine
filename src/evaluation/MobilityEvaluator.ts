/**
 * @file MobilityEvaluator.ts
 * @description Evaluate piece mobility (number of legal moves) and Piece Activity Poisoning
 */

import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Color, PieceType } from '../core/Piece';
import { MoveGenerator } from '../move-generation/MoveGenerator';
import { getAttackedSquares } from '../move-generation/AttackDetector';

/**
 * Mobility bonus per safe legal move
 * Encourages piece activity and flexibility
 */
const MOBILITY_BONUS = 2; // Increased to prioritize Strategic Entropy

/**
 * Evaluates piece mobility and Piece Activity Poisoning (Karpov Constriction).
 * More legal moves = better position (more options).
 * Severely restricted advanced pieces incur a massive structural penalty.
 */
export class MobilityEvaluator {
  private readonly moveGenerator: MoveGenerator;

  constructor(moveGenerator: MoveGenerator) {
    this.moveGenerator = moveGenerator;
  }

  /**
   * Evaluate mobility and constriction
   * Returns score from white's perspective
   * 
   * @param board Current board state
   * @param state Current game state
   * @param isEndgame Whether position is endgame
   * @returns Mobility score in centipawns
   */
  evaluate(board: Board, state: GameState, isEndgame: boolean): number {
    // Mobility is less important in endgame, but constriction remains critical
    const mobilityWeight = isEndgame ? 0.5 : 1.0;
    const constrictionWeight = isEndgame ? 1.5 : 1.0; // In endgames, a trapped piece is fatal

    let score = 0;

    const whiteEval = this.evaluateColorMobility(board, state, Color.White);
    score += whiteEval.totalMobility * MOBILITY_BONUS * mobilityWeight;
    score -= whiteEval.constrictionScore * constrictionWeight; // Penalize White for restricted pieces

    const blackEval = this.evaluateColorMobility(board, state, Color.Black);
    score -= blackEval.totalMobility * MOBILITY_BONUS * mobilityWeight;
    score += blackEval.constrictionScore * constrictionWeight; // Reward White for Black's restricted pieces

    return Math.round(score);
  }

  /**
   * Evaluate safe legal moves and calculate Karpov Constriction penalties
   * 
   * @param board Current board state
   * @param state Current game state
   * @param color Color to count moves for
   * @returns Object containing total safe moves and the constriction penalty score
   */
  private evaluateColorMobility(board: Board, state: GameState, color: Color): { totalMobility: number, constrictionScore: number } {
    // Temporarily switch turn
    const originalPlayer = state.currentPlayer;
    state.currentPlayer = color;

    const moves = this.moveGenerator.generateLegalMoves(board, state);
    const opponentColor = color === Color.White ? Color.Black : Color.White;
    const attackedSquares = getAttackedSquares(board, opponentColor);
    
    // Track mobility per piece (using origin square as ID)
    const pieceMobility = new Map<number, number>();
    
    // Initialize all minor/major pieces with 0 mobility so we can detect completely trapped pieces
    for (let square = 0; square < 64; square++) {
      const p = board.getPiece(square);
      if (p && p.color === color && p.type !== PieceType.King && p.type !== PieceType.Pawn) {
        pieceMobility.set(square, 0);
      }
    }
    
    let totalSafeMoves = 0;
    for (const move of moves) {
      // Do not count King moves for mobility
      if (move.piece.type === PieceType.King) continue; 
      
      // Only count safe moves (squares not attacked by the opponent)
      if ((attackedSquares & (1n << BigInt(move.to))) === 0n) {
        totalSafeMoves++;
        
        if (move.piece.type !== PieceType.Pawn) {
            const currentMobility = pieceMobility.get(move.from) || 0;
            pieceMobility.set(move.from, currentMobility + 1);
        }
      }
    }
    
    let constrictionScore = 0;
    let maxMobility = 0;
    
    // Karpov Constriction: Check for poisoned/trapped active pieces
    for (const [square, mobility] of pieceMobility.entries()) {
      const piece = board.getPiece(square);
      if (!piece) continue;
      
      // Update max mobility for Ceiling Targeting
      if (mobility > maxMobility) {
         maxMobility = mobility;
      }
      
      // Only consider Knights, Bishops, and Rooks for constriction
      if (piece.type === PieceType.Knight || piece.type === PieceType.Bishop || piece.type === PieceType.Rook) {
        const rank = Math.floor(square / 8);
        // A piece is "advanced" if it has left its first two ranks
        const isAdvanced = color === Color.White ? rank >= 2 : rank <= 5; 
        
        if (isAdvanced && mobility <= 2) {
            // Massive penalty for having an advanced piece with almost no safe moves
            // This teaches the engine to suffocate enemy pieces (Karpov style)
            if (mobility === 0) constrictionScore += 50;      // Completely trapped
            else if (mobility === 1) constrictionScore += 30; // 1 safe square (highly vulnerable)
            else if (mobility === 2) constrictionScore += 15; // 2 safe squares (constricted)
        }
      }
    }
    
    // Mobility Ceiling Targeting:
    // Exponentially penalize the highest mobility piece. 
    // This rewards moves that specifically suppress the opponent's most active piece,
    // functionally removing it from the attack without trading.
    const ceilingPenalty = Math.floor(Math.pow(maxMobility, 1.5) * 1.5);
    const totalPenalty = constrictionScore + ceilingPenalty;
    
    // Restore turn
    state.currentPlayer = originalPlayer;
    return { totalMobility: totalSafeMoves, constrictionScore: totalPenalty };
  }
}
