use crate::board::Board;
use crate::types::{Color, PieceType, Square};
use crate::bitboard::{Bitboard, EMPTY, pop_lsb};
use crate::move_core::*;
use crate::magic::{get_rook_attacks, get_bishop_attacks};
use crate::attacks::{get_knight_attacks, get_king_attacks};

#[derive(Clone)]
pub struct MoveList {
    pub moves: [Move; 256],
    pub count: usize,
}

impl MoveList {
    pub fn new() -> Self {
        Self {
            moves: [Move(0); 256],
            count: 0,
        }
    }

    #[inline(always)]
    pub fn push(&mut self, m: Move) {
        self.moves[self.count] = m;
        self.count += 1;
    }
}

const WHITE_KING_SQ: Square = 4;
const WHITE_ROOK_KING_SQ: Square = 7;
const WHITE_ROOK_QUEEN_SQ: Square = 0;
const BLACK_KING_SQ: Square = 60;
const BLACK_ROOK_KING_SQ: Square = 63;
const BLACK_ROOK_QUEEN_SQ: Square = 56;

const RANK_1: u64 = 0x00000000000000FF;
const RANK_8: u64 = 0xFF00000000000000;

pub fn generate_pseudo_legal_moves(board: &Board, color: Color, castling_rights: u8, en_passant_sq: Option<Square>) -> MoveList {
    let mut list = MoveList::new();

    let us = color;
    let them = color.opposite();

    let our_pieces = board.occupancies[us as usize];
    let their_pieces = board.occupancies[them as usize];
    let all_pieces = board.occupancies[2];

    let empty_squares = !all_pieces;
    let enemies = their_pieces;

    generate_pawn_moves(board, us, empty_squares, enemies, en_passant_sq, &mut list);

    let mut knights = board.get_pieces(us, PieceType::Knight);
    while knights != EMPTY {
        let from = pop_lsb(&mut knights);
        let attacks = get_knight_attacks(from) & !our_pieces;
        serialize_attacks(from, attacks, enemies, &mut list);
    }

    let mut bishops = board.get_pieces(us, PieceType::Bishop);
    while bishops != EMPTY {
        let from = pop_lsb(&mut bishops);
        let attacks = get_bishop_attacks(from, all_pieces) & !our_pieces;
        serialize_attacks(from, attacks, enemies, &mut list);
    }

    let mut rooks = board.get_pieces(us, PieceType::Rook);
    while rooks != EMPTY {
        let from = pop_lsb(&mut rooks);
        let attacks = get_rook_attacks(from, all_pieces) & !our_pieces;
        serialize_attacks(from, attacks, enemies, &mut list);
    }

    let mut queens = board.get_pieces(us, PieceType::Queen);
    while queens != EMPTY {
        let from = pop_lsb(&mut queens);
        let attacks = (get_rook_attacks(from, all_pieces) | get_bishop_attacks(from, all_pieces)) & !our_pieces;
        serialize_attacks(from, attacks, enemies, &mut list);
    }

    generate_king_moves(board, us, our_pieces, enemies, empty_squares, castling_rights, &mut list);

    list
}

fn generate_king_moves(board: &Board, us: Color, our_pieces: Bitboard, enemies: Bitboard, empty_squares: Bitboard, castling_rights: u8, list: &mut MoveList) {
    let mut kings = board.get_pieces(us, PieceType::King);
    if kings == EMPTY { return; }
    let from = pop_lsb(&mut kings);
    let attacks = get_king_attacks(from) & !our_pieces;
    serialize_attacks(from, attacks, enemies, list);

    let (king_start, _rank_mask, king_side_mask, queen_side_mask, wk_flag, wq_flag, _bk_flag, _bq_flag, wk_right, wq_right, _bk_right, _bq_right) = match us {
        Color::White => (
            WHITE_KING_SQ, RANK_1,
            0x0000000000000060u64, // f1, g1
            0x000000000000000Eu64, // b1, c1, d1
            FLAG_KING_CASTLE, FLAG_QUEEN_CASTLE,
            FLAG_KING_CASTLE, FLAG_QUEEN_CASTLE,
            1, 2, 4, 8
        ),
        Color::Black => (
            BLACK_KING_SQ, RANK_8,
            0x6000000000000000u64, // f8, g8
            0x0E00000000000000u64, // b8, c8, d8
            FLAG_KING_CASTLE, FLAG_QUEEN_CASTLE,
            FLAG_KING_CASTLE, FLAG_QUEEN_CASTLE,
            1, 2, 4, 8
        ),
    };

    if from != king_start { return; }

    if castling_rights & wk_right != 0 && (empty_squares & king_side_mask) == king_side_mask {
        let rook_sq = match us { Color::White => WHITE_ROOK_KING_SQ, Color::Black => BLACK_ROOK_KING_SQ };
        if board.get_pieces(us, PieceType::Rook) & (1u64 << rook_sq) != 0 {
            list.push(Move::new(from, from + 2, wk_flag));
        }
    }

    if castling_rights & wq_right != 0 && (empty_squares & queen_side_mask) == queen_side_mask {
        let rook_sq = match us { Color::White => WHITE_ROOK_QUEEN_SQ, Color::Black => BLACK_ROOK_QUEEN_SQ };
        if board.get_pieces(us, PieceType::Rook) & (1u64 << rook_sq) != 0 {
            list.push(Move::new(from, from - 2, wq_flag));
        }
    }
}

