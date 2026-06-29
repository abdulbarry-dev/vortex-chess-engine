use crate::bitboard::{Bitboard, EMPTY};
use crate::types::{Color, PieceType, Square};

/// The core bitboard representation.
/// We use arrays to store pieces: 
/// pieces[Color][PieceType] and occupancies[Color]
#[derive(Clone, Debug)]
pub struct Board {
    // [0] is White, [1] is Black
    pub pieces: [[Bitboard; 6]; 2],
    // [0] is White occupancies, [1] is Black, [2] is Both
    pub occupancies: [Bitboard; 3],
}

impl Board {
    pub fn new() -> Self {
        Self {
            pieces: [[EMPTY; 6]; 2],
            occupancies: [EMPTY; 3],
        }
    }

    /// Retrieve the color index (White = 0, Black = 1)
    #[inline(always)]
    fn color_index(color: Color) -> usize {
        match color {
            Color::White => 0,
            Color::Black => 1,
        }
    }

    /// Retrieve the piece type index
    #[inline(always)]
    fn piece_index(pt: PieceType) -> usize {
        pt as usize
    }

    /// Add a piece to the board
    pub fn add_piece(&mut self, color: Color, pt: PieceType, sq: Square) {
        let c = Self::color_index(color);
        let p = Self::piece_index(pt);
        let bit = 1u64 << sq;
        
        self.pieces[c][p] |= bit;
        self.occupancies[c] |= bit;
        self.occupancies[2] |= bit;
    }

    /// Remove a piece from the board
    pub fn remove_piece(&mut self, color: Color, pt: PieceType, sq: Square) {
        let c = Self::color_index(color);
        let p = Self::piece_index(pt);
        let bit = !(1u64 << sq);
        
        self.pieces[c][p] &= bit;
        self.occupancies[c] &= bit;
        self.occupancies[2] &= bit;
    }

    /// Get all pieces of a specific color and type
    pub fn get_pieces(&self, color: Color, pt: PieceType) -> Bitboard {
        self.pieces[Self::color_index(color)][Self::piece_index(pt)]
    }

    /// Calculate standard non-pawn material for game phase
    pub fn non_pawn_material(&self, color: Color) -> i32 {
        let n = self.get_pieces(color, PieceType::Knight).count_ones() as i32;
        let b = self.get_pieces(color, PieceType::Bishop).count_ones() as i32;
        let r = self.get_pieces(color, PieceType::Rook).count_ones() as i32;
        let q = self.get_pieces(color, PieceType::Queen).count_ones() as i32;
        
        n * 320 + b * 330 + r * 500 + q * 900
    }
}
