use crate::state::GameState;
use crate::types::{Color, PieceType, Square};
use crate::bitboard::{count_bits, pop_lsb, Bitboard, EMPTY};
use crate::nnue::{Accumulator, refresh_accumulator, evaluate_nnue, is_nnue_loaded};
use crate::magic::{get_bishop_attacks, get_rook_attacks};
use crate::attacks::{get_knight_attacks, get_king_attacks};

const PAWN_VAL: i16 = 100;
const KNIGHT_VAL: i16 = 320;
const BISHOP_VAL: i16 = 330;
const ROOK_VAL: i16 = 500;
const QUEEN_VAL: i16 = 900;

const PAWN_TABLE: [i16; 64] = [
  0,   0,   0,   0,   0,   0,   0,   0,
  50,  50,  50,  50,  50,  50,  50,  50,
  10,  10,  20,  30,  30,  20,  10,  10,
  5,   5,   10,  25,  25,  10,  5,   5,
  0,   0,   0,   20,  20,  0,   0,   0,
  5,   -5,  -10, 0,   0,   -10, -5,  5,
  5,   10,  10,  -20, -20, 10,  10,  5,
  0,   0,   0,   0,   0,   0,   0,   0
];
const KNIGHT_TABLE: [i16; 64] = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0,   0,   0,   0,   -20, -40,
  -30, 0,   10,  15,  15,  10,  0,   -30,
  -30, 5,   15,  20,  20,  15,  5,   -30,
  -30, 0,   15,  20,  20,  15,  0,   -30,
  -30, 5,   10,  15,  15,  10,  5,   -30,
  -40, -20, 0,   5,   5,   0,   -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50
];
const BISHOP_TABLE: [i16; 64] = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0,   0,   0,   0,   0,   0,   -10,
  -10, 0,   5,   10,  10,  5,   0,   -10,
  -10, 5,   5,   10,  10,  5,   5,   -10,
  -10, 0,   10,  10,  10,  10,  0,   -10,
  -10, 10,  10,  10,  10,  10,  10,  -10,
  -10, 5,   0,   0,   0,   0,   5,   -10,
  -20, -10, -10, -10, -10, -10, -10, -20
];
const ROOK_TABLE: [i16; 64] = [
  0,   0,   0,   0,   0,   0,   0,   0,
  5,   10,  10,  10,  10,  10,  10,  5,
  -5,  0,   0,   0,   0,   0,   0,   -5,
  -5,  0,   0,   0,   0,   0,   0,   -5,
  -5,  0,   0,   0,   0,   0,   0,   -5,
  -5,  0,   0,   0,   0,   0,   0,   -5,
  -5,  0,   0,   0,   0,   0,   0,   -5,
  0,   0,   0,   5,   5,   0,   0,   0
];
const QUEEN_TABLE: [i16; 64] = [
  -20, -10, -10, -5,  -5,  -10, -10, -20,
  -10, 0,   0,   0,   0,   0,   0,   -10,
  -10, 0,   5,   5,   5,   5,   0,   -10,
  -5,  0,   5,   5,   5,   5,   0,   -5,
  0,   0,   5,   5,   5,   5,   0,   -5,
  -10, 5,   5,   5,   5,   5,   0,   -10,
  -10, 0,   5,   0,   0,   0,   0,   -10,
  -20, -10, -10, -5,  -5,  -10, -10, -20
];
const KING_MID_TABLE: [i16; 64] = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20,  20,  0,   0,   0,   0,   20,  20,
  20,  30,  10,  0,   0,   10,  30,  20
];
const KING_END_TABLE: [i16; 64] = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0,   0,   -10, -20, -30,
  -30, -10, 20,  30,  30,  20,  -10, -30,
  -30, -10, 30,  40,  40,  30,  -10, -30,
  -30, -10, 30,  40,  40,  30,  -10, -30,
  -30, -10, 20,  30,  30,  20,  -10, -30,
  -30, -30, 0,   0,   0,   0,   -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50
];

