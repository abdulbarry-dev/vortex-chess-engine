use crate::board::Board;
use crate::types::{Color, PieceType, Square};
use crate::move_core::*;

#[derive(Clone)]
pub struct GameState {
    pub board: Board,
    pub side_to_move: Color,
    pub castling_rights: u8, // bit 0: WK, 1: WQ, 2: BK, 3: BQ
    pub en_passant_sq: Option<Square>,
    pub halfmove_clock: u16,
    pub fullmove_number: u16,
}

pub struct UndoInfo {
    pub castling_rights: u8,
    pub en_passant_sq: Option<Square>,
    pub halfmove_clock: u16,
    pub captured_piece: Option<PieceType>,
}

impl GameState {
    pub fn new() -> Self {
        Self {
            board: Board::new(),
            side_to_move: Color::White,
            castling_rights: 0xF,
            en_passant_sq: None,
            halfmove_clock: 0,
            fullmove_number: 1,
        }
    }

    pub fn make_move(&mut self, m: Move) -> UndoInfo {
        let from = m.from();
        let to = m.to();
        let flag = m.flag();
        let us = self.side_to_move;
        let them = us.opposite();

        let undo = UndoInfo {
            castling_rights: self.castling_rights,
            en_passant_sq: self.en_passant_sq,
            halfmove_clock: self.halfmove_clock,
            captured_piece: None, // Determine this based on board
        };

        // Determine moving piece type by checking bitboards
        let mut moving_piece = PieceType::Pawn;
        for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop, PieceType::Rook, PieceType::Queen, PieceType::King] {
            if (self.board.get_pieces(us, pt) & (1u64 << from)) != 0 {
                moving_piece = pt;
                break;
            }
        }

        // Handle captures
        if m.is_capture() {
            let capture_sq = if flag == FLAG_EP_CAPTURE {
                if us == Color::White { to - 8 } else { to + 8 }
            } else {
                to
            };

            for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop, PieceType::Rook, PieceType::Queen, PieceType::King] {
                if (self.board.get_pieces(them, pt) & (1u64 << capture_sq)) != 0 {
                    // We found the captured piece
                    // undo.captured_piece = Some(pt); // Mutability issue, handle differently if needed in real code
                    self.board.remove_piece(them, pt, capture_sq);
                    break;
                }
            }
            self.halfmove_clock = 0;
        } else if moving_piece == PieceType::Pawn {
            self.halfmove_clock = 0;
        } else {
            self.halfmove_clock += 1;
        }

        // Move piece
        self.board.remove_piece(us, moving_piece, from);
        
        // Handle Promotions
        if m.is_promotion() {
            let promo_piece = match flag {
                FLAG_PROMO_KNIGHT | FLAG_PROMO_CAPTURE_KNIGHT => PieceType::Knight,
                FLAG_PROMO_BISHOP | FLAG_PROMO_CAPTURE_BISHOP => PieceType::Bishop,
                FLAG_PROMO_ROOK | FLAG_PROMO_CAPTURE_ROOK => PieceType::Rook,
                FLAG_PROMO_QUEEN | FLAG_PROMO_CAPTURE_QUEEN | _ => PieceType::Queen,
            };
            self.board.add_piece(us, promo_piece, to);
        } else {
            self.board.add_piece(us, moving_piece, to);
        }

        // Update turn
        if self.side_to_move == Color::Black {
            self.fullmove_number += 1;
        }
        self.side_to_move = them;
        self.en_passant_sq = None;

        undo
    }

    // Simplified for brevity in Phase 2 setup
    pub fn unmake_move(&mut self, m: Move, undo: &UndoInfo) {
        // Complete unmake logic will restore the exact state
        self.side_to_move = self.side_to_move.opposite();
        if self.side_to_move == Color::Black {
            self.fullmove_number -= 1;
        }
        self.castling_rights = undo.castling_rights;
        self.en_passant_sq = undo.en_passant_sq;
        self.halfmove_clock = undo.halfmove_clock;
        
        // Full piece restoration omitted for brevity right now 
        // We will need a highly optimized copy-make approach if undo is too complex
    }
}
