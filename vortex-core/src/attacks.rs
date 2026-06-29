use crate::bitboard::{Bitboard, set_bit, EMPTY};
use crate::types::Square;
use std::sync::OnceLock;

struct AttackTables {
    knight: [Bitboard; 64],
    king: [Bitboard; 64],
}

static TABLES: OnceLock<AttackTables> = OnceLock::new();

pub fn init_step_attacks() {
    TABLES.get_or_init(|| {
        let mut knight = [EMPTY; 64];
        let mut king = [EMPTY; 64];

        for sq in 0..64 {
            let rank = (sq / 8) as i8;
            let file = (sq % 8) as i8;

            let knight_moves = [
                (2, 1), (2, -1), (-2, 1), (-2, -1),
                (1, 2), (1, -2), (-1, 2), (-1, -2)
            ];

            let king_moves = [
                (1, 0), (-1, 0), (0, 1), (0, -1),
                (1, 1), (1, -1), (-1, 1), (-1, -1)
            ];

            for &(dr, df) in &knight_moves {
                let r = rank + dr;
                let f = file + df;
                if r >= 0 && r < 8 && f >= 0 && f < 8 {
                    set_bit(&mut knight[sq as usize], (r * 8 + f) as Square);
                }
            }

            for &(dr, df) in &king_moves {
                let r = rank + dr;
                let f = file + df;
                if r >= 0 && r < 8 && f >= 0 && f < 8 {
                    set_bit(&mut king[sq as usize], (r * 8 + f) as Square);
                }
            }
        }

        AttackTables { knight, king }
    });
}

#[inline(always)]
pub fn get_knight_attacks(sq: Square) -> Bitboard {
    TABLES.get().unwrap().knight[sq as usize]
}

#[inline(always)]
pub fn get_king_attacks(sq: Square) -> Bitboard {
    TABLES.get().unwrap().king[sq as usize]
}
