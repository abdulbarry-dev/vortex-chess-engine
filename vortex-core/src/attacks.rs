use crate::bitboard::{Bitboard, set_bit, test_bit, EMPTY};
use crate::types::Square;

pub static mut KNIGHT_ATTACKS: [Bitboard; 64] = [EMPTY; 64];
pub static mut KING_ATTACKS: [Bitboard; 64] = [EMPTY; 64];

pub fn init_step_attacks() {
    unsafe {
        if KNIGHT_ATTACKS[0] != 0 { return; }

        for sq in 0..64 {
            let mut knight_bb = EMPTY;
            let mut king_bb = EMPTY;
            
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
                    set_bit(&mut knight_bb, (r * 8 + f) as Square);
                }
            }

            for &(dr, df) in &king_moves {
                let r = rank + dr;
                let f = file + df;
                if r >= 0 && r < 8 && f >= 0 && f < 8 {
                    set_bit(&mut king_bb, (r * 8 + f) as Square);
                }
            }

            KNIGHT_ATTACKS[sq as usize] = knight_bb;
            KING_ATTACKS[sq as usize] = king_bb;
        }
    }
}

#[inline(always)]
pub fn get_knight_attacks(sq: Square) -> Bitboard {
    unsafe { KNIGHT_ATTACKS[sq as usize] }
}

#[inline(always)]
pub fn get_king_attacks(sq: Square) -> Bitboard {
    unsafe { KING_ATTACKS[sq as usize] }
}
