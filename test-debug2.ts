import { parseFen } from './src/utils/FenParser';
import { PawnStructureEvaluator } from './src/evaluation/PawnStructureEvaluator';

const { board } = parseFen('rnbqkb1r/1p1ppppp/p6n/2P5/8/8/PP1PPPPP/RNBQKBNR w KQkq - 0 1');
const evaluator = new PawnStructureEvaluator();
console.log('Passed pawn score:', evaluator.evaluate(board, false));

