use crate::nnue::accumulator::{PstAccumulator, ThreatAccumulator, ThreatDelta};
use crate::nnue::weights::WEIGHTS;
use crate::types::{Color, PieceType, Square, FT_SIZE};

#[derive(Clone, Copy)]
pub struct IncrementalNetwork {
    pub pst: PstAccumulator,
    pub threat: ThreatAccumulator,
}

impl IncrementalNetwork {
    pub fn new() -> Self {
        Self {
            pst: PstAccumulator::new(),
            threat: ThreatAccumulator::new(),
        }
    }

    /// Full refresh of the PST accumulator from scratch (e.g. at startpos or after loading weights)
    pub fn refresh_pst(&mut self, _w_king_sq: Square, _b_king_sq: Square) {
        let weights = WEIGHTS.lock().unwrap();
        if !weights.is_loaded {
            return;
        }

        self.pst.values[0].copy_from_slice(&weights.pst_biases);
        self.pst.values[1].copy_from_slice(&weights.pst_biases);
        
        self.pst.accurate[0] = true;
        self.pst.accurate[1] = true;
        
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
        self.pst.accurate[0] = false; // Mark dirty for now
        self.pst.accurate[1] = false;
    }

    /// Push a threat delta (incrementally updates threat accumulator later or immediately)
    pub fn push_threat_delta(&mut self, delta: ThreatDelta) {
        self.threat.push_delta(delta);
        self.threat.accurate[0] = false;
        self.threat.accurate[1] = false;
    }
}
