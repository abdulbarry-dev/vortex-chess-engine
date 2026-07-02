use crate::state::GameState;
use crate::move_core::Move;
use crate::movegen::generate_pseudo_legal_moves;
use crate::types::PieceType;

pub struct SwindleMode {
    pub active: bool,
}

impl SwindleMode {
    pub fn new(score: i16) -> Self {
        Self {
            active: score < -300,
        }
    }

    pub fn modify_move_ordering(&self, m: Move, base_score: i32, state: &GameState) -> i32 {
        if !self.active { return base_score; }
        
        let mut bonus = 0;
        if m.is_capture() { bonus += 150; }
        if m.is_promotion() { bonus += 200; }
        
        // Penalize queen trades
        if m.is_capture() {
            let them = state.side_to_move.opposite();
            let capture_sq = m.to(); // Assuming non-ep for simplicity
            let is_queen_capture = (state.board.get_pieces(them, PieceType::Queen) & (1u64 << capture_sq)) != 0;
            let is_queen_attacker = (state.board.get_pieces(state.side_to_move, PieceType::Queen) & (1u64 << m.from())) != 0;
            if is_queen_capture && is_queen_attacker {
                bonus -= 500;
            }
        }
        
        base_score + bonus
    }

    pub fn complexity_bonus(&self, state: &GameState) -> i32 {
        if !self.active { return 0; }
        let move_list = generate_pseudo_legal_moves(&state.board, state.side_to_move, state.castling_rights, state.en_passant_sq);
        let mobility = move_list.count;
        
        let us_pawns = state.board.get_pieces(state.side_to_move, PieceType::Pawn);
        let them_pawns = state.board.get_pieces(state.side_to_move.opposite(), PieceType::Pawn);
        
        let (left_attacks, right_attacks) = if state.side_to_move == crate::types::Color::White {
            ((us_pawns & !0x0101010101010101) << 7, (us_pawns & !0x8080808080808080) << 9)
        } else {
            ((us_pawns & !0x0101010101010101) >> 9, (us_pawns & !0x8080808080808080) >> 7)
        };
        

        // We will just approximate tension as pawn attacks intersecting opponent pawns
        let tension_mask = (left_attacks | right_attacks) & them_pawns;
        let tension = tension_mask.count_ones() as i32;
        
        ((mobility as i32) * 2 + tension * 5).min(150)
    }
}
