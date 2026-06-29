use crate::state::GameState;
use crate::types::{Color, PieceType};
use crate::bitboard::{count_bits, EMPTY};
use crate::nnue::{Accumulator, refresh_accumulator, evaluate_nnue, is_nnue_loaded};

const PAWN_VAL: i16 = 100;
const KNIGHT_VAL: i16 = 320;
const BISHOP_VAL: i16 = 330;
const ROOK_VAL: i16 = 500;
const QUEEN_VAL: i16 = 900;

const CENTER_BONUS: [i16; 64] = [
    -10, -10, -10, -10, -10, -10, -10, -10,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,  10,  10,   5,   0, -10,
    -10,   0,  10,  20,  20,  10,   0, -10,
    -10,   0,  10,  20,  20,  10,   0, -10,
    -10,   0,   5,  10,  10,   5,   0, -10,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10, -10, -10, -10, -10, -10, -10, -10,
];

pub fn evaluate(state: &GameState) -> i16 {
    let mut acc = Accumulator::new();
    refresh_accumulator(state, &mut acc);
    let nnue_score = evaluate_nnue(state, &acc);
    if is_nnue_loaded() {
        return nnue_score;
    }
    
    let mut score = 0;
    
    score += evaluate_pieces(state, Color::White);
    score -= evaluate_pieces(state, Color::Black);
    
    score += evaluate_king_safety(state, Color::White) - evaluate_king_safety(state, Color::Black);
    score += evaluate_pawn_structure(state, Color::White) - evaluate_pawn_structure(state, Color::Black);

    if state.side_to_move == Color::White {
        score
    } else {
        -score
    }
}

fn evaluate_pieces(state: &GameState, color: Color) -> i16 {
    let mut score = 0;
    
    for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop, PieceType::Rook, PieceType::Queen] {
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
            let sq = bb.trailing_zeros() as usize;
            bb &= bb - 1;
            
            let index = if color == Color::White {
                (7 - (sq / 8)) * 8 + (sq % 8)
            } else {
                sq
            };
            
            if pt == PieceType::Knight || pt == PieceType::Pawn || pt == PieceType::Bishop {
                score += CENTER_BONUS[index];
            }
        }
    }
    score
}

fn evaluate_king_safety(state: &GameState, color: Color) -> i16 {
    let king_bb = state.board.get_pieces(color, PieceType::King);
    if king_bb == EMPTY { return 0; }
    
    let king_sq = king_bb.trailing_zeros() as usize;
    let king_file = king_sq % 8;
    
    let mut safety = 0;
    let them = color.opposite();
    let our_pawns = state.board.get_pieces(color, PieceType::Pawn);
    let their_pawns = state.board.get_pieces(them, PieceType::Pawn);
    
    let min_file = if king_file > 0 { king_file - 1 } else { 0 };
    let max_file = if king_file < 7 { king_file + 1 } else { 7 };
    
    for f in min_file..=max_file {
        let file_mask = 0x0101010101010101u64 << f;
        
        if (their_pawns & file_mask) == EMPTY {
            safety -= 15;
        }
        
        if (our_pawns & file_mask) == EMPTY && (their_pawns & file_mask) == EMPTY {
            safety -= 30;
        }
    }
    
    safety
}

fn evaluate_pawn_structure(state: &GameState, color: Color) -> i16 {
    let mut score = 0;
    let mut pawns = state.board.get_pieces(color, PieceType::Pawn);
    
    while pawns != EMPTY {
        let sq = pawns.trailing_zeros() as usize;
        pawns &= pawns - 1;
        
        let rank = sq / 8;
        let relative_rank = if color == Color::White { rank } else { 7 - rank };
        
        if relative_rank >= 5 {
            score -= 10;
        }
    }
    
    score
}
