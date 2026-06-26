import { Board } from './src/core/Board';
import { GameState } from './src/core/GameState';
import { Evaluator } from './src/evaluation/Evaluator';
import { MoveGenerator } from './src/move-generation/MoveGenerator';
import { AlphaBetaSearch } from './src/search/AlphaBeta';

const fen = 'r2qk2r/pp2ppb1/5np1/1P1p3p/P2n1PbP/R1p1P3/2P3P1/2BQKB1R w Kkq - 0 12';
const board = Board.fromFEN ? Board.fromFEN(fen) : (() => {
  // Try finding how board is initialized
  const b = new Board();
  const pieces = fen.split(' ')[0];
  // ... this is too long, let's use the CLI
})();
