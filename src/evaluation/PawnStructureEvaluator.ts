/**
 * @file PawnStructureEvaluator.ts
 * @description Evaluate pawn structure weaknesses and strengths
 */

import { Board } from '../core/Board';
import { Color, PieceType } from '../core/Piece';
import { Square, getFile, getRank } from '../core/Square';

/**
 * Penalties and bonuses for pawn structure
 */
const DOUBLED_PAWN_PENALTY = -10;
const ISOLATED_PAWN_PENALTY = -15;
const BACKWARD_PAWN_PENALTY = -8;
const PASSED_PAWN_BONUS = [0, 10, 20, 35, 60, 100, 150, 0]; // By rank (rank 0 and 7 unused)

/**
 * Evaluates pawn structure
 * Identifies weaknesses (doubled, isolated, backward) and strengths (passed pawns)
 */
export class PawnStructureEvaluator {
  /**
   * Evaluate pawn structure
   * Returns score from white's perspective
   * 
   * @param board Current board state
   * @returns Pawn structure score in centipawns
   */
  evaluate(board: Board, isEndgame: boolean): number {
    let score = 0;

    score += this.evaluateColor(board, Color.White, isEndgame);
    score -= this.evaluateColor(board, Color.Black, isEndgame);

    // Snake Protocol: Pawn Tension Penalty
    // Penalise positions where pawns are directly threatening to capture each other.
    score += this.evaluatePawnTension(board);

    // Fortress Phase 2: Pawn Break Vulnerability Map
    // Anticipate pawn breaks up to 4 moves in advance and structurally penalize them.
    score += this.evaluatePawnBreakVulnerability(board);

    return score;
  }

  /**
   * Evaluate pawn structure for one color
   * 
   * @param board Current board state
   * @param color Color to evaluate
   * @returns Pawn structure score (positive = good)
   */
  private evaluateColor(board: Board, color: Color, isEndgame: boolean): number {
    let score = 0;
    const pawns = this.getPawns(board, color);

    // Analyze each pawn
    for (const square of pawns) {
      const file = getFile(square);

      // Check for doubled pawns
      if (this.isDoubled(pawns, square, file)) {
        score += DOUBLED_PAWN_PENALTY;
      }

      // Check for isolated pawns
      if (this.isIsolated(pawns, file)) {
        score += ISOLATED_PAWN_PENALTY;
      }

      // Check for backward pawns
      if (this.isBackward(pawns, board, square, color)) {
        score += BACKWARD_PAWN_PENALTY;
      }

      // Fortress Recognition: Pawn Chain Bonus
      // Reward pawns that are defended by other pawns, forming a solid structure
      if (this.isDefendedByPawn(pawns, square, color)) {
        score += 15;
      }

      // Fortress Recognition: Locked Pawn Bonus
      // Reward pawns that are blocked by enemy pawns. This prevents the engine
      // from voluntarily breaking established pawn blockades in defensive positions.
      if (this.isBlockedByEnemyPawn(board, square, color)) {
        score += 15;
      }

      // Check for passed pawns
      if (this.isPassed(board, square, color)) {
        const rank = getRank(square);
        const adjustedRank = color === Color.White ? rank : 7 - rank;
        let bonus = PASSED_PAWN_BONUS[adjustedRank] ?? 0;

        // Blockade Scoring: Check if the square in front is occupied by an enemy minor piece
        const direction = color === Color.White ? 1 : -1;
        const blockSquare = square + (direction * 8);
        if (blockSquare >= 0 && blockSquare <= 63) {
          const blockingPiece = board.getPiece(blockSquare);
          if (blockingPiece && blockingPiece.color !== color && 
             (blockingPiece.type === PieceType.Knight || blockingPiece.type === PieceType.Bishop)) {
             
             // The passed pawn is firmly blockaded! 
             // Severely reduce its bonus (reduce by 75%)
             bonus = Math.floor(bonus / 4); 
             
             // Implicitly reward the defender's blockade by penalizing the pawn owner
             // Increased to 40 to strongly encourage blockade
             score -= 40; 
          }
        }
        score += bonus;
      }

      // Structural Commitment Cost: Penalize early/unnecessary flank pawn pushes to encourage flexibility
      if (!isEndgame && (file < 3 || file > 4)) {
        const rank = getRank(square);
        const startRank = color === Color.White ? 1 : 6;
        const pushedSquares = Math.abs(rank - startRank);
        if (pushedSquares > 0) {
          score -= pushedSquares * 3; // -3 centipawns per pushed square
        }
      }
    }

    return score;
  }

