use crate::state::GameState;
use crate::types::{Color, PieceType};
use crate::bitboard::count_bits;

// A very basic material-only evaluator for the skeleton.
// We will port the defensive ideation layer (Phase 0) here in the future.
pub fn evaluate(state: &GameState) -> i16 {
    let mut score = 0;
    
    let w_pawns = count_bits(state.board.get_pieces(Color::White, PieceType::Pawn)) as i16;
    let b_pawns = count_bits(state.board.get_pieces(Color::Black, PieceType::Pawn)) as i16;
    score += (w_pawns - b_pawns) * 100;
    
    let w_knights = count_bits(state.board.get_pieces(Color::White, PieceType::Knight)) as i16;
    let b_knights = count_bits(state.board.get_pieces(Color::Black, PieceType::Knight)) as i16;
    score += (w_knights - b_knights) * 320;
    
    let w_bishops = count_bits(state.board.get_pieces(Color::White, PieceType::Bishop)) as i16;
    let b_bishops = count_bits(state.board.get_pieces(Color::Black, PieceType::Bishop)) as i16;
    score += (w_bishops - b_bishops) * 330;
    
    let w_rooks = count_bits(state.board.get_pieces(Color::White, PieceType::Rook)) as i16;
    let b_rooks = count_bits(state.board.get_pieces(Color::Black, PieceType::Rook)) as i16;
    score += (w_rooks - b_rooks) * 500;
    
    let w_queens = count_bits(state.board.get_pieces(Color::White, PieceType::Queen)) as i16;
    let b_queens = count_bits(state.board.get_pieces(Color::Black, PieceType::Queen)) as i16;
    score += (w_queens - b_queens) * 900;
    
    if state.side_to_move == Color::White {
        score
    } else {
        -score
    }
}
