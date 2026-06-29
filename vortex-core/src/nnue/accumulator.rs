use crate::types::{PieceType, Square, FT_SIZE};

#[derive(Clone, Copy)]
pub struct PstAccumulator {
    pub values: [[i16; FT_SIZE]; 2],   // [perspective][neuron]
    pub accurate: [bool; 2],           // stm/nstm validity flags
}

impl PstAccumulator {
    pub fn new() -> Self {
        Self {
            values: [[0; FT_SIZE]; 2],
            accurate: [false; 2],
        }
    }
}

// ThreatDelta: 32-bit packed
// [attacker_type:8 | from_sq:8 | victim_type:8 | to_sq:7 | add_flag:1]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ThreatDelta(pub u32);

impl ThreatDelta {
    pub fn new(attacker: PieceType, from: Square, victim: PieceType, to: Square, add: bool) -> Self {
        let mut val = (attacker as u32) & 0xFF;
        val |= (from as u32 & 0xFF) << 8;
        val |= (victim as u32 & 0xFF) << 16;
        val |= (to as u32 & 0x7F) << 24;
        if add {
            val |= 1 << 31;
        }
        Self(val)
    }

    pub fn attacker(&self) -> u8 {
        (self.0 & 0xFF) as u8
    }
    
    pub fn from_sq(&self) -> Square {
        ((self.0 >> 8) & 0xFF) as Square
    }

    pub fn victim(&self) -> u8 {
        ((self.0 >> 16) & 0xFF) as u8
    }

    pub fn to_sq(&self) -> Square {
        ((self.0 >> 24) & 0x7F) as Square
    }

    pub fn is_add(&self) -> bool {
        (self.0 >> 31) != 0
    }
}

// Fixed size array for deltas to avoid external dependency (ArrayVec).
// 80 is the maximum number of threats that can change in a single move.
#[derive(Clone, Copy)]
pub struct ThreatAccumulator {
    pub values: [[i16; FT_SIZE]; 2],
    pub accurate: [bool; 2],
    pub deltas: [ThreatDelta; 80],
    pub delta_len: usize,
}

impl ThreatAccumulator {
    pub fn new() -> Self {
        Self {
            values: [[0; FT_SIZE]; 2],
            accurate: [false; 2],
            deltas: [ThreatDelta(0); 80],
            delta_len: 0,
        }
    }

    pub fn push_delta(&mut self, delta: ThreatDelta) {
        if self.delta_len < 80 {
            self.deltas[self.delta_len] = delta;
            self.delta_len += 1;
        }
    }
    
    pub fn clear_deltas(&mut self) {
        self.delta_len = 0;
    }
    
    pub fn deltas(&self) -> &[ThreatDelta] {
        &self.deltas[..self.delta_len]
    }
}
