/**
 * @file KingSafetyEvaluator.ts
 * @description Evaluate king safety
 */

import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';
import { Square, getFile, getRank } from '../core/Square';
import { getAttackersOf } from '../move-generation/AttackDetector';

/**
 * King safety scoring
 */
const PAWN_SHIELD_BONUS = 10; // Per pawn in front of king
const OPEN_FILE_NEAR_KING_PENALTY = -20; // Per open file near king
const SEMI_OPEN_FILE_NEAR_KING_PENALTY = -10; // Per semi-open file near king

/**
 * Evaluates king safety
 * Focuses on pawn shield, open files, and Threat Heatmaps near the king.
 */
export class KingSafetyEvaluator {
  /**
   * Evaluate king safety
   * Returns score from white's perspective
   * 
   * @param board Current board state
   * @param isEndgame Whether position is endgame (king safety less important)
   * @returns King safety score in centipawns
   */
  evaluate(board: Board, isEndgame: boolean): number {
    // King safety is less important in endgame
    if (isEndgame) {
      return 0;
    }

    let score = 0;

    score += this.evaluateKingSafety(board, Color.White);
    score -= this.evaluateKingSafety(board, Color.Black);

    return score;
  }

  /**
   * Evaluate king safety for one color
   * 
   * @param board Current board state
   * @param color Color to evaluate
   * @returns King safety score (positive = safe)
   */
  private evaluateKingSafety(board: Board, color: Color): number {
    let score = 0;

    const kingSquare = this.findKing(board, color);
    if (kingSquare === null) return 0; // No king (shouldn't happen in legal position)

    // Evaluate pawn shield
    score += this.evaluatePawnShield(board, kingSquare, color);

    // Evaluate open files near king
    score += this.evaluateOpenFiles(board, kingSquare, color);
    
    // Evaluate Threat Heatmap in the King Zone
    score += this.evaluateThreatHeatmap(board, kingSquare, color);

    return score;
  }

  /**
   * Find king position
   */
  private findKing(board: Board, color: Color): Square | null {
    for (let square = 0; square < 64; square++) {
      const piece = board.getPiece(square);
      if (!piece) continue;
      if (piece.type === PieceType.King && piece.color === color) {
        return square;
      }
    }
    return null;
  }

  private evaluatePawnShield(board: Board, kingSquare: Square, color: Color): number {
    const file = getFile(kingSquare);
    const rank = getRank(kingSquare);
    const direction = color === Color.White ? 1 : -1;

    let shieldScore = 0;

    // Check three files: king file and adjacent files
    const filesToCheck = [file - 1, file, file + 1].filter(f => f >= 0 && f < 8);

    // Determine if king is safely tucked away (castled or castling-like position)
    const isKingHome = (color === Color.White && rank <= 1) || (color === Color.Black && rank >= 6);
    const isCastled = isKingHome && (file <= 2 || file >= 5);

    for (const f of filesToCheck) {
      let hasPawn = false;
      let pawnRankOffset = 99;

      // Find the closest friendly pawn in front of the king on this file
      for (let rankOffset = 1; rankOffset <= 6; rankOffset++) {
        const checkRank = rank + (direction * rankOffset);
        if (checkRank < 0 || checkRank > 7) continue;

        const checkSquare = checkRank * 8 + f;
        const piece = board.getPiece(checkSquare);

        if (piece && piece.type === PieceType.Pawn && piece.color === color) {
          hasPawn = true;
          pawnRankOffset = rankOffset;
          break;
        }
      }

      if (hasPawn) {
        if (pawnRankOffset === 1) {
          // Perfect shield
          shieldScore += PAWN_SHIELD_BONUS * 2; 
        } else if (pawnRankOffset === 2) {
          // Pawn has moved 1 square
          shieldScore += PAWN_SHIELD_BONUS; 
          if (isCastled) {
            // King Shield Immutability: Penalize loosening the shield
            shieldScore -= 25; // Increased from -15
          }
        } else if (pawnRankOffset > 2) {
          // Pawn is pushed very far
          if (isCastled) {
            // Overextension Detection / King Safety Asymmetry:
            // Pushing the king shield leaves the king hopelessly exposed.
            // Massively penalize suicidal pawn storms.
            shieldScore -= 120; // Increased from -30
          } else {
            // Uncastled king with advanced pawns
            shieldScore -= 20; // Increased from -10
          }
        }
      } else {
        // Missing pawn on this file
        if (isCastled) {
          shieldScore -= 100; // Severe weakness, increased from -20
        } else {
          shieldScore -= 15; // Increased from -5
        }
      }
    }

    return shieldScore;
  }

