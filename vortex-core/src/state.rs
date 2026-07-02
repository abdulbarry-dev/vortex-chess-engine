use crate::board::Board;
use crate::types::{Color, PieceType, Square};
use crate::move_core::*;
use crate::zobrist::get_zobrist;
use crate::nnue::network::IncrementalNetwork;

#[derive(Clone)]
pub struct GameState {
    pub board: Board,
    pub side_to_move: Color,
    pub castling_rights: u8,
    pub en_passant_sq: Option<Square>,
    pub halfmove_clock: u16,
    pub fullmove_number: u16,
    pub repetition_history: Vec<u64>,
    pub hash: u64,
    pub nnue: IncrementalNetwork,
    pub threat_delta: i16,
}

pub struct UndoInfo {
    pub castling_rights: u8,
    pub en_passant_sq: Option<Square>,
    pub halfmove_clock: u16,
    pub captured_piece: Option<(Color, PieceType)>,
    pub hash: u64,
}

const WHITE_ROOK_KING_SQ: Square = 7;
const WHITE_ROOK_QUEEN_SQ: Square = 0;
const BLACK_ROOK_KING_SQ: Square = 63;
const BLACK_ROOK_QUEEN_SQ: Square = 56;

impl GameState {
    pub fn recompute_hash(&mut self) {
        self.hash = get_zobrist().compute_hash(&self.board, self.side_to_move, self.castling_rights, self.en_passant_sq);
    }

    pub fn new() -> Self {
        let board = Board::new();
        let z = get_zobrist();
        let hash = z.compute_hash(&board, Color::White, 0xF, None);
        Self {
            board,
            side_to_move: Color::White,
            castling_rights: 0xF,
            en_passant_sq: None,
            halfmove_clock: 0,
            fullmove_number: 1,
            repetition_history: Vec::new(),
            hash,
            nnue: IncrementalNetwork::new(),
            threat_delta: 0,
        }
    }

    pub fn set_side_to_move(&mut self, color: Color) {
        if self.side_to_move != color {
            self.hash ^= get_zobrist().side_to_move_key;
            self.side_to_move = color;
        }
    }

    pub fn set_en_passant(&mut self, ep: Option<Square>) {
        if let Some(f) = self.en_passant_sq {
            self.hash ^= get_zobrist().en_passant_keys[(f % 8) as usize];
        }
        self.en_passant_sq = ep;
        if let Some(f) = ep {
            self.hash ^= get_zobrist().en_passant_keys[(f % 8) as usize];
        }
    }

    pub fn set_castling_rights(&mut self, rights: u8) {
        self.hash ^= get_zobrist().castling_keys[self.castling_rights as usize];
        self.castling_rights = rights;
        self.hash ^= get_zobrist().castling_keys[rights as usize];
    }

    pub fn make_move(&mut self, m: Move) -> UndoInfo {
        self.repetition_history.push(self.hash);
        let from = m.from();
        let to = m.to();
        let flag = m.flag();
        let us = self.side_to_move;
        let them = us.opposite();
        let z = get_zobrist();

        let mut captured_piece: Option<(Color, PieceType)> = None;

        let mut moving_piece = PieceType::Pawn;
        for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop, PieceType::Rook, PieceType::Queen, PieceType::King] {
            if (self.board.get_pieces(us, pt) & (1u64 << from)) != 0 {
                moving_piece = pt;
                break;
            }
        }

