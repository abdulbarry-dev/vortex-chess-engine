import { Board } from '../core/Board';
import { GameState } from '../core/GameState';
import { Move } from '../types/Move.types';
import { MoveGenerator, MoveGenType } from '../move-generation/MoveGenerator';
import { MoveOrderer } from './MoveOrdering';
import { staticExchangeEvaluation } from './StaticExchangeEvaluation';

export enum MovePickerStage {
  HashMove,
  CapturesGen,
  Captures,
  Killers,
  QuietsGen,
  Quiets,
  BadCaptures,
  Done
}

export class MovePicker {
  private stage: MovePickerStage = MovePickerStage.HashMove;
  
  // Buffers for moves
  private captures: Move[] = [];
  private badCaptures: Move[] = [];
  private quiets: Move[] = [];
  
  private index: number = 0;
  private hashMoveValid: boolean = false;

  constructor(
    private board: Board,
    private state: GameState,
    private moveGenerator: MoveGenerator,
    private moveOrderer: MoveOrderer,
    private hashMove: Move | null,
    private ply: number,
    private threatMove: Move | null = null,
    private qSearch: boolean = false
  ) {
    if (this.hashMove && this.qSearch === false) { // We skip hash moves in qSearch for now
      this.hashMoveValid = true;
    } else {
      this.stage = MovePickerStage.CapturesGen;
    }
  }

  nextMove(): Move | null {
    while (true) {
      switch (this.stage) {
        case MovePickerStage.HashMove:
          this.stage = MovePickerStage.CapturesGen;
          if (this.hashMoveValid && this.hashMove) {
            // Ideally we should verify if hash move is pseudo-legal here to avoid crashes
            // For now, assume it's valid if we found it in TT, but skip if we see it again later
            return this.hashMove;
          }
          break;

        case MovePickerStage.CapturesGen:
          // Generate all captures (pseudo-legal)
          let allCaptures = this.moveGenerator.generatePseudoLegalMoves(this.board, this.state, MoveGenType.Captures);
          
          for (const move of allCaptures) {
            if (this.hashMoveValid && this.hashMove && this.movesEqual(move, this.hashMove)) continue;

            const seeScore = staticExchangeEvaluation(this.board, move);
            if (seeScore < 0) {
              this.badCaptures.push(move);
            } else {
              this.captures.push(move);
            }
          }
          
          // Order good captures using MoveOrderer
          this.captures = this.moveOrderer.orderMoves(this.captures, this.board, null, this.ply, this.threatMove);
          
          this.index = 0;
          this.stage = MovePickerStage.Captures;
          break;

        case MovePickerStage.Captures:
          if (this.index < this.captures.length) {
            return this.captures[this.index++] as Move;
          }
          if (this.qSearch) {
            this.stage = MovePickerStage.Done;
          } else {
            this.stage = MovePickerStage.Killers; // Not implemented separately yet, handled in quiets
          }
          break;

        case MovePickerStage.Killers:
          // We can optionally yield killers here if we verify they are legal.
          // For now, killers are just sorted at the top of quiets.
          this.stage = MovePickerStage.QuietsGen;
          break;

        case MovePickerStage.QuietsGen:
          let allQuiets = this.moveGenerator.generatePseudoLegalMoves(this.board, this.state, MoveGenType.Quiets);
          
          for (const move of allQuiets) {
            if (this.hashMoveValid && this.hashMove && this.movesEqual(move, this.hashMove)) continue;
            this.quiets.push(move);
          }

          // Order quiets
          this.quiets = this.moveOrderer.orderMoves(this.quiets, this.board, null, this.ply, this.threatMove);
          
          this.index = 0;
          this.stage = MovePickerStage.Quiets;
          break;

        case MovePickerStage.Quiets:
          if (this.index < this.quiets.length) {
            return this.quiets[this.index++] as Move;
          }
          
          this.index = 0;
          this.stage = MovePickerStage.BadCaptures;
          break;

        case MovePickerStage.BadCaptures:
          if (this.index < this.badCaptures.length) {
            return this.badCaptures[this.index++] as Move;
          }
          this.stage = MovePickerStage.Done;
          break;

        case MovePickerStage.Done:
          return null;
      }
    }
  }

  private movesEqual(a: Move, b: Move): boolean {
    return a.from === b.from && a.to === b.to && a.promotion === b.promotion;
  }
}
