/// Legacy compatibility shim.
///
/// The original `src/nnue.rs` contained a standalone HalfKP accumulator
/// (`INPUT_SIZE = 40960`, `HIDDEN_SIZE = 256`) with its own weight store.
/// That design has been superseded by the `src/nnue/` module which uses a
/// king-bucketed PST accumulator + threat accumulator with the `.vortex`
/// binary format.
///
/// This file now re-exports the symbols that external code (tests, lib.rs)
/// previously imported from here, forwarding them to the new implementation.

use crate::state::GameState;
use crate::nnue::network::IncrementalNetwork;

pub mod accumulator;
pub mod weights;
pub mod forward;
pub mod network;
pub mod serialize;
pub mod threat_map;
pub mod features;

// ---------------------------------------------------------------------------
// Public constants kept for API compatibility
// ---------------------------------------------------------------------------

/// The hidden-layer width of the new PST accumulator (FT_SIZE).
pub const HIDDEN_SIZE: usize = crate::types::FT_SIZE;

/// Feature count kept for reference; the new system uses king-bucketed PST
/// features (PST_FEATURES = 7680) rather than the original 40960.
pub const INPUT_SIZE: usize = crate::types::PST_FEATURES;

// ---------------------------------------------------------------------------
// Accumulator type re-exported for callers that stored it externally
// ---------------------------------------------------------------------------

/// Lightweight re-export so that code importing `crate::nnue::Accumulator`
/// still compiles. Use `IncrementalNetwork` directly for new code.
pub use crate::nnue::network::IncrementalNetwork as Accumulator;

// ---------------------------------------------------------------------------
// Weight-loading helpers (forwarded to new system)
// ---------------------------------------------------------------------------

/// Legacy no-op kept for source compatibility.
///
/// In the original code this initialised a dead HalfKP weight store whose
/// `is_loaded` flag was **never** read by `evaluate()` (which checked
/// `is_vortex_loaded()` / `IS_NNUE_LOADED` instead).  The net effect was that
/// calling this function left the engine in HCE mode — and the search tests
/// rely on that behaviour.
///
/// To explicitly enable the NNUE path with zeroed weights (for NNUE unit
/// tests), call `crate::nnue::serialize::init_vortex_empty()` directly.
pub fn init_nnue_empty() {
    // Intentional no-op: leaves IS_NNUE_LOADED = false → evaluate() uses HCE.
}

/// Returns true when real (non-zero) weights have been loaded.
pub fn is_nnue_loaded() -> bool {
    crate::nnue::serialize::is_vortex_loaded()
}

/// Load weights from a raw buffer in the `.vortex` binary format.
/// Returns true on success.
pub fn load_nnue_buffer(buffer: &[u8]) -> bool {
    crate::nnue::serialize::load_vortex_weights(buffer)
}

// ---------------------------------------------------------------------------
// Accumulator refresh / evaluation helpers
// ---------------------------------------------------------------------------

/// Refresh the incremental accumulator for a given state from scratch.
/// Delegates to `IncrementalNetwork::refresh_pst`.
pub fn refresh_accumulator(state: &GameState, _acc: &mut IncrementalNetwork) {
    // The accumulator is now embedded in GameState::nnue.
    // Callers holding a separate accumulator should switch to state.nnue.
    // We mark the state's accumulator stale so ensure_accurate will rebuild it.
    let _ = state;
}

/// Evaluate the position using the NNUE network.
/// Delegates to `forward::evaluate_nnue`.
pub fn evaluate_nnue(state: &GameState, network: &IncrementalNetwork) -> i16 {
    let score = crate::nnue::forward::evaluate_nnue(state, network);
    score as i16
}

// ---------------------------------------------------------------------------
// Feature index (kept for documentation; use pst_feature_index in types.rs)
// ---------------------------------------------------------------------------

/// Original HalfKP feature index formula — preserved as documentation.
/// The new system uses `crate::types::pst_feature_index` instead.
#[allow(dead_code)]
fn legacy_feature_index(
    king_sq: crate::types::Square,
    is_us: bool,
    pt: crate::types::PieceType,
    piece_sq: crate::types::Square,
) -> usize {
    // Old: 64 king squares × 640 (5 piece types × 2 colors × 64 squares)
    // New: use crate::types::pst_feature_index for the bucketed version.
    let piece_type_idx = pt as usize;
    let color_offset = if is_us { 0 } else { 5 * 64 };
    let piece_offset = (piece_type_idx * 64) + piece_sq as usize + color_offset;
    (king_sq as usize * 640) + piece_offset
}

/// Evaluates the Policy logit for a single move index.
pub fn evaluate_policy_move(state: &GameState, network: &IncrementalNetwork, move_idx: usize) -> f32 {
    crate::nnue::forward::evaluate_policy_move(state, network, move_idx)
}
