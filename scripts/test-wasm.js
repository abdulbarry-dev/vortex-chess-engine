const { VortexCore } = require('./vortex-core/pkg/vortex_core.js');

console.log('Testing WASM Move Generator...');
const core = new VortexCore();

// Add a White Pawn (pt=1) to e2 (sq=12)
core.add_piece(true, 1, 12);
// Add a White Knight (pt=2) to b1 (sq=1)
core.add_piece(true, 2, 1);

// Generate White pseudo-legal moves
const moves = core.generate_pseudo_legal_moves(true);
console.log(`Generated ${moves.length} moves.`);

for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const from = m & 0x3F;
    const to = (m >> 6) & 0x3F;
    const flag = m >> 12;
    console.log(`Move ${i}: from sq ${from} to sq ${to} (flag: ${flag})`);
}

// Expected:
// pawn e2-e3 (quiet = 0)
// pawn e2-e4 (double push = 1)
// knight b1-c3 (quiet = 0)
// knight b1-a3 (quiet = 0)
// knight b1-d2 (quiet = 0)
