import { parseFen } from './src/utils/FenParser';
import { PawnStructureEvaluator } from './src/evaluation/PawnStructureEvaluator';

const evaluator = new PawnStructureEvaluator();

const { board } = parseFen('rnbqkb1r/pp1ppppp/7n/2P5/8/8/PP1PPPPP/RNBQKBNR w KQkq - 0 1');
console.log('Passed pawn score:', evaluator.evaluate(board, false));

const { board: normal } = parseFen('rnbqkb1r/pppppppp/7n/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
console.log('Normal score:', evaluator.evaluate(normal, false));
