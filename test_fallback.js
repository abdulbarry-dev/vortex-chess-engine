const { MoveGenerator } = require('./dist/move-generation/MoveGenerator.js');
const { Board } = require('./dist/core/Board.js');
const { GameState } = require('./dist/core/GameState.js');

const board = new Board();
board.loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
const state = new GameState();
const gen = new MoveGenerator();

const moves = gen.generateLegalMoves(board, state);
console.log(moves.map(m => m.from + " -> " + m.to));