  /**
   * Get all pawn positions for a color
   */
  private getPawns(board: Board, color: Color): Square[] {
    const pawns: Square[] = [];

    for (let square = 0; square < 64; square++) {
      const piece = board.getPiece(square);
      if (!piece) continue;
      if (piece.type === PieceType.Pawn && piece.color === color) {
        pawns.push(square);
      }
    }

    return pawns;
  }

  /**
   * Check if a pawn is doubled (another pawn on same file)
   */
  private isDoubled(pawns: Square[], square: Square, file: number): boolean {
    return pawns.some(otherSquare => {
      return otherSquare !== square && getFile(otherSquare) === file;
    });
  }

  /**
   * Check if a pawn is isolated (no friendly pawns on adjacent files)
   */
  private isIsolated(pawns: Square[], file: number): boolean {
    const adjacentFiles = [file - 1, file + 1].filter(f => f >= 0 && f < 8);

    return !pawns.some(square => {
      return adjacentFiles.includes(getFile(square));
    });
  }

  /**
   * Check if a pawn is backward
   * A pawn is backward if:
   * 1. It can't advance safely
   * 2. All friendly pawns on adjacent files are more advanced
   */
  private isBackward(pawns: Square[], _board: Board, square: Square, color: Color): boolean {
    const file = getFile(square);
    const rank = getRank(square);
    const direction = color === Color.White ? 1 : -1;

    // Check if advance square is attacked by enemy pawn
    const advanceSquare = square + (direction * 8);
    if (advanceSquare < 0 || advanceSquare > 63) return false;

    // Get friendly pawns on adjacent files
    const adjacentFiles = [file - 1, file + 1].filter(f => f >= 0 && f < 8);
    const adjacentPawns = pawns.filter(p => adjacentFiles.includes(getFile(p)));

    if (adjacentPawns.length === 0) return false; // Isolated pawns are handled separately

    // Check if all adjacent pawns are more advanced
    const allMoreAdvanced = adjacentPawns.every(pawn => {
      const pawnRank = getRank(pawn);
      return color === Color.White ? pawnRank > rank : pawnRank < rank;
    });

    return allMoreAdvanced;
  }

  /**
   * Check if a pawn is passed
   * A passed pawn has no enemy pawns blocking or controlling its path to promotion
   */
  private isPassed(board: Board, square: Square, color: Color): boolean {
    const file = getFile(square);
    const rank = getRank(square);
    const enemyColor = color === Color.White ? Color.Black : Color.White;

    // Check files: current file and adjacent files
    const filesToCheck = [file - 1, file, file + 1].filter(f => f >= 0 && f < 8);

    // Define ranks to check based on color
    const ranksToCheck = color === Color.White
      ? Array.from({ length: 8 - rank - 1 }, (_, i) => rank + i + 1) // Ranks ahead for white
      : Array.from({ length: rank }, (_, i) => rank - i - 1); // Ranks ahead for black

    // Check if any enemy pawn blocks or controls the path
    for (let enemySquare = 0; enemySquare < 64; enemySquare++) {
      const piece = board.getPiece(enemySquare);
      if (!piece) continue;
      if (piece.type === PieceType.Pawn && piece.color === enemyColor) {
        const enemyFile = getFile(enemySquare);
        const enemyRank = getRank(enemySquare);

        if (filesToCheck.includes(enemyFile) && ranksToCheck.includes(enemyRank)) {
          return false; // Blocked by enemy pawn
        }
      }
    }

    return true;
  }

