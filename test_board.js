const { Board } = require('./dist/core/Board.js');
const { parseFen } = require('./dist/utils/fen.js');

const fenStr = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const result = parseFen(fenStr);
const board = result.board;

console.log(board.squares.map(p => p ? p.type : 0).join(','));
