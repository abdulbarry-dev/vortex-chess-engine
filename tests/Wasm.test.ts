import { describe, it, expect, beforeAll } from 'vitest';
import { VortexCore } from '../vortex-core/pkg/vortex_core.js';
import { parseFen } from '../src/utils/FenParser';
import { Color } from '../src/core/Piece';

function setupStartPos(core: any) {
    // White
    core.add_piece(true, 4, 0); // Rook
    core.add_piece(true, 2, 1); // Knight
    core.add_piece(true, 3, 2); // Bishop
    core.add_piece(true, 5, 3); // Queen
    core.add_piece(true, 6, 4); // King
    core.add_piece(true, 3, 5); // Bishop
    core.add_piece(true, 2, 6); // Knight
    core.add_piece(true, 4, 7); // Rook
    for (let i = 8; i < 16; i++) core.add_piece(true, 1, i); // Pawns

    // Black
    core.add_piece(false, 4, 56); // Rook
    core.add_piece(false, 2, 57); // Knight
    core.add_piece(false, 3, 58); // Bishop
    core.add_piece(false, 5, 59); // Queen
    core.add_piece(false, 6, 60); // King
    core.add_piece(false, 3, 61); // Bishop
    core.add_piece(false, 2, 62); // Knight
    core.add_piece(false, 4, 63); // Rook
    for (let i = 48; i < 56; i++) core.add_piece(false, 1, i); // Pawns
}

describe('VortexCore WASM Integration', () => {
    let core: any;

    beforeAll(() => {
        core = new VortexCore();
    });

    it('should initialize and return version', () => {
        const version = core.get_version();
        expect(version).toBe('2.0.0-rust-alpha');
    });

    it('should generate pseudo-legal moves for startpos', () => {
        core.reset_board();
        setupStartPos(core);
        core.set_side_to_move(true);
        const moves = core.generate_pseudo_legal_moves(true);
        // Should return a Uint16Array of moves
        expect(moves).toBeInstanceOf(Uint16Array);
        expect(moves.length).toBe(20);
    });

    it('should find best move using rust search', () => {
        core.reset_board();
        setupStartPos(core);
        core.set_side_to_move(true);
        // Start pos - depth 2, 5 second time limit
        const stats = core.search(2, BigInt(5000));
        
        // Ensure a valid stats object was returned
        expect(typeof stats).toBe('object');
        expect(stats.best_move).toBeGreaterThan(0);
        
        const bestMove = stats.best_move;
        
        const from = bestMove & 0x3F;
        const to = (bestMove >> 6) & 0x3F;
        
        // Ensure from and to squares are on the board (0-63)
        expect(from).toBeGreaterThanOrEqual(0);
        expect(from).toBeLessThan(64);
        expect(to).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThan(64);
    });

    it.skip('should load dummy nnue buffer', () => {
        const dummyBuffer = new Uint8Array(75000000); // 75MB to hold new policy and threat weights
        dummyBuffer[0] = 86; // V
        dummyBuffer[1] = 82; // R
        dummyBuffer[2] = 84; // T
        dummyBuffer[3] = 88; // X
        dummyBuffer[4] = 2;  // version
        
        // FT_SIZE = 768 = 0x300
        dummyBuffer[5] = 0x00;
        dummyBuffer[6] = 0x03;
        // L2_SIZE = 16
        dummyBuffer[7] = 16;
        // L3_SIZE = 32
        dummyBuffer[8] = 32;
        // NUM_PHASE_BUCKETS = 16
        dummyBuffer[9] = 16;
        // PST_FEATURES = 7680 = 0x1E00
        dummyBuffer[10] = 0x00;
        dummyBuffer[11] = 0x1E;
        // THREAT_FEATURES = 72000 = 0x11940
        dummyBuffer[12] = 0x40;
        dummyBuffer[13] = 0x19;
        dummyBuffer[14] = 0x01;
        dummyBuffer[15] = 0x00;
        
        // pst_weight_bytes
        dummyBuffer[16] = 0;
        dummyBuffer[17] = 0;
        dummyBuffer[18] = 0;
        dummyBuffer[19] = 0;
        
        // POLICY_SIZE = 1858 = 0x0742
        dummyBuffer[20] = 0x42;
        dummyBuffer[21] = 0x07;
        const result = core.load_nnue(dummyBuffer);
        expect(result).toBe(true);
    });
    it('should find Qc7 in the critical FEN (Move Ordering Test)', () => {
        core.reset_board();
        
        // FEN: rn1qkbnr/4pppp/p1P5/5b2/Qp1P4/4PN2/PP3PPP/RNB1KB1R b KQkq - 0 8
        // Black
        core.add_piece(false, 4, 56); // a8
        core.add_piece(false, 2, 57); // b8
        core.add_piece(false, 5, 59); // d8
        core.add_piece(false, 6, 60); // e8
        core.add_piece(false, 3, 61); // f8
        core.add_piece(false, 2, 62); // g8
        core.add_piece(false, 4, 63); // h8
        
        core.add_piece(false, 1, 40); // a6
        core.add_piece(false, 1, 25); // b4
        core.add_piece(false, 1, 52); // e7
        core.add_piece(false, 1, 53); // f7
        core.add_piece(false, 1, 54); // g7
        core.add_piece(false, 1, 55); // h7
        core.add_piece(false, 3, 37); // f5

        // White
        core.add_piece(true, 4, 0); // a1
        core.add_piece(true, 2, 1); // b1
        core.add_piece(true, 3, 2); // c1
        core.add_piece(true, 6, 4); // e1
        core.add_piece(true, 3, 5); // f1
        core.add_piece(true, 4, 7); // h1
        
        core.add_piece(true, 1, 8); // a2
        core.add_piece(true, 1, 9); // b2
        core.add_piece(true, 1, 13); // f2
        core.add_piece(true, 1, 14); // g2
        core.add_piece(true, 1, 15); // h2
        core.add_piece(true, 1, 20); // e3
        core.add_piece(true, 1, 27); // d4
        core.add_piece(true, 1, 42); // c6
        core.add_piece(true, 2, 21); // f3
        core.add_piece(true, 5, 24); // a4
        
        core.set_side_to_move(false); // Black to move
        
        // Without move ordering, it blunders with b4b3
        // With move ordering, it should find d8c7 (Qc7) or b8c6 at depth 4+
        const stats = core.search(4, BigInt(10000));
        const bestMove = stats.best_move;
        
        const from = bestMove & 0x3F;
        const to = (bestMove >> 6) & 0x3F;
        
        const files = 'abcdefgh';
        const ranks = '12345678';
        const fromStr = files[from % 8] + ranks[Math.floor(from / 8)];
        const toStr = files[to % 8] + ranks[Math.floor(to / 8)];
        const moveStr = fromStr + toStr;
        
        // It must not play the blunder b4b3 (25 to 17)
        expect(moveStr).not.toBe('b4b3');
        
        // It should prefer a developing/defending move like Qc7 (d8c7)
        expect(['d8c7', 'b8c6', 'd8b6', 'f5b1'].includes(moveStr)).toBe(true);
    });
});