const PASSED_PAWN_BONUS: [i16; 8] = [0, 10, 20, 35, 60, 100, 150, 0];

pub fn evaluate(state: &GameState) -> i16 {
    let mut score = 0;

    if is_nnue_loaded() {
        let mut acc = Accumulator::new();
        refresh_accumulator(state, &mut acc);
        let nnue_score = evaluate_nnue(state, &acc);
        score = if state.side_to_move == Color::White {
            nnue_score
        } else {
            -nnue_score
        };
    } else {
        // 1. Material and Piece-Square
        score += evaluate_pieces(state, Color::White);
        score -= evaluate_pieces(state, Color::Black);
        
        // 2. Pawn Structure & Tension
        score += evaluate_pawn_structure(state, Color::White) - evaluate_pawn_structure(state, Color::Black);
        score += evaluate_pawn_tension(state);
        
        // 3. King Safety
        let w_safety = evaluate_king_safety(state, Color::White);
        let b_safety = evaluate_king_safety(state, Color::Black);
        
        if w_safety < b_safety {
            score += (w_safety as f32 * 1.4) as i16 - b_safety;
        } else if b_safety < w_safety {
            score += w_safety - (b_safety as f32 * 1.4) as i16;
        } else {
            score += w_safety - b_safety;
        }

        // 4. Mobility & Constriction
        score += evaluate_mobility(state, Color::White) - evaluate_mobility(state, Color::Black);
        
        // 5. Blockade
        score += evaluate_blockade(state);
    }

    // Apply defensive modifiers
    score += tablebase_magnetism(state, score);
    score = fortress_scale(state, score);

    if state.side_to_move == Color::White {
        score
    } else {
        -score
    }
}

fn is_endgame(state: &GameState) -> bool {
    let non_pawns_w = count_bits(state.board.occupancies[Color::White as usize] ^ state.board.get_pieces(Color::White, PieceType::Pawn) ^ state.board.get_pieces(Color::White, PieceType::King));
    let non_pawns_b = count_bits(state.board.occupancies[Color::Black as usize] ^ state.board.get_pieces(Color::Black, PieceType::Pawn) ^ state.board.get_pieces(Color::Black, PieceType::King));
    non_pawns_w + non_pawns_b <= 6
}

fn evaluate_pieces(state: &GameState, color: Color) -> i16 {
    let mut score = 0;
    let endgame = is_endgame(state);
    
    for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop, PieceType::Rook, PieceType::Queen, PieceType::King] {
        let val = match pt {
            PieceType::Pawn => PAWN_VAL,
            PieceType::Knight => KNIGHT_VAL,
            PieceType::Bishop => BISHOP_VAL,
            PieceType::Rook => ROOK_VAL,
            PieceType::Queen => QUEEN_VAL,
            _ => 0,
        };
        
        let mut bb = state.board.get_pieces(color, pt);
        score += (count_bits(bb) as i16) * val;
        
        while bb != EMPTY {
            let sq = pop_lsb(&mut bb) as usize;
            
            let mut adjusted_sq = sq;
            if color == Color::White {
                let rank = sq / 8;
                let file = sq % 8;
                adjusted_sq = (7 - rank) * 8 + file;
            }
            
            score += match pt {
                PieceType::Pawn => PAWN_TABLE[adjusted_sq as usize],
                PieceType::Knight => KNIGHT_TABLE[adjusted_sq as usize],
                PieceType::Bishop => BISHOP_TABLE[adjusted_sq as usize],
                PieceType::Rook => ROOK_TABLE[adjusted_sq as usize],
                PieceType::Queen => QUEEN_TABLE[adjusted_sq as usize],
                PieceType::King => {
                    if endgame { KING_END_TABLE[adjusted_sq as usize] } else { KING_MID_TABLE[adjusted_sq as usize] }
                },
            };
        }
    }
    score
}

