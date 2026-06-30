use crate::types::{Color, FT_SIZE, FT_HALF, FT_QUANT, FT_SHIFT, NUM_PHASE_BUCKETS, L2_SIZE, L3_SIZE};
use crate::state::GameState;
use crate::nnue::weights::WEIGHTS;
use crate::nnue::network::IncrementalNetwork;

/// Determines the current game phase based on non-pawn material.
/// Returns (phase_float, bucket_index).
pub fn game_phase(state: &GameState) -> (f32, usize) {
    let opening_material = 2 * (500 * 2 + 330 * 2 + 320 * 2 + 900); // approx 7800
    
    let w = state.board.non_pawn_material(Color::White);
    let b = state.board.non_pawn_material(Color::Black);
    
    let phase_f = ((w + b) as f32 / opening_material as f32).clamp(0.0, 1.0);
    let bucket = (phase_f * (NUM_PHASE_BUCKETS - 1) as f32) as usize;
    
    (phase_f, bucket)
}

/// Applies the Multiplicative Feature Transformer activation.
/// It takes the PST accumulator, the Threat accumulator, and the specific phase embedding vector.
/// Returns the L1 input (u8 quantized activations).
pub fn activate_ft(
    pst: &[i16; FT_SIZE],
    threat: &[i16; FT_SIZE],
    phase_embed: &[f32],
) -> [u8; FT_SIZE] {
    let mut ft = [0u8; FT_SIZE];
    let mut sums = [0i16; FT_SIZE];
    
    // Sum the inputs and the phase bias
    for i in 0..FT_SIZE {
        let embed = (phase_embed[i] * FT_QUANT as f32) as i16;
        sums[i] = (pst[i] as i32 + threat[i] as i32 + embed as i32).clamp(0, FT_QUANT as i32) as i16;
    }
    
    // Multiplicative activation: (x_i * x_{i+half}) >> shift
    for i in 0..FT_HALF {
        let product = (sums[i] as u32 * sums[i + FT_HALF] as u32) >> FT_SHIFT;
        ft[i] = product.min(255) as u8;
        ft[i + FT_HALF] = ft[i];  // The paper mirrors the output to keep FT_SIZE constant for L1
    }
    
    ft
}

/// Full NNUE forward pass.
pub fn evaluate_nnue(state: &GameState, network: &IncrementalNetwork) -> i32 {
    let w = WEIGHTS.lock().unwrap();
    if !w.is_loaded {
        return 0; // Fallback happens elsewhere
    }

    let (_, bucket) = game_phase(state);
    let stm = state.side_to_move as usize;

    let pst = &network.current_pst_ref().values[stm];
    let threat = &network.current_threat_ref().values[stm];
    
    let phase_offset = bucket * FT_SIZE;
    let phase_embed = &w.phase_embeddings[phase_offset..phase_offset + FT_SIZE];

    let ft = activate_ft(pst, threat, phase_embed);

    // L1 Pass
    let mut l1_out = [0.0f32; L2_SIZE];
    let l1_bias_offset = bucket * L2_SIZE;
    let dequant = 1.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);
    
    for i in 0..L2_SIZE {
        let mut sum = 0i32;
        let w_offset = i * FT_SIZE;
        for j in 0..FT_SIZE {
            if ft[j] > 0 {
                sum += (ft[j] as i32) * (w.l1_weights[w_offset + j] as i32);
            }
        }
        
        let mut val = (sum as f32) * dequant + w.l1_biases[l1_bias_offset + i];
        if val < 0.0 { val = 0.0; } // CReLU / ReLU
        l1_out[i] = val;
    }

    // L2 Pass
    let mut l2_out = [0.0f32; L3_SIZE];
    let l2_bias_offset = bucket * L3_SIZE;
    
    for i in 0..L3_SIZE {
        let mut sum = w.l2_biases[l2_bias_offset + i];
        let w_offset = i * L2_SIZE;
        for j in 0..L2_SIZE {
            sum += l1_out[j] * w.l2_weights[w_offset + j];
        }
        if sum < 0.0 { sum = 0.0; } // CReLU / ReLU
        l2_out[i] = sum;
    }

    // L3 Pass
    let mut score = w.l3_biases[bucket];
    for j in 0..L3_SIZE {
        score += l2_out[j] * w.l3_weights[j];
    }

    (score * 100.0) as i32
}

