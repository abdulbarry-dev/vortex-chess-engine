use crate::types::{Color, PieceType, Square};
use crate::board::Board;

pub struct Zobrist {
    pub piece_keys: [[[u64; 64]; 6]; 2], // [Color][PieceType][Square]
    pub side_to_move_key: u64,
    pub castling_keys: [u64; 16],
    pub en_passant_keys: [u64; 8], // file only
}

impl Zobrist {
    pub fn new() -> Self {
        // We use a deterministic PRNG to ensure reproducible hashes across restarts
        let mut seed: u64 = 0x98f107;
        let mut rand = || -> u64 {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };

        let mut z = Self {
            piece_keys: [[[0; 64]; 6]; 2],
            side_to_move_key: 0,
            castling_keys: [0; 16],
            en_passant_keys: [0; 8],
        };

        for c in 0..2 {
            for p in 0..6 {
                for sq in 0..64 {
                    z.piece_keys[c][p][sq] = rand();
                }
            }
        }
        
        z.side_to_move_key = rand();

        for i in 0..16 {
            z.castling_keys[i] = rand();
        }

        for i in 0..8 {
            z.en_passant_keys[i] = rand();
        }

        z
    }

    pub fn compute_hash(&self, board: &Board, side: Color, castling_rights: u8, en_passant_file: Option<u8>) -> u64 {
        let mut h = 0;
        
        for c in [Color::White, Color::Black] {
            let c_idx = c as usize;
            for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop, PieceType::Rook, PieceType::Queen, PieceType::King] {
                let p_idx = pt as usize;
                let mut bb = board.pieces[c_idx][p_idx];
                while bb != 0 {
                    let sq = bb.trailing_zeros() as usize;
                    bb &= bb - 1; // pop LSB
                    h ^= self.piece_keys[c_idx][p_idx][sq];
                }
            }
        }

        if side == Color::Black {
            h ^= self.side_to_move_key;
        }

        h ^= self.castling_keys[castling_rights as usize];

        if let Some(file) = en_passant_file {
            h ^= self.en_passant_keys[file as usize];
        }

        h
    }
}

pub static mut ZOBRIST: Option<Zobrist> = None;

pub fn init_zobrist() {
    unsafe {
        if ZOBRIST.is_none() {
            ZOBRIST = Some(Zobrist::new());
        }
    }
}

#[inline(always)]
pub fn get_zobrist() -> &'static Zobrist {
    unsafe { ZOBRIST.as_ref().unwrap() }
}
