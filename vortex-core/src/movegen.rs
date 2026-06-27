use crate::board::Board;
use crate::types::{Color, PieceType, Square};
use crate::bitboard::{Bitboard, EMPTY, pop_lsb, UNIVERSAL};
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

pub fn generate_pseudo_legal_moves(board: &Board, color: Color) -> MoveList {
    let mut list = MoveList::new();
    
    let us = color;
    let them = color.opposite();
    
    let our_pieces = board.occupancies[us as usize];
    let their_pieces = board.occupancies[them as usize];
    let all_pieces = board.occupancies[2];
    
    let empty_squares = !all_pieces;
    let enemies = their_pieces;

    // 1. Generate Pawn Moves
    generate_pawn_moves(board, us, empty_squares, enemies, &mut list);
    
    // 2. Generate Knight Moves
    let mut knights = board.get_pieces(us, PieceType::Knight);
    while knights != EMPTY {
        let from = pop_lsb(&mut knights);
        let attacks = get_knight_attacks(from) & !our_pieces;
        serialize_attacks(from, attacks, enemies, &mut list);
    }
    
    // 3. Generate Bishop Moves
    let mut bishops = board.get_pieces(us, PieceType::Bishop);
    while bishops != EMPTY {
        let from = pop_lsb(&mut bishops);
        let attacks = get_bishop_attacks(from, all_pieces) & !our_pieces;
        serialize_attacks(from, attacks, enemies, &mut list);
    }
    
    // 4. Generate Rook Moves
    let mut rooks = board.get_pieces(us, PieceType::Rook);
    while rooks != EMPTY {
        let from = pop_lsb(&mut rooks);
        let attacks = get_rook_attacks(from, all_pieces) & !our_pieces;
        serialize_attacks(from, attacks, enemies, &mut list);
    }
    
    // 5. Generate Queen Moves
    let mut queens = board.get_pieces(us, PieceType::Queen);
    while queens != EMPTY {
        let from = pop_lsb(&mut queens);
        let attacks = (get_rook_attacks(from, all_pieces) | get_bishop_attacks(from, all_pieces)) & !our_pieces;
        serialize_attacks(from, attacks, enemies, &mut list);
    }
    
    // 6. Generate King Moves
    let mut kings = board.get_pieces(us, PieceType::King);
    if kings != EMPTY {
        let from = pop_lsb(&mut kings);
        let attacks = get_king_attacks(from) & !our_pieces;
        serialize_attacks(from, attacks, enemies, &mut list);
        // Castling is ignored for pseudo-legal core, we'll handle it properly later
    }
    
    list
}

#[inline(always)]
fn serialize_attacks(from: Square, mut attacks: Bitboard, enemies: Bitboard, list: &mut MoveList) {
    while attacks != EMPTY {
        let to = pop_lsb(&mut attacks);
        let flag = if (1u64 << to) & enemies != 0 { FLAG_CAPTURE } else { FLAG_QUIET };
        list.push(Move::new(from, to, flag));
    }
}

// Simple pawn generation
fn generate_pawn_moves(board: &Board, color: Color, empty: Bitboard, enemies: Bitboard, list: &mut MoveList) {
    let pawns = board.get_pieces(color, PieceType::Pawn);
    if pawns == EMPTY { return; }

    let (push_dir, promo_rank, start_rank) = match color {
        Color::White => (8, 7, 1),
        Color::Black => (-8, 0, 6),
    };

    // Single pushes
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
    
    // Double pushes
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

    // Captures (Left & Right)
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
}
