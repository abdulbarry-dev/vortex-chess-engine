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
        let weights = WEIGHTS.lock().unwrap();
        if !weights.is_loaded {
            return;
        }
        
        // This is where we subtract feature index at `from` and add at `to`.
        let pst = &mut self.pst_stack[self.index];
        pst.accurate[0] = false; // Mark dirty for now
        pst.accurate[1] = false;
    }

    pub fn push_threat_delta(&mut self, delta: ThreatDelta) {
        let threat = &mut self.threat_stack[self.index];
        threat.push_delta(delta);
        threat.accurate[0] = false;
        threat.accurate[1] = false;
    }
}
