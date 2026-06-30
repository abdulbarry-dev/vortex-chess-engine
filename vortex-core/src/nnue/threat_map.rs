use crate::types::{PieceType, Square};

use std::sync::OnceLock;

pub static THREAT_MAP: OnceLock<ThreatMap> = OnceLock::new();

pub fn get_threat_map() -> &'static ThreatMap {
    THREAT_MAP.get_or_init(|| ThreatMap::new())
}

pub struct ThreatMap {
    pub attack_id: [[[u16; 64]; 64]; 6],
    pub max_id: u16,
}

impl ThreatMap {
    pub fn new() -> Self {
        let mut map = Self {
            attack_id: [[[u16::MAX; 64]; 64]; 6],
            max_id: 0,
        };
        
        for pt in 0..6 {
            let pt_enum = match pt {
                0 => PieceType::Pawn,
                1 => PieceType::Knight,
                2 => PieceType::Bishop,
                3 => PieceType::Rook,
                4 => PieceType::Queen,
                5 => PieceType::King,
                _ => unreachable!(),
            };
            
            for from in 0..64 {
                let attacks = match pt_enum {
                    PieceType::Pawn => {
                        let mut bb = 0;
                        if from / 8 < 7 {
                            if from % 8 > 0 { bb |= 1u64 << (from + 7); }
                            if from % 8 < 7 { bb |= 1u64 << (from + 9); }
                        }
                        if from / 8 > 0 {
                            if from % 8 > 0 { bb |= 1u64 << (from - 9); }
                            if from % 8 < 7 { bb |= 1u64 << (from - 7); }
                        }
                        bb
                    },
                    PieceType::Knight => crate::attacks::get_knight_attacks(from as u8),
                    PieceType::Bishop => crate::magic::get_bishop_attacks(from as u8, 0),
                    PieceType::Rook => crate::magic::get_rook_attacks(from as u8, 0),
                    PieceType::Queen => crate::magic::get_bishop_attacks(from as u8, 0) | crate::magic::get_rook_attacks(from as u8, 0),
                    PieceType::King => crate::attacks::get_king_attacks(from as u8),
                };
                
                let mut bb = attacks;
                while bb != 0 {
                    let to = bb.trailing_zeros() as usize;
                    bb &= bb - 1;
                    map.attack_id[pt][from as usize][to] = map.max_id;
                    map.max_id += 1;
                }
            }
        }
        map
    }

    pub fn get_index(&self, attacker: PieceType, from: Square, victim: PieceType, to: Square) -> Option<usize> {
        let id = self.attack_id[attacker as usize][from as usize][to as usize];
        if id == u16::MAX {
            None
        } else {
            Some((id as usize * 6) + victim as usize)
        }
    }
}