  /**
   * Check if a pawn is defended by another friendly pawn
   */
  private isDefendedByPawn(pawns: Square[], square: Square, color: Color): boolean {
    const direction = color === Color.White ? -1 : 1; // Look backwards for defenders
    const file = getFile(square);
    const rank = getRank(square);
    
    // Check left and right defender squares
    const defenderRanks = [rank + direction];
    const defenderFiles = [file - 1, file + 1].filter(f => f >= 0 && f < 8);
    
    for (const pawn of pawns) {
      if (defenderRanks.includes(getRank(pawn)) && defenderFiles.includes(getFile(pawn))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a pawn is immediately blocked by an enemy pawn
   */
  private isBlockedByEnemyPawn(board: Board, square: Square, color: Color): boolean {
    const direction = color === Color.White ? 1 : -1;
    const advanceSquare = square + (direction * 8);
    if (advanceSquare >= 0 && advanceSquare <= 63) {
      const piece = board.getPiece(advanceSquare);
      if (piece && piece.type === PieceType.Pawn && piece.color !== color) {
        return true;
      }
    }
    return false;
  }

  /**
   * Calculate the Pawn Tension Penalty (Snake Protocol).
   *
   * Pawn tension exists when a White pawn can diagonally capture a Black pawn
   * or vice versa on the next move. Each such pair is a latent file-opener:
   * whichever side captures will open a file, benefiting the attacking player.
   *
   * By penalising tension, the engine is steered toward manoeuvring moves that
   * defuse tension without capturing, keeping the pawn structure frozen and all
   * files closed — ideal for long defensive grinding games.
   *
   * The penalty is applied symmetrically: White pawn tension penalises White
   * (reduces the score), Black pawn tension penalises Black (raises the score
   * from White's perspective, which also reduces Black's effective score).
   *
   * @param board - Current board state
   * @returns Tension score from White's perspective (negative = White penalised,
   *          positive = Black penalised)
   */
  evaluatePawnTension(board: Board): number {
    const PAWN_TENSION_PENALTY = -10; // centipawns per tense pawn pair
    let score = 0;

    for (let square = 0; square < 64; square++) {
      const piece = board.getPiece(square);
      if (!piece) continue;
      if (piece.type !== PieceType.Pawn) continue;

      const file = getFile(square);
      const rank = getRank(square);

      if (piece.color === Color.White) {
        // A White pawn on (rank, file) attacks (rank+1, file-1) and (rank+1, file+1)
        for (const targetFile of [file - 1, file + 1]) {
          if (targetFile < 0 || targetFile > 7) continue;
          const targetRank = rank + 1;
          if (targetRank > 7) continue;
          const targetSq = targetRank * 8 + targetFile;
          const target = board.getPiece(targetSq);

          if (target && target.type === PieceType.Pawn && target.color === Color.Black) {
            // White pawn in tension with a Black pawn — penalise White
            score += PAWN_TENSION_PENALTY;
          }
        }
      } else {
        // A Black pawn on (rank, file) attacks (rank-1, file-1) and (rank-1, file+1)
        for (const targetFile of [file - 1, file + 1]) {
          if (targetFile < 0 || targetFile > 7) continue;
          const targetRank = rank - 1;
          if (targetRank < 0) continue;
          const targetSq = targetRank * 8 + targetFile;
          const target = board.getPiece(targetSq);

          if (target && target.type === PieceType.Pawn && target.color === Color.White) {
            // Black pawn in tension with a White pawn — penalise Black (raise White's score)
            score -= PAWN_TENSION_PENALTY; // Double negative = positive = penalises Black
          }
        }
      }
    }

    return score;
  }

  /**
   * Calculate the Pawn Break Vulnerability Map.
   * 
   * This extends the Pawn Tension concept by looking 2-4 moves into the future.
   * If an opponent has a pawn on an adjacent file that can advance to attack
   * our pawn, we apply a structural penalty based on how many moves away the break is.
   * This forces the engine to proactively place pawns on squares where they cannot
   * be undermined in the future, creating true structural fortresses.
   */
  evaluatePawnBreakVulnerability(board: Board): number {
    let score = 0;

    for (let square = 0; square < 64; square++) {
      const piece = board.getPiece(square);
      if (!piece || piece.type !== PieceType.Pawn) continue;

      const file = getFile(square);
      const rank = getRank(square);
      const isWhite = piece.color === Color.White;

      for (const targetFile of [file - 1, file + 1]) {
        if (targetFile < 0 || targetFile > 7) continue;

        // Find the most advanced enemy pawn on the target file that hasn't passed us yet
        let enemyPawnRank = -1;
        
        if (isWhite) {
          // Look for Black pawns ahead of the White pawn
          for (let r = rank + 2; r <= 6; r++) { // Start at rank+2 because rank+1 is direct tension
            const targetSq = r * 8 + targetFile;
            const targetPiece = board.getPiece(targetSq);
            if (targetPiece && targetPiece.type === PieceType.Pawn && targetPiece.color === Color.Black) {
              enemyPawnRank = r;
              break; // Found the closest one
            }
          }
        } else {
          // Look for White pawns ahead of the Black pawn (lower ranks)
          for (let r = rank - 2; r >= 1; r--) {
            const targetSq = r * 8 + targetFile;
            const targetPiece = board.getPiece(targetSq);
            if (targetPiece && targetPiece.type === PieceType.Pawn && targetPiece.color === Color.White) {
              enemyPawnRank = r;
              break;
            }
          }
        }

        if (enemyPawnRank !== -1) {
          // Calculate moves required for the enemy pawn to reach tension
          const movesAway = isWhite ? (enemyPawnRank - rank - 1) : (rank - enemyPawnRank - 1);
          
          let penalty = 0;
          if (movesAway === 1) penalty = -5;
          else if (movesAway === 2) penalty = -3;
          else if (movesAway === 3) penalty = -2;
          else if (movesAway === 4) penalty = -1;

          // Apply penalty symmetrically
          if (isWhite) {
            score += penalty; // Penalize White
          } else {
            score -= penalty; // Penalize Black (raise White's score)
          }
        }
      }
    }

    return score;
  }
}
