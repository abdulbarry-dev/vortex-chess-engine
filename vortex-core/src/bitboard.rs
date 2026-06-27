use crate::types::Square;

pub type Bitboard = u64;

pub const EMPTY: Bitboard = 0;
pub const UNIVERSAL: Bitboard = !EMPTY;

#[inline(always)]
pub fn set_bit(bb: &mut Bitboard, sq: Square) {
    *bb |= 1u64 << sq;
}

#[inline(always)]
pub fn clear_bit(bb: &mut Bitboard, sq: Square) {
    *bb &= !(1u64 << sq);
}

#[inline(always)]
pub fn test_bit(bb: Bitboard, sq: Square) -> bool {
    (bb & (1u64 << sq)) != 0
}

#[inline(always)]
pub fn pop_lsb(bb: &mut Bitboard) -> Square {
    let lsb = bb.trailing_zeros() as Square;
    *bb &= *bb - 1;
    lsb
}

#[inline(always)]
pub fn lsb(bb: Bitboard) -> Square {
    bb.trailing_zeros() as Square
}

#[inline(always)]
pub fn count_bits(bb: Bitboard) -> u32 {
    bb.count_ones()
}

pub fn print_bitboard(bb: Bitboard) -> String {
    let mut s = String::new();
    s.push_str("+---+---+---+---+---+---+---+---+\n");
    for rank in (0..8).rev() {
        for file in 0..8 {
            let sq = rank * 8 + file;
            if test_bit(bb, sq) {
                s.push_str("| X ");
            } else {
                s.push_str("|   ");
            }
        }
        s.push_str("|\n+---+---+---+---+---+---+---+---+\n");
    }
    s
}