        if m.is_capture() {
            let capture_sq = if flag == FLAG_EP_CAPTURE {
                if us == Color::White { to - 8 } else { to + 8 }
            } else {
                to
            };

            for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop, PieceType::Rook, PieceType::Queen, PieceType::King] {
                if (self.board.get_pieces(them, pt) & (1u64 << capture_sq)) != 0 {
                    captured_piece = Some((them, pt));
                    break;
                }
            }
            self.halfmove_clock = 0;
        } else if moving_piece == PieceType::Pawn {
            self.halfmove_clock = 0;
        } else {
            self.halfmove_clock += 1;
        }

        let undo = UndoInfo {
            castling_rights: self.castling_rights,
            en_passant_sq: self.en_passant_sq,
            halfmove_clock: self.halfmove_clock,
            captured_piece,
            hash: self.hash,
        };

        // NNUE Incremental Update: MUST be done before board is mutated so threats are correctly identified
        if crate::nnue::serialize::is_vortex_loaded() {
            self.nnue.push();
            self.nnue.update_pst(&self.board, moving_piece, us, from, to);
            
            if let Some((color, pt)) = captured_piece {
                let capture_sq = if flag == crate::move_core::FLAG_EP_CAPTURE {
                    if us == Color::White { to - 8 } else { to + 8 }
                } else {
                    to
                };
                self.nnue.remove_pst(&self.board, pt, color, capture_sq);
                self.nnue.push_threats_on_change(&self.board, color, pt, capture_sq, false);
            }
            
            self.nnue.update_threats(&self.board, moving_piece, us, from, to);
            
            if m.is_promotion() {
                let promo_piece = match flag {
                    FLAG_PROMO_KNIGHT | FLAG_PROMO_CAPTURE_KNIGHT => PieceType::Knight,
                    FLAG_PROMO_BISHOP | FLAG_PROMO_CAPTURE_BISHOP => PieceType::Bishop,
                    FLAG_PROMO_ROOK | FLAG_PROMO_CAPTURE_ROOK => PieceType::Rook,
                    FLAG_PROMO_QUEEN | FLAG_PROMO_CAPTURE_QUEEN | _ => PieceType::Queen,
                };
                self.nnue.push_threats_on_change(&self.board, us, PieceType::Pawn, to, false);
                self.nnue.push_threats_on_change(&self.board, us, promo_piece, to, true);
            } else if flag == FLAG_KING_CASTLE {
                self.nnue.update_threats(&self.board, PieceType::Rook, us, to + 1, to - 1);
            } else if flag == FLAG_QUEEN_CASTLE {
                self.nnue.update_threats(&self.board, PieceType::Rook, us, to - 2, to + 1);
            }
        }

        // Now we actually mutate the board
        if let Some((color, pt)) = captured_piece {
            let capture_sq = if flag == FLAG_EP_CAPTURE {
                if us == Color::White { to - 8 } else { to + 8 }
            } else {
                to
            };
            self.board.remove_piece(color, pt, capture_sq);
            self.hash ^= z.piece_keys[color as usize][pt as usize][capture_sq as usize];
        }

        self.hash ^= z.piece_keys[us as usize][moving_piece as usize][from as usize];
        self.board.remove_piece(us, moving_piece, from);

        if m.is_promotion() {
            let promo_piece = match flag {
                FLAG_PROMO_KNIGHT | FLAG_PROMO_CAPTURE_KNIGHT => PieceType::Knight,
                FLAG_PROMO_BISHOP | FLAG_PROMO_CAPTURE_BISHOP => PieceType::Bishop,
                FLAG_PROMO_ROOK | FLAG_PROMO_CAPTURE_ROOK => PieceType::Rook,
                FLAG_PROMO_QUEEN | FLAG_PROMO_CAPTURE_QUEEN | _ => PieceType::Queen,
            };
            self.board.add_piece(us, promo_piece, to);
            self.hash ^= z.piece_keys[us as usize][promo_piece as usize][to as usize];
        } else if flag == FLAG_KING_CASTLE {
            self.board.add_piece(us, PieceType::King, to);
            self.board.remove_piece(us, PieceType::Rook, to + 1);
            self.board.add_piece(us, PieceType::Rook, to - 1);
            self.hash ^= z.piece_keys[us as usize][PieceType::King as usize][to as usize];
            self.hash ^= z.piece_keys[us as usize][PieceType::Rook as usize][(to + 1) as usize];
            self.hash ^= z.piece_keys[us as usize][PieceType::Rook as usize][(to - 1) as usize];
        } else if flag == FLAG_QUEEN_CASTLE {
            self.board.add_piece(us, PieceType::King, to);
            self.board.remove_piece(us, PieceType::Rook, to - 2);
            self.board.add_piece(us, PieceType::Rook, to + 1);
            self.hash ^= z.piece_keys[us as usize][PieceType::King as usize][to as usize];
            self.hash ^= z.piece_keys[us as usize][PieceType::Rook as usize][(to - 2) as usize];
            self.hash ^= z.piece_keys[us as usize][PieceType::Rook as usize][(to + 1) as usize];
        } else {
            self.board.add_piece(us, moving_piece, to);
            self.hash ^= z.piece_keys[us as usize][moving_piece as usize][to as usize];
        }

        if let Some(f) = self.en_passant_sq {
            self.hash ^= z.en_passant_keys[(f % 8) as usize];
        }
        self.en_passant_sq = None;
        if moving_piece == PieceType::Pawn {
            let from_rank = from / 8;
            let to_rank = to / 8;
            if (from_rank == 1 && to_rank == 3) || (from_rank == 6 && to_rank == 4) {
                self.en_passant_sq = Some((from + to) / 2);
                self.hash ^= z.en_passant_keys[((from + to) / 2 % 8) as usize];
            }
        }

        self.hash ^= z.castling_keys[self.castling_rights as usize];
        if moving_piece == PieceType::King {
            self.castling_rights &= match us {
                Color::White => !0x03,
                Color::Black => !0x0C,
            };
        }
        if moving_piece == PieceType::Rook {
            if from == WHITE_ROOK_KING_SQ { self.castling_rights &= !0x01; }
            if from == WHITE_ROOK_QUEEN_SQ { self.castling_rights &= !0x02; }
            if from == BLACK_ROOK_KING_SQ { self.castling_rights &= !0x04; }
            if from == BLACK_ROOK_QUEEN_SQ { self.castling_rights &= !0x08; }
        }
        if to == WHITE_ROOK_KING_SQ { self.castling_rights &= !0x01; }
        if to == WHITE_ROOK_QUEEN_SQ { self.castling_rights &= !0x02; }
        if to == BLACK_ROOK_KING_SQ { self.castling_rights &= !0x04; }
        if to == BLACK_ROOK_QUEEN_SQ { self.castling_rights &= !0x08; }
        self.hash ^= z.castling_keys[self.castling_rights as usize];

        self.hash ^= z.side_to_move_key;
        if self.side_to_move == Color::Black {
            self.fullmove_number += 1;
        }
        self.side_to_move = them;

        undo
    }

    pub fn unmake_move(&mut self, m: Move, undo: &UndoInfo) {
        self.hash = undo.hash;
        self.side_to_move = self.side_to_move.opposite();
        if self.side_to_move == Color::Black {
            self.fullmove_number -= 1;
        }
        self.castling_rights = undo.castling_rights;
        self.en_passant_sq = undo.en_passant_sq;
        self.halfmove_clock = undo.halfmove_clock;

        let us = self.side_to_move;
        let from = m.from();
        let to = m.to();
        let flag = m.flag();

        let mut moving_piece = PieceType::Pawn;
        for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop, PieceType::Rook, PieceType::Queen, PieceType::King] {
            if (self.board.get_pieces(us, pt) & (1u64 << to)) != 0 {
                moving_piece = pt;
                break;
            }
        }

        self.board.remove_piece(us, moving_piece, to);

        if flag == FLAG_KING_CASTLE {
            self.board.add_piece(us, PieceType::King, from);
            self.board.remove_piece(us, PieceType::Rook, to - 1);
            self.board.add_piece(us, PieceType::Rook, to + 1);
        } else if flag == FLAG_QUEEN_CASTLE {
            self.board.add_piece(us, PieceType::King, from);
            self.board.remove_piece(us, PieceType::Rook, to + 1);
            self.board.add_piece(us, PieceType::Rook, to - 2);
        } else if flag == FLAG_EP_CAPTURE {
            self.board.add_piece(us, PieceType::Pawn, from);
            let captured_sq = if us == Color::White { to - 8 } else { to + 8 };
            self.board.add_piece(us.opposite(), PieceType::Pawn, captured_sq);
        } else if m.is_promotion() {
            self.board.add_piece(us, PieceType::Pawn, from);
        } else {
            self.board.add_piece(us, moving_piece, from);
        }

        if m.is_capture() && flag != FLAG_EP_CAPTURE {
            let capture_sq = to;
            if let Some(ref captured) = undo.captured_piece {
                self.board.add_piece(captured.0, captured.1, capture_sq);
            }
        }

        if !self.repetition_history.is_empty() {
            self.repetition_history.pop();
        }

        if crate::nnue::serialize::is_vortex_loaded() {
            self.nnue.pop();
        }
    }
}
