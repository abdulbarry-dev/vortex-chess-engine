import { parseFen } from '../src/utils/FenParser';
import { Positions } from '../src/constants/Positions';
import { MoveGenerator } from '../src/move-generation/MoveGenerator';

const { board, state } = parseFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
const moveGen = new MoveGenerator();
const moves = moveGen.generateLegalMoves(board, state);

console.log(`Generated ${moves.length} moves:`);
for (const move of moves) {
  console.log(`${move.from} -> ${move.to} (piece: ${move.piece.type}, flags: ${move.flags})`);
}
