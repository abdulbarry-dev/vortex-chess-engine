use crate::types::{Color, FT_SIZE, FT_HALF, FT_QUANT, FT_SHIFT, NUM_PHASE_BUCKETS};
use crate::state::GameState;

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
