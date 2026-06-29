use crate::nnue::weights::WEIGHTS;
use crate::types::{FT_SIZE, PST_FEATURES};

/// Loads the .vortex binary weight format.
pub fn load_vortex_weights(buffer: &[u8]) -> bool {
    let mut offset = 0;
    
    // We expect the magic header "VRTX"
    if buffer.len() < 4 || &buffer[0..4] != b"VRTX" {
        return false;
    }
    offset += 4;
    
    let mut w = WEIGHTS.lock().unwrap();
    
    // Helper to read i16
    let mut read_i16 = || -> i16 {
        if offset + 2 > buffer.len() { return 0; }
        let val = i16::from_le_bytes([buffer[offset], buffer[offset + 1]]);
        offset += 2;
        val
    };

    // 1. PST Biases (FT_SIZE x i16)
    for i in 0..FT_SIZE {
        w.pst_biases[i] = read_i16();
    }
    
    // 2. PST Weights (PST_FEATURES x FT_SIZE x i16)
    w.pst_weights.resize(PST_FEATURES * FT_SIZE, 0);
    for i in 0..w.pst_weights.len() {
        w.pst_weights[i] = read_i16();
    }
    
    // For now we assume standard sizes. Full implementation will load Threat, L1, L2, L3...
    // In Phase 1 we just stub the rest of the parsing to prevent panics.
    // L1_quant
    w.l1_quant = 64; // Default
    
    w.is_loaded = true;
    true
}

/// Initialization for testing our new VortexWeights
pub fn init_vortex_empty() {
    let mut w = WEIGHTS.lock().unwrap();
    if w.pst_weights.is_empty() {
        w.pst_weights = vec![0; PST_FEATURES * FT_SIZE];
    }
    w.is_loaded = true;
}

pub fn is_vortex_loaded() -> bool {
    WEIGHTS.lock().unwrap().is_loaded
}
