use crate::types::Square;

pub const FLAG_QUIET: u16 = 0;
pub const FLAG_DOUBLE_PAWN: u16 = 1;
pub const FLAG_KING_CASTLE: u16 = 2;
pub const FLAG_QUEEN_CASTLE: u16 = 3;
pub const FLAG_CAPTURE: u16 = 4;
pub const FLAG_EP_CAPTURE: u16 = 5;
pub const FLAG_PROMO_KNIGHT: u16 = 8;
pub const FLAG_PROMO_BISHOP: u16 = 9;
pub const FLAG_PROMO_ROOK: u16 = 10;
pub const FLAG_PROMO_QUEEN: u16 = 11;
pub const FLAG_PROMO_CAPTURE_KNIGHT: u16 = 12;
pub const FLAG_PROMO_CAPTURE_BISHOP: u16 = 13;
pub const FLAG_PROMO_CAPTURE_ROOK: u16 = 14;
pub const FLAG_PROMO_CAPTURE_QUEEN: u16 = 15;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct Move(pub u16);

impl Move {
    #[inline(always)]
    pub fn new(from: Square, to: Square, flag: u16) -> Self {
        Move((from as u16) | ((to as u16) << 6) | (flag << 12))
    }

    #[inline(always)]
    pub fn from(self) -> Square {
        (self.0 & 0x3F) as Square
    }

    #[inline(always)]
    pub fn to(self) -> Square {
        ((self.0 >> 6) & 0x3F) as Square
    }

    #[inline(always)]
    pub fn flag(self) -> u16 {
        self.0 >> 12
    }

    pub fn is_capture(self) -> bool {
        (self.flag() & 4) != 0
    }

    pub fn is_promotion(self) -> bool {
        (self.flag() & 8) != 0
    }
}
