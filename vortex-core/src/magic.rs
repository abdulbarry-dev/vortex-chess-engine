use crate::bitboard::{Bitboard, set_bit, test_bit, EMPTY};
use crate::types::Square;

#[derive(Copy, Clone)]
pub struct Magic {
    pub mask: Bitboard,
    pub magic: u64,
    pub shift: u32,
    pub offset: usize,
}

const ROOK_TABLE_SIZE: usize = 102400;
const BISHOP_TABLE_SIZE: usize = 5248; // 64 * 512 is 32768, but we pack them

pub static mut ROOK_MAGICS: [Magic; 64] = [Magic { mask: 0, magic: 0, shift: 0, offset: 0 }; 64];
pub static mut BISHOP_MAGICS: [Magic; 64] = [Magic { mask: 0, magic: 0, shift: 0, offset: 0 }; 64];

pub static mut ROOK_ATTACKS: [Bitboard; ROOK_TABLE_SIZE] = [0; ROOK_TABLE_SIZE];
pub static mut BISHOP_ATTACKS: [Bitboard; 524288] = [0; 524288]; // Use a safe upper bound

// Slow ray-casting for initialization
fn sliding_attack_slow(sq: Square, occ: Bitboard, is_rook: bool) -> Bitboard {
    let mut attacks = EMPTY;
    let rank = sq / 8;
    let file = sq % 8;

    let directions: &[(i8, i8)] = if is_rook {
        &[(1, 0), (-1, 0), (0, 1), (0, -1)]
    } else {
        &[(1, 1), (1, -1), (-1, 1), (-1, -1)]
    };

    for &(dr, df) in directions {
        let mut r = rank as i8 + dr;
        let mut f = file as i8 + df;
        while r >= 0 && r < 8 && f >= 0 && f < 8 {
            let target = (r * 8 + f) as Square;
            set_bit(&mut attacks, target);
            if test_bit(occ, target) {
                break;
            }
            r += dr;
            f += df;
        }
    }
    attacks
}

// Generate the mask of relevant blockers
fn generate_mask(sq: Square, is_rook: bool) -> Bitboard {
    let mut mask = sliding_attack_slow(sq, EMPTY, is_rook);
    let rank = sq / 8;
    let file = sq % 8;

    if is_rook {
        // Exclude the outer edges unless the piece is on that edge
        if rank != 0 { mask &= !0x00000000000000FF; }
        if rank != 7 { mask &= !0xFF00000000000000; }
        if file != 0 { mask &= !0x0101010101010101; }
        if file != 7 { mask &= !0x8080808080808080; }
    } else {
        // Exclude all outer edges for bishop
        mask &= !0xFF00000000000000;
        mask &= !0x00000000000000FF;
        mask &= !0x8080808080808080;
        mask &= !0x0101010101010101;
    }
    mask
}

// Set the i-th subset of the mask
fn set_occupancy(mut index: usize, bits_in_mask: u32, mask: Bitboard) -> Bitboard {
    let mut occ = EMPTY;
    let mut m = mask;
    for _ in 0..bits_in_mask {
        let sq = m.trailing_zeros() as Square;
        m &= m - 1; // clear LSB
        if index & 1 != 0 {
            set_bit(&mut occ, sq);
        }
        index >>= 1;
    }
    occ
}

// Pseudorandom number generator for finding magics
struct PRNG { seed: u64 }
impl PRNG {
    fn new(seed: u64) -> Self { Self { seed } }
    fn rand64(&mut self) -> u64 {
        self.seed ^= self.seed << 13;
        self.seed ^= self.seed >> 7;
        self.seed ^= self.seed << 17;
        self.seed
    }
    fn rand_few_bits(&mut self) -> u64 {
        self.rand64() & self.rand64() & self.rand64()
    }
}

// Find a magic number for a square
fn find_magic(sq: Square, is_rook: bool, offset: &mut usize, attacks_table: &mut [Bitboard]) -> Magic {
    let mask = generate_mask(sq, is_rook);
    let bits = mask.count_ones();
    let num_variations = 1 << bits;
    let shift = 64 - bits;

    let mut occupancies = vec![EMPTY; num_variations];
    let mut actual_attacks = vec![EMPTY; num_variations];

    for i in 0..num_variations {
        occupancies[i] = set_occupancy(i, bits, mask);
        actual_attacks[i] = sliding_attack_slow(sq, occupancies[i], is_rook);
    }

    let mut prng = PRNG::new(42); // deterministic seed
    let mut used = vec![0; 4096]; // To track which attacks we've mapped
    let mut attempt = 1;

    loop {
        let magic = prng.rand_few_bits();
        // Skip invalid magics early
        if (mask.wrapping_mul(magic) & 0xFF00000000000000).count_ones() < 6 {
            continue;
        }

        let mut fail = false;
        // Attempt to map all variations
        for i in 0..num_variations {
            let index = (occupancies[i].wrapping_mul(magic) >> shift) as usize;
            
            if used[index] == attempt {
                // Collision!
                if attacks_table[*offset + index] != actual_attacks[i] {
                    fail = true;
                    break;
                }
            } else {
                used[index] = attempt;
                attacks_table[*offset + index] = actual_attacks[i];
            }
        }

        if !fail {
            let result = Magic { mask, magic, shift, offset: *offset };
            *offset += num_variations;
            return result;
        }
        attempt += 1;
    }
}

pub fn init_magics() {
    unsafe {
        if ROOK_MAGICS[0].mask != 0 { return; } // already initialized
        
        let mut rook_offset = 0;
        let mut bishop_offset = 0;

        for sq in 0u8..64u8 {
            ROOK_MAGICS[sq as usize] = find_magic(sq, true, &mut rook_offset, &mut ROOK_ATTACKS);
            BISHOP_MAGICS[sq as usize] = find_magic(sq, false, &mut bishop_offset, &mut BISHOP_ATTACKS);
        }
    }
}

#[inline(always)]
pub fn get_rook_attacks(sq: Square, occ: Bitboard) -> Bitboard {
    unsafe {
        let m = &ROOK_MAGICS[sq as usize];
        let mut hash = occ & m.mask;
        hash = hash.wrapping_mul(m.magic);
        hash >>= m.shift;
        ROOK_ATTACKS[m.offset + hash as usize]
    }
}

#[inline(always)]
pub fn get_bishop_attacks(sq: Square, occ: Bitboard) -> Bitboard {
    unsafe {
        let m = &BISHOP_MAGICS[sq as usize];
        let mut hash = occ & m.mask;
        hash = hash.wrapping_mul(m.magic);
        hash >>= m.shift;
        BISHOP_ATTACKS[m.offset + hash as usize]
    }
}