#[inline(always)]
fn serialize_attacks(from: Square, mut attacks: Bitboard, enemies: Bitboard, list: &mut MoveList) {
    while attacks != EMPTY {
        let to = pop_lsb(&mut attacks);
        let flag = if (1u64 << to) & enemies != 0 { FLAG_CAPTURE } else { FLAG_QUIET };
        list.push(Move::new(from, to, flag));
    }
}

fn generate_pawn_moves(board: &Board, color: Color, empty: Bitboard, enemies: Bitboard, en_passant_sq: Option<Square>, list: &mut MoveList) {
    let pawns = board.get_pieces(color, PieceType::Pawn);
    if pawns == EMPTY { return; }

    let (push_dir, promo_rank, _start_rank) = match color {
        Color::White => (8, 7, 1),
        Color::Black => (-8, 0, 6),
    };

    let mut single_pushes = if color == Color::White { pawns << 8 } else { pawns >> 8 };
    single_pushes &= empty;

    let mut pushes = single_pushes;
    while pushes != EMPTY {
        let to = pop_lsb(&mut pushes);
        let from = (to as i8 - push_dir) as Square;
        let rank = to / 8;
        if rank == promo_rank as u8 {
            list.push(Move::new(from, to, FLAG_PROMO_QUEEN));
            list.push(Move::new(from, to, FLAG_PROMO_KNIGHT));
            list.push(Move::new(from, to, FLAG_PROMO_ROOK));
            list.push(Move::new(from, to, FLAG_PROMO_BISHOP));
        } else {
            list.push(Move::new(from, to, FLAG_QUIET));
        }
    }

    let mut double_pushes = if color == Color::White {
        (single_pushes & 0x0000000000FF0000) << 8
    } else {
        (single_pushes & 0x0000FF0000000000) >> 8
    };
    double_pushes &= empty;

    while double_pushes != EMPTY {
        let to = pop_lsb(&mut double_pushes);
        let from = (to as i8 - 2 * push_dir) as Square;
        list.push(Move::new(from, to, FLAG_DOUBLE_PAWN));
    }

    let left_captures = if color == Color::White { (pawns & !0x0101010101010101) << 7 } else { (pawns & !0x0101010101010101) >> 9 };
    let right_captures = if color == Color::White { (pawns & !0x8080808080808080) << 9 } else { (pawns & !0x8080808080808080) >> 7 };

    let mut left_hits = left_captures & enemies;
    while left_hits != EMPTY {
        let to = pop_lsb(&mut left_hits);
        let from = if color == Color::White { to - 7 } else { to + 9 };
        let rank = to / 8;
        if rank == promo_rank as u8 {
            list.push(Move::new(from, to, FLAG_PROMO_CAPTURE_QUEEN));
            list.push(Move::new(from, to, FLAG_PROMO_CAPTURE_KNIGHT));
            list.push(Move::new(from, to, FLAG_PROMO_CAPTURE_ROOK));
            list.push(Move::new(from, to, FLAG_PROMO_CAPTURE_BISHOP));
        } else {
            list.push(Move::new(from, to, FLAG_CAPTURE));
        }
    }

    let mut right_hits = right_captures & enemies;
    while right_hits != EMPTY {
        let to = pop_lsb(&mut right_hits);
        let from = if color == Color::White { to - 9 } else { to + 7 };
        let rank = to / 8;
        if rank == promo_rank as u8 {
            list.push(Move::new(from, to, FLAG_PROMO_CAPTURE_QUEEN));
            list.push(Move::new(from, to, FLAG_PROMO_CAPTURE_KNIGHT));
            list.push(Move::new(from, to, FLAG_PROMO_CAPTURE_ROOK));
            list.push(Move::new(from, to, FLAG_PROMO_CAPTURE_BISHOP));
        } else {
            list.push(Move::new(from, to, FLAG_CAPTURE));
        }
    }

    if let Some(ep_sq) = en_passant_sq {
        let ep_rank = ep_sq / 8;
        let expected_rank = match color {
            Color::White => 5,
            Color::Black => 2,
        };
        if ep_rank != expected_rank { return; }

        match color {
            Color::White => {
                if ep_sq % 8 != 7 {
                    let from = ep_sq - 7;
                    if (1u64 << from) & pawns != 0 {
                        list.push(Move::new(from, ep_sq, FLAG_EP_CAPTURE));
                    }
                }
                if ep_sq % 8 != 0 {
                    let from = ep_sq - 9;
                    if (1u64 << from) & pawns != 0 {
                        list.push(Move::new(from, ep_sq, FLAG_EP_CAPTURE));
                    }
                }
            },
            Color::Black => {
                if ep_sq % 8 != 0 {
                    let from = ep_sq + 7;
                    if (1u64 << from) & pawns != 0 {
                        list.push(Move::new(from, ep_sq, FLAG_EP_CAPTURE));
                    }
                }
                if ep_sq % 8 != 7 {
                    let from = ep_sq + 9;
                    if (1u64 << from) & pawns != 0 {
                        list.push(Move::new(from, ep_sq, FLAG_EP_CAPTURE));
                    }
                }
            },
        }
    }
}