fn evaluate_pawn_structure(state: &GameState, color: Color) -> i16 {
    let mut score = 0;
    let mut pawns = state.board.get_pieces(color, PieceType::Pawn);
    let enemy_color = color.opposite();
    let enemy_pawns = state.board.get_pieces(enemy_color, PieceType::Pawn);
    
    while pawns != EMPTY {
        let sq = pop_lsb(&mut pawns) as usize;
        let rank = sq / 8;
        let file = sq % 8;
        
        let file_mask = 0x0101010101010101u64 << file;
        let adj_files = (if file > 0 { 0x0101010101010101u64 << (file - 1) } else { 0 }) |
                        (if file < 7 { 0x0101010101010101u64 << (file + 1) } else { 0 });
        
        // Doubled
        if (state.board.get_pieces(color, PieceType::Pawn) & file_mask & !(1u64 << sq)) != 0 {
            score -= 10;
        }
        
        // Isolated
        if (state.board.get_pieces(color, PieceType::Pawn) & adj_files) == 0 {
            score -= 15;
        }
        
        // Passed
        let passed_mask = if color == Color::White {
            let mut mask = file_mask | adj_files;
            mask &= !((1u64 << (sq + 1)) - 1);
            mask &= !0xFF; // ignore rank 1
            mask
        } else {
            let mut mask = file_mask | adj_files;
            mask &= (1u64 << sq) - 1;
            mask &= !0xFF00000000000000;
            mask
        };
        
        if (enemy_pawns & passed_mask) == 0 {
            let adjusted_rank = if color == Color::White { rank } else { 7 - rank };
            score += PASSED_PAWN_BONUS[adjusted_rank as usize];
        }
    }
    
    score
}

fn evaluate_pawn_tension(state: &GameState) -> i16 {
    let mut score = 0;
    let white_pawns = state.board.get_pieces(Color::White, PieceType::Pawn);
    let black_pawns = state.board.get_pieces(Color::Black, PieceType::Pawn);
    
    let w_attacks_left = (white_pawns & !0x0101010101010101u64) << 7;
    let w_attacks_right = (white_pawns & !0x8080808080808080u64) << 9;
    
    score -= (count_bits(w_attacks_left & black_pawns) as i16) * 10;
    score -= (count_bits(w_attacks_right & black_pawns) as i16) * 10;
    
    let b_attacks_left = (black_pawns & !0x0101010101010101u64) >> 9;
    let b_attacks_right = (black_pawns & !0x8080808080808080u64) >> 7;
    
    score += (count_bits(b_attacks_left & white_pawns) as i16) * 10;
    score += (count_bits(b_attacks_right & white_pawns) as i16) * 10;
    
    score
}

fn evaluate_king_safety(state: &GameState, color: Color) -> i16 {
    let mut king_bb = state.board.get_pieces(color, PieceType::King);
    if king_bb == EMPTY { return 0; }
    
    let king_sq = pop_lsb(&mut king_bb) as usize;
    let king_file = king_sq % 8;
    
    let mut safety = 0;
    let them = color.opposite();
    let our_pawns = state.board.get_pieces(color, PieceType::Pawn);
    let their_pawns = state.board.get_pieces(them, PieceType::Pawn);
    
    let min_file = if king_file > 0 { king_file - 1 } else { 0 };
    let max_file = if king_file < 7 { king_file + 1 } else { 7 };
    
    for f in min_file..=max_file {
        let file_mask = 0x0101010101010101u64 << f;
        let mut shield_found = false;
        
        let file_our_pawns = our_pawns & file_mask;
        if file_our_pawns != 0 {
            shield_found = true;
            safety += 10; // PAWN_SHIELD_BONUS
        }
        
        if (their_pawns & file_mask) == 0 && (our_pawns & file_mask) == 0 {
            safety -= 20; // Open file
        } else if (our_pawns & file_mask) == 0 && (their_pawns & file_mask) != 0 {
            safety -= 10; // Semi-open file against us
        }
    }
    
    safety
}

