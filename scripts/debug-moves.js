"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var FenParser_1 = require("./src/core/FenParser");
var MoveGenerator_1 = require("./src/move-generation/MoveGenerator");
var MoveFormatter_1 = require("./src/utils/MoveFormatter");
var _a = (0, FenParser_1.parseFen)("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"), board = _a.board, state = _a.state;
var moveGen = new MoveGenerator_1.MoveGenerator();
var moves = moveGen.generateLegalMoves(board, state);
console.log("Generated ".concat(moves.length, " moves:"));
for (var _i = 0, moves_1 = moves; _i < moves_1.length; _i++) {
    var move = moves_1[_i];
    console.log((0, MoveFormatter_1.formatMove)(move));
}
