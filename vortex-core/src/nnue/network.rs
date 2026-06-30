use crate::nnue::accumulator::{PstAccumulator, ThreatAccumulator, ThreatDelta};
use crate::nnue::weights::WEIGHTS;
use crate::types::{Color, PieceType, Square};

#[derive(Clone)]
pub struct IncrementalNetwork {
    pub pst_stack: Vec<PstAccumulator>,
    pub threat_stack: Vec<ThreatAccumulator>,
    pub index: usize,
}

impl IncrementalNetwork {
    pub fn new() -> Self {
        Self {
            pst_stack: vec![PstAccumulator::new(); 256],
            threat_stack: vec![ThreatAccumulator::new(); 256],
            index: 0,
        }
    }

    pub fn push(&mut self) {
        if self.index + 1 < self.pst_stack.len() {
            self.pst_stack[self.index + 1] = self.pst_stack[self.index];
            self.threat_stack[self.index + 1] = self.threat_stack[self.index];
            self.threat_stack[self.index + 1].clear_deltas();
            self.index += 1;
        }
    }

    pub fn pop(&mut self) {
        if self.index > 0 {
            self.index -= 1;
        }
    }

    pub fn current_pst(&mut self) -> &mut PstAccumulator {
        &mut self.pst_stack[self.index]
    }

    pub fn current_threat(&mut self) -> &mut ThreatAccumulator {
        &mut self.threat_stack[self.index]
    }

    pub fn current_pst_ref(&self) -> &PstAccumulator {
        &self.pst_stack[self.index]
    }

    pub fn current_threat_ref(&self) -> &ThreatAccumulator {
        &self.threat_stack[self.index]
    }

    /// Full refresh of the PST accumulator from scratch (e.g. at startpos or after loading weights)
    pub fn refresh_pst(&mut self, _w_king_sq: Square, _b_king_sq: Square) {
        let weights = WEIGHTS.lock().unwrap();
        if !weights.is_loaded {
            return;
        }

        let pst = &mut self.pst_stack[self.index];
        pst.values[0].copy_from_slice(&weights.pst_biases);
        pst.values[1].copy_from_slice(&weights.pst_biases);
        
        pst.accurate[0] = true;
        pst.accurate[1] = true;
        
        // Piece loops would go here, updating based on w_king_sq and b_king_sq.
        // For Phase 1 we stub this to keep compilation fast, and expand during evaluation port.
    }

    /// Update PST incrementally given a piece moving from `from` to `to`
    pub fn update_pst(&mut self, _pt: PieceType, _color: Color, _from: Square, _to: Square) {
        let weights = crate::nnue::weights::WEIGHTS.lock().unwrap();
        if !weights.is_loaded {
            return;
        }
        
        let pst = &mut self.pst_stack[self.index];
        pst.accurate[0] = false;
        pst.accurate[1] = false;
    }

    pub fn update_threats(&mut self, board: &crate::board::Board, piece: PieceType, color: Color, from: Square, to: Square) {
        self.push_threats_on_change(board, color, piece, from, false);
        self.push_threats_on_change(board, color, piece, to, true);
    }

    pub fn push_threats_on_change(&mut self, board: &crate::board::Board, color: Color, piece: PieceType, sq: Square, add: bool) {
        let attacks = Self::get_attacks(piece, color, sq, board.occupancies[2]);
        let mut bb = attacks & board.occupancies[color.opposite() as usize];
        while bb != 0 {
            let to_sq = bb.trailing_zeros() as Square;
            bb &= bb - 1;
            if let Some((_, victim_pt)) = board.piece_at(to_sq) {
                self.push_threat_delta(ThreatDelta::new(piece, sq, victim_pt, to_sq, add));
            }
        }

        let them = color.opposite();
        for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop, PieceType::Rook, PieceType::Queen, PieceType::King] {
            let mut enemy_bb = board.get_pieces(them, pt);
            while enemy_bb != 0 {
                let e_sq = enemy_bb.trailing_zeros() as Square;
                enemy_bb &= enemy_bb - 1;
                let e_attacks = Self::get_attacks(pt, them, e_sq, board.occupancies[2]);
                if (e_attacks & (1u64 << sq)) != 0 {
                    self.push_threat_delta(ThreatDelta::new(pt, e_sq, piece, sq, add));
                }
            }
        }
    }

    fn get_attacks(pt: PieceType, color: Color, sq: Square, all_pieces: u64) -> u64 {
        match pt {
            PieceType::Pawn => {
                let mut bb = 0;
                if color == Color::White {
                    if sq / 8 < 7 {
                        if sq % 8 > 0 { bb |= 1u64 << (sq + 7); }
                        if sq % 8 < 7 { bb |= 1u64 << (sq + 9); }
                    }
                } else {
                    if sq / 8 > 0 {
                        if sq % 8 > 0 { bb |= 1u64 << (sq - 9); }
                        if sq % 8 < 7 { bb |= 1u64 << (sq - 7); }
                    }
                }
                bb
            },
            PieceType::Knight => crate::attacks::get_knight_attacks(sq),
            PieceType::Bishop => crate::magic::get_bishop_attacks(sq, all_pieces),
            PieceType::Rook => crate::magic::get_rook_attacks(sq, all_pieces),
            PieceType::Queen => crate::magic::get_bishop_attacks(sq, all_pieces) | crate::magic::get_rook_attacks(sq, all_pieces),
            PieceType::King => crate::attacks::get_king_attacks(sq),
        }
    }

    pub fn push_threat_delta(&mut self, delta: ThreatDelta) {
        let threat = &mut self.threat_stack[self.index];
        threat.push_delta(delta);
        threat.accurate[0] = false;
        threat.accurate[1] = false;
    }

    pub fn ensure_accurate(&mut self, board: &crate::board::Board) {
        if !self.pst_stack[self.index].accurate[0] || !self.pst_stack[self.index].accurate[1] {
            let w_king = board.get_pieces(Color::White, PieceType::King).trailing_zeros() as Square;
            let b_king = board.get_pieces(Color::Black, PieceType::King).trailing_zeros() as Square;
            self.refresh_pst(w_king, b_king);
        }
    }
}
