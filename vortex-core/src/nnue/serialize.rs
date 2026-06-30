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
    
    macro_rules! read_i16 {
        () => {{
            if offset + 2 > buffer.len() { 0 }
            else {
                let val = i16::from_le_bytes([buffer[offset], buffer[offset + 1]]);
                offset += 2;
                val
            }
        }}
    }

    // 1. PST Biases (FT_SIZE x i16)
    for i in 0..FT_SIZE {
        w.pst_biases[i] = read_i16!();
    }
    
    // 2. PST Weights (PST_FEATURES x FT_SIZE x i16)
    w.pst_weights.resize(PST_FEATURES * FT_SIZE, 0);
    for i in 0..w.pst_weights.len() {
        w.pst_weights[i] = read_i16!();
    }
    
    macro_rules! read_i8 {
        () => {{
            if offset + 1 > buffer.len() { 0 }
            else {
                let val = buffer[offset] as i8;
                offset += 1;
                val
            }
        }}
    }

    macro_rules! read_f32 {
        () => {{
            if offset + 4 > buffer.len() { 0.0 }
            else {
                let val = f32::from_le_bytes([buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]]);
                offset += 4;
                val
            }
        }}
    }

    macro_rules! read_i32 {
        () => {{
            if offset + 4 > buffer.len() { 0 }
            else {
                let val = i32::from_le_bytes([buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]]);
                offset += 4;
                val
            }
        }}
    }

    // 3. Threat Weights (THREAT_FEATURES x FT_SIZE x i8)
    w.threat_weights.resize(crate::types::THREAT_FEATURES * FT_SIZE, 0);
    for i in 0..w.threat_weights.len() {
        w.threat_weights[i] = read_i8!();
    }

    // 4. Phase Embeddings (NUM_PHASE_BUCKETS x FT_SIZE x f32)
    w.phase_embeddings.resize(crate::types::NUM_PHASE_BUCKETS * FT_SIZE, 0.0);
    for i in 0..w.phase_embeddings.len() {
        w.phase_embeddings[i] = read_f32!();
    }

    // 5. L1 Weights (L2_SIZE x FT_SIZE x i8)
    w.l1_weights.resize(crate::types::L2_SIZE * FT_SIZE, 0);
    for i in 0..w.l1_weights.len() {
        w.l1_weights[i] = read_i8!();
    }

    // 6. L1 Biases (NUM_PHASE_BUCKETS x L2_SIZE x f32)
    w.l1_biases.resize(crate::types::NUM_PHASE_BUCKETS * crate::types::L2_SIZE, 0.0);
    for i in 0..w.l1_biases.len() {
        w.l1_biases[i] = read_f32!();
    }

    // 7. L1 Quantization (i32)
    w.l1_quant = read_i32!();

    // 8. L2 Weights (L2_SIZE x L3_SIZE x f32)
    w.l2_weights.resize(crate::types::L2_SIZE * crate::types::L3_SIZE, 0.0);
    for i in 0..w.l2_weights.len() {
        w.l2_weights[i] = read_f32!();
    }

    // 9. L2 Biases (NUM_PHASE_BUCKETS x L3_SIZE x f32)
    w.l2_biases.resize(crate::types::NUM_PHASE_BUCKETS * crate::types::L3_SIZE, 0.0);
    for i in 0..w.l2_biases.len() {
        w.l2_biases[i] = read_f32!();
    }

    // 10. L3 Weights (L3_SIZE x f32)
    w.l3_weights.resize(crate::types::L3_SIZE, 0.0);
    for i in 0..w.l3_weights.len() {
        w.l3_weights[i] = read_f32!();
    }

    // 11. L3 Biases (NUM_PHASE_BUCKETS x f32)
    w.l3_biases.resize(crate::types::NUM_PHASE_BUCKETS, 0.0);
    for i in 0..w.l3_biases.len() {
        w.l3_biases[i] = read_f32!();
    }

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
