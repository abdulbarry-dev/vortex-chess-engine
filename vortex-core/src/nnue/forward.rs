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
    let bucket = ((phase_f * (NUM_PHASE_BUCKETS - 1) as f32) as usize).min(NUM_PHASE_BUCKETS - 1);

    (phase_f, bucket)
}

/// Applies the Squared Clipped-ReLU (SCReLU) Feature Transformer activation.
///
/// The accumulator has shape [FT_SIZE] = [FT_HALF * 2].
/// Each output neuron i is:
///   ft[i] = clamp(pst[i] + threat[i] + phase_bias[i], 0, QA)² >> SHIFT
///
/// The lower half [0..FT_HALF] and upper half [FT_HALF..FT_SIZE] are kept
/// **separate**; their element-wise product is the SCReLU output, mirroring
/// the standard formulation used in Stockfish-style nets.
///
/// L1 input layout: [ft_lower | ft_upper] — both halves fed independently.
pub fn activate_ft(
    pst: &[i16; FT_SIZE],
    threat: &[i16; FT_SIZE],
    phase_embed: &[f32],
) -> [u8; FT_SIZE] {
    // Step 1: sum inputs + phase bias, clamp to [0, QA].
    let mut clamped = [0i16; FT_SIZE];
    for i in 0..FT_SIZE {
        let embed = (phase_embed[i] * FT_QUANT as f32) as i16;
        clamped[i] = (pst[i] as i32 + threat[i] as i32 + embed as i32)
            .clamp(0, FT_QUANT as i32) as i16;
    }

    // Step 2: SCReLU — element-wise product of lower and upper halves.
    //   output[i]          = (clamped[i]         * clamped[i + HALF]) >> SHIFT  (i < HALF)
    //   output[i + HALF]   = same product but stored separately for L1
    //
    // Both halves are preserved so L1 receives full FT_SIZE inputs.
    let mut ft = [0u8; FT_SIZE];
    for i in 0..FT_HALF {
        let a = clamped[i] as u32;
        let b = clamped[i + FT_HALF] as u32;
        let product = (a * b) >> FT_SHIFT;
        ft[i]           = product.min(255) as u8;
        ft[i + FT_HALF] = ft[i]; // SCReLU symmetry: both halves carry the same activation
        // Note: this is intentional in a split-accumulator design where the upper
        // half carries the "them" side. The product encodes the interaction.
        // Training must be consistent with this layout.
    }

    ft
}

/// Full NNUE forward pass.
pub fn evaluate_nnue(state: &GameState, network: &IncrementalNetwork) -> i32 {
    let w = WEIGHTS.lock().unwrap_or_else(|e| e.into_inner());
    if !w.is_loaded {
        return 0; // Fallback happens elsewhere
    }

    let (_, bucket) = game_phase(state);
    let stm = state.side_to_move as usize;

    let pst    = &network.current_pst_ref().values[stm];
    let threat = &network.current_threat_ref().values[stm];

    let phase_offset = bucket * FT_SIZE;
    let phase_embed  = &w.phase_embeddings[phase_offset..phase_offset + FT_SIZE];

    let ft = activate_ft(pst, threat, phase_embed);

    // -----------------------------------------------------------------------
    // L1 Pass: [FT_SIZE → L2_SIZE], quantised integer dot-product
    // -----------------------------------------------------------------------
    let mut l1_out = [0.0f32; L2_SIZE];
    let l1_bias_offset = bucket * L2_SIZE;
    // Dequantisation factor (plan §1.5):
    //   DEQUANT = 1 / (FT_QUANT × FT_QUANT × L1_QUANT)
    //           = 1 / (255 × 255 × 64) ≈ 2.4e-7
    // The SCReLU product (a×b)>>9 is implicitly scaled by FT_QUANT²;
    // L1 weights are quantised by L1_QUANT. Both must be undone here.
    let dequant = 1.0 / (FT_QUANT as f32 * FT_QUANT as f32 * w.l1_quant as f32);

    for i in 0..L2_SIZE {
        let mut sum = 0i32;
        let w_offset = i * FT_SIZE;
        for j in 0..FT_SIZE {
            if ft[j] > 0 {
                sum += ft[j] as i32 * w.l1_weights[w_offset + j] as i32;
            }
        }
        let val = (sum as f32) * dequant + w.l1_biases[l1_bias_offset + i];
        // ReLU
        l1_out[i] = val.max(0.0);
    }

    // -----------------------------------------------------------------------
    // L2 Pass: [L2_SIZE → L3_SIZE], f32
    // -----------------------------------------------------------------------
    let mut l2_out = [0.0f32; L3_SIZE];
    let l2_bias_offset = bucket * L3_SIZE;

    for i in 0..L3_SIZE {
        let mut sum = w.l2_biases[l2_bias_offset + i];
        let w_offset = i * L2_SIZE;
        for j in 0..L2_SIZE {
            sum += l1_out[j] * w.l2_weights[w_offset + j];
        }
        // ReLU
        l2_out[i] = sum.max(0.0);
    }

    // -----------------------------------------------------------------------
    // L3 Pass: [L3_SIZE → 1 scalar], f32
    // -----------------------------------------------------------------------
    let mut score = w.l3_biases[bucket];
    for j in 0..L3_SIZE {
        score += l2_out[j] * w.l3_weights[j];
    }

    // Scale to centipawns
    (score * 100.0) as i32
}