  /**
   * Evaluate open and semi-open files near king
   * Open files are dangerous for king safety
   */
  private evaluateOpenFiles(board: Board, kingSquare: Square, color: Color): number {
    const file = getFile(kingSquare);
    let penalty = 0;

    // Check three files: king file and adjacent files
    const filesToCheck = [file - 1, file, file + 1].filter(f => f >= 0 && f < 8);

    for (const f of filesToCheck) {
      const fileStatus = this.getFileStatus(board, f, color);

      if (fileStatus === 'open') {
        penalty += OPEN_FILE_NEAR_KING_PENALTY;
      } else if (fileStatus === 'semi-open') {
        penalty += SEMI_OPEN_FILE_NEAR_KING_PENALTY;
      }
    }

    return penalty;
  }

  /**
   * Determine if a file is open, semi-open, or closed
   */
  private getFileStatus(board: Board, file: number, color: Color): 'open' | 'semi-open' | 'closed' {
    let hasFriendlyPawn = false;
    let hasEnemyPawn = false;
    const enemyColor = color === Color.White ? Color.Black : Color.White;

    // Check entire file
    for (let rank = 0; rank < 8; rank++) {
      const square = rank * 8 + file;
      const piece = board.getPiece(square);

      if (piece && piece.type === PieceType.Pawn) {
        if (piece.color === color) {
          hasFriendlyPawn = true;
        } else if (piece.color === enemyColor) {
          hasEnemyPawn = true;
        }
      }
    }

    if (!hasFriendlyPawn && !hasEnemyPawn) return 'open';
    if (!hasFriendlyPawn && hasEnemyPawn) return 'semi-open';
    return 'closed';
  }

  /**
   * Generates a Threat Heatmap around the King Zone (3x3 grid).
   * Penalizes the position if high-heat squares are near the king,
   * especially if our own pieces are standing on them (Preemptive Retreats logic).
   */
  private evaluateThreatHeatmap(board: Board, kingSquare: Square, color: Color): number {
    let penalty = 0;
    const enemyColor = color === Color.White ? Color.Black : Color.White;
    
    const kingFile = getFile(kingSquare);
    const kingRank = getRank(kingSquare);
    
    // Check the 3x3 grid around the king
    for (let f = Math.max(0, kingFile - 1); f <= Math.min(7, kingFile + 1); f++) {
      for (let r = Math.max(0, kingRank - 1); r <= Math.min(7, kingRank + 1); r++) {
        const sq = r * 8 + f;
        
        // Count attackers and defenders
        const attackersBB = getAttackersOf(board, sq, enemyColor);
        const defendersBB = getAttackersOf(board, sq, color);
        
        // Count bits to get number of attacking/defending pieces
        let attackersCount = 0;
        let bb = attackersBB;
        while(bb) { attackersCount++; bb &= bb - 1n; }
        
        let defendersCount = 0;
        let bb2 = defendersBB;
        while(bb2) { defendersCount++; bb2 &= bb2 - 1n; }
        
        // Heat calculation
        if (attackersCount > 0) {
          let heat = attackersCount * 15;
          heat -= defendersCount * 5; // Defenders mitigate heat, but attackers have initiative
          
          if (heat > 0) {
            const piece = board.getPiece(sq);
            if (piece) {
               if (piece.color === color && piece.type !== PieceType.King) {
                   // One of our pieces is on a high heat square near the king!
                   // This is a massive liability. The engine will actively want to retreat it!
                   penalty += heat * 2;
               } else if (piece.color === enemyColor) {
                   // Enemy piece already infiltrated the King Zone!
                   penalty += heat * 3;
               }
            } else {
               // Empty square near king is controlled by enemy (high heat)
               penalty += heat;
            }
          }
        }
      }
    }
    
    return -penalty; // Return as a negative score since it's a penalty
  }
}
