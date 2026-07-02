const { MoveGenerator } = require('./dist/move-generation/MoveGenerator.js');
const { Board } = require('./dist/core/Board.js');
const { GameState } = require('./dist/core/GameState.js');
const { parseFen } = require('./dist/utils/fen.js');
const { MoveExecutor } = require('./dist/core/MoveExecutor.js');

const fenStr = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const result = parseFen(fenStr);
const board = result.board;
const state = result.state;

const gen = new MoveGenerator();

let moves = gen.generateLegalMoves(board, state);
MoveExecutor.makeMove(board, state, moves.find(m => m.from === 12 && m.to === 28)); // e2e4

moves = gen.generateLegalMoves(board, state);
MoveExecutor.makeMove(board, state, moves.find(m => m.from === 50 && m.to === 34)); // c7c5

moves = gen.generateLegalMoves(board, state);
console.log(moves.map(m => {
    const files = 'abcdefgh';
    const ranks = '12345678';
    return files[m.from%8] + ranks[Math.floor(m.from/8)] + files[m.to%8] + ranks[Math.floor(m.to/8)];
}).join(', '));