fn evaluate_mobility(state: &GameState, color: Color) -> i16 {
    let mut score = 0;
    
    let our_pieces = state.board.occupancies[color as usize];
    let all_pieces = state.board.occupancies[2];
    
    for pt in [PieceType::Knight, PieceType::Bishop, PieceType::Rook] {
        let mut bb = state.board.get_pieces(color, pt);
        while bb != EMPTY {
            let sq = pop_lsb(&mut bb) as usize;
            let attacks = match pt {
                PieceType::Knight => get_knight_attacks(sq as u8),
                PieceType::Bishop => get_bishop_attacks(sq as u8, all_pieces),
                PieceType::Rook => get_rook_attacks(sq as u8, all_pieces),
                _ => 0,
            };
            
            let safe_moves = attacks & !our_pieces;
            let mobility = count_bits(safe_moves);
            score += (mobility as i16) * 2;
            
            let rank = sq / 8;
            let is_advanced = if color == Color::White { rank >= 4 } else { rank <= 3 };
            if is_advanced {
                if mobility == 0 { score -= 50; }
                else if mobility == 1 { score -= 30; }
                else if mobility == 2 { score -= 15; }
            }
        }
    }
    
    score
}

fn evaluate_blockade(state: &GameState) -> i16 {
    let mut score = 0;
    let mut locked_files = 0;
    
    let white_pawns = state.board.get_pieces(Color::White, PieceType::Pawn);
    let black_pawns = state.board.get_pieces(Color::Black, PieceType::Pawn);
    
    for file in 0..8 {
        let file_mask = 0x0101010101010101u64 << file;
        let w_file = white_pawns & file_mask;
        let b_file = black_pawns & file_mask;
        
        if w_file != 0 && b_file != 0 {
            let w_sq = 63 - w_file.leading_zeros() as usize;
            let b_sq = b_file.trailing_zeros() as usize;
            
            if b_sq == w_sq + 8 {
                locked_files += 1;
            }
        }
    }
    
    score += (locked_files as i16) * 20; 
    if locked_files >= 3 {
        score += 40; 
    }
    
    score
}

fn tablebase_magnetism(state: &GameState, score: i16) -> i16 {
    if score.abs() < 50 { return 0; }
    
    let mut total_pieces = 0;
    let mut non_pawn_pieces = 0;
    
    for c in [Color::White, Color::Black] {
        total_pieces += count_bits(state.board.occupancies[c as usize]);
        non_pawn_pieces += count_bits(state.board.occupancies[c as usize] 
            ^ state.board.get_pieces(c, PieceType::Pawn) 
            ^ state.board.get_pieces(c, PieceType::King));
    }
    
    let mut bonus = (14 - non_pawn_pieces as i16) * 8;
    if total_pieces <= 7 {
        bonus += 50;
    }
    
    bonus = bonus.min((score.abs() as f32 * 0.5) as i16);
    
    if score < -50 {
        bonus
    } else if score > 50 {
        -bonus
    } else {
        0
    }
}

fn fortress_scale(state: &GameState, score: i16) -> i16 {
    if score.abs() < 50 { return score; }
    
    let mut factor = 1.0;
    let w_bishops = state.board.get_pieces(Color::White, PieceType::Bishop);
    let b_bishops = state.board.get_pieces(Color::Black, PieceType::Bishop);
    
    if count_bits(w_bishops) == 1 && count_bits(b_bishops) == 1 {
        let w_sq = w_bishops.trailing_zeros() as usize;
        let b_sq = b_bishops.trailing_zeros() as usize;
        
        let w_light = ((w_sq / 8) + (w_sq % 8)) % 2 != 0;
        let b_light = ((b_sq / 8) + (b_sq % 8)) % 2 != 0;
        
        if w_light != b_light {
            factor *= 0.5;
            
            let mut other_pieces = 0;
            for c in [Color::White, Color::Black] {
                for pt in [PieceType::Knight, PieceType::Rook, PieceType::Queen] {
                    other_pieces += count_bits(state.board.get_pieces(c, pt));
                }
            }
            if other_pieces == 0 {
                factor *= 0.5;
            }
        }
    }
    
    (score as f32 * factor) as i16
}
