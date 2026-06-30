use crate::state::GameState;
use crate::types::{Color, PieceType};

pub fn parse_fen(fen: &str) -> Option<GameState> {
    let mut state = GameState::new();
    // clear board
    for i in 0..64 {
        for c in [Color::White, Color::Black] {
            for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop, PieceType::Rook, PieceType::Queen, PieceType::King] {
                state.board.remove_piece(c, pt, i);
            }
        }
    }
    
    let parts: Vec<&str> = fen.split_whitespace().collect();
    if parts.len() < 4 { return None; }
    
    let mut rank = 7;
    let mut file = 0;
    
    for c in parts[0].chars() {
        if c == '/' {
            rank -= 1;
            file = 0;
        } else if c.is_digit(10) {
            file += c.to_digit(10).unwrap() as i8;
        } else {
            let sq = (rank * 8 + file) as u8;
            let (color, pt) = match c {
                'P' => (Color::White, PieceType::Pawn),
                'N' => (Color::White, PieceType::Knight),
                'B' => (Color::White, PieceType::Bishop),
                'R' => (Color::White, PieceType::Rook),
                'Q' => (Color::White, PieceType::Queen),
                'K' => (Color::White, PieceType::King),
                'p' => (Color::Black, PieceType::Pawn),
                'n' => (Color::Black, PieceType::Knight),
                'b' => (Color::Black, PieceType::Bishop),
                'r' => (Color::Black, PieceType::Rook),
                'q' => (Color::Black, PieceType::Queen),
                'k' => (Color::Black, PieceType::King),
                _ => continue,
            };
            state.board.add_piece(color, pt, sq);
            file += 1;
        }
    }
    
    state.set_side_to_move(if parts[1] == "w" { Color::White } else { Color::Black });
    
    let mut castling = 0;
    for c in parts[2].chars() {
        match c {
            'K' => castling |= 1,
            'Q' => castling |= 2,
            'k' => castling |= 4,
            'q' => castling |= 8,
            _ => (),
        }
    }
    state.set_castling_rights(castling);
    
    if parts[3] != "-" {
        let file = parts[3].chars().nth(0).unwrap() as u8 - b'a';
        let rank = parts[3].chars().nth(1).unwrap() as u8 - b'1';
        state.set_en_passant(Some(rank * 8 + file));
    } else {
        state.set_en_passant(None);
    }
    
    if parts.len() >= 5 {
        state.halfmove_clock = parts[4].parse().unwrap_or(0);
    }
    
    state.recompute_hash();
    Some(state)
}
