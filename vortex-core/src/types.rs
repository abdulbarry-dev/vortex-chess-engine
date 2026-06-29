

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Color {
    White,
    Black,
}

impl Color {
    pub fn opposite(&self) -> Color {
        match self {
            Color::White => Color::Black,
            Color::Black => Color::White,
        }
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum PieceType {
    Pawn,
    Knight,
    Bishop,
    Rook,
    Queen,
    King,
}

pub type Square = u8;

// NNUE Constants
pub const FT_SIZE: usize = 768;
pub const FT_HALF: usize = 384;
pub const FT_QUANT: i32 = 255;
pub const FT_SHIFT: u8 = 9;
pub const L2_SIZE: usize = 16;
pub const L3_SIZE: usize = 32;
pub const NUM_PHASE_BUCKETS: usize = 16;
pub const PST_FEATURES: usize = 7680;
pub const THREAT_FEATURES: usize = 72000;
