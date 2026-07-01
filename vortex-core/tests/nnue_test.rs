/// Tests specifically for the NNUE accumulator and forward pass.

use vortex_core::magic::init_magics;
use vortex_core::attacks::init_step_attacks;
use vortex_core::zobrist::init_zobrist;
use vortex_core::nnue::serialize::{init_vortex_empty, is_vortex_loaded, save_vortex_weights, load_vortex_weights};
use vortex_core::nnue::network::IncrementalNetwork;
use vortex_core::nnue::threat_map::get_threat_map;
use vortex_core::nnue::forward::{game_phase, activate_ft};
use vortex_core::nnue::features::{get_pst_indices, get_threat_indices, encode_features, decode_features};
use vortex_core::types::{
    Color, PieceType, FT_SIZE, FT_HALF, PST_FEATURES, THREAT_FEATURES,
    NUM_KING_BUCKETS, king_bucket, pst_feature_index,
};
use vortex_core::state::GameState;

fn init_all() {
    init_magics();
    init_step_attacks();
    init_zobrist();
}

fn startpos_state() -> GameState {
    let mut state = GameState::new();
    use vortex_core::types::PieceType::*;
    state.board.add_piece(Color::White, Rook,   0);
    state.board.add_piece(Color::White, Knight, 1);
    state.board.add_piece(Color::White, Bishop, 2);
    state.board.add_piece(Color::White, Queen,  3);
    state.board.add_piece(Color::White, King,   4);
    state.board.add_piece(Color::White, Bishop, 5);
    state.board.add_piece(Color::White, Knight, 6);
    state.board.add_piece(Color::White, Rook,   7);
    for i in 8..16 { state.board.add_piece(Color::White, Pawn, i); }
    state.board.add_piece(Color::Black, Rook,   56);
    state.board.add_piece(Color::Black, Knight, 57);
    state.board.add_piece(Color::Black, Bishop, 58);
    state.board.add_piece(Color::Black, Queen,  59);
    state.board.add_piece(Color::Black, King,   60);
    state.board.add_piece(Color::Black, Bishop, 61);
    state.board.add_piece(Color::Black, Knight, 62);
    state.board.add_piece(Color::Black, Rook,   63);
    for i in 48..56 { state.board.add_piece(Color::Black, Pawn, i); }
    state.recompute_hash();
    state
}

// ---------------------------------------------------------------------------
// 1. Constant sanity checks
// ---------------------------------------------------------------------------

#[test]
fn test_pst_features_constant() {
    assert_eq!(PST_FEATURES, NUM_KING_BUCKETS * FT_SIZE,
        "PST_FEATURES must equal NUM_KING_BUCKETS × FT_SIZE");
}

#[test]
fn test_ft_half_constant() {
    assert_eq!(FT_HALF, FT_SIZE / 2, "FT_HALF must be FT_SIZE / 2");
}

#[test]
fn test_threat_features_vs_threat_map() {
    init_all();
    let map = get_threat_map();
    let used = (map.max_id as usize) * 6;
    assert!(used <= THREAT_FEATURES,
        "ThreatMap needs {} features but THREAT_FEATURES = {}", used, THREAT_FEATURES);
}

// ---------------------------------------------------------------------------
// 2. King bucket — plan §1.1 exact scheme
// ---------------------------------------------------------------------------

/// Ranks 1-2 (sq/8 ∈ {0,1}): bucket = file  →  8 distinct buckets
/// Ranks 3-4 (sq/8 ∈ {2,3}): bucket = 8
/// Ranks 5-8 (sq/8 ≥ 4):     bucket = 9
#[test]
fn test_king_bucket_range() {
    for sq in 0u8..64 {
        let b = king_bucket(sq);
        assert!(b < NUM_KING_BUCKETS, "king_bucket({}) = {} out of range", sq, b);
    }
}

#[test]
fn test_king_bucket_rank1_2_equals_file() {
    // Ranks 1-2: all 16 squares should map to their file index (0-7).
    for sq in 0u8..16 {
        let expected = (sq % 8) as usize;
        assert_eq!(king_bucket(sq), expected,
            "sq={} (rank {}, file {}) should give bucket={}, got {}",
            sq, sq/8+1, sq%8, expected, king_bucket(sq));
    }
}

#[test]
fn test_king_bucket_rank3_4_is_8() {
    // Ranks 3-4: squares 16-31 → bucket 8.
    for sq in 16u8..32 {
        assert_eq!(king_bucket(sq), 8,
            "sq={} (rank {}) should give bucket=8, got {}",
            sq, sq/8+1, king_bucket(sq));
    }
}

#[test]
fn test_king_bucket_rank5_8_is_9() {
    // Ranks 5-8: squares 32-63 → bucket 9.
    for sq in 32u8..64 {
        assert_eq!(king_bucket(sq), 9,
            "sq={} (rank {}) should give bucket=9, got {}",
            sq, sq/8+1, king_bucket(sq));
    }
}

#[test]
fn test_king_bucket_file_distinguishable_on_back_ranks() {
    // e.g. g1 (sq=6) and b1 (sq=1) are on different files → different buckets.
    assert_ne!(king_bucket(6), king_bucket(1), "g1 and b1 must be different buckets");
    // a1 and h1 are different files → different buckets (no mirroring in the plan).
    assert_ne!(king_bucket(0), king_bucket(7), "a1 and h1 must be different buckets");
}

#[test]
fn test_king_bucket_black_perspective_flip() {
    // Black king on e8 (sq=60), flipped → sq=60^56=4 (e1 equivalent).
    // For Black perspective the caller passes 60^56 = 4.
    let flipped = 60u8 ^ 56;      // = 4
    assert_eq!(king_bucket(flipped), 4, "Black king e8 → flipped sq=4 → bucket=4 (e-file)");

    // Black king on a8 (sq=56) → flipped=0 → bucket=0 (a-file back rank).
    assert_eq!(king_bucket(56u8 ^ 56), 0);
    // Black king on h8 (sq=63) → flipped=7 → bucket=7 (h-file back rank).
    assert_eq!(king_bucket(63u8 ^ 56), 7);
}

// ---------------------------------------------------------------------------
// 3. PST feature index
// ---------------------------------------------------------------------------

#[test]
fn test_pst_feature_index_in_bounds() {
    for king_sq in 0u8..64 {
        for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop,
                   PieceType::Rook, PieceType::Queen, PieceType::King] {
            for piece_sq in 0u8..64 {
                for &friendly in &[true, false] {
                    let idx = pst_feature_index(king_sq, friendly, pt, piece_sq);
                    assert!(idx < PST_FEATURES,
                        "pst_feature_index(king={}, friendly={}, pt={:?}, piece={}) = {} >= {}",
                        king_sq, friendly, pt, piece_sq, idx, PST_FEATURES);
                }
            }
        }
    }
}

#[test]
fn test_pst_feature_index_unique_within_bucket() {
    // For a fixed king square, all (friendly, pt, piece_sq) combinations
    // must produce distinct indices.
    let king_sq = 4u8; // e1
    let mut seen = std::collections::HashSet::new();
    for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop,
               PieceType::Rook, PieceType::Queen, PieceType::King] {
        for piece_sq in 0u8..64 {
            for &friendly in &[true, false] {
                let idx = pst_feature_index(king_sq, friendly, pt, piece_sq);
                assert!(seen.insert(idx), "Duplicate PST feature index {}", idx);
            }
        }
    }
}

#[test]
fn test_pst_feature_index_formula() {
    // Verify the plan formula: bucket*FT_SIZE + FT_HALF*color_side + pt*64 + sq
    // For king on e1 (sq=4), friendly pawn on d2 (sq=11).
    let king_sq = 4u8;
    let bucket  = king_bucket(king_sq); // rank=0, file=4 → bucket=4
    let pt      = PieceType::Pawn;      // pt_idx=0
    let piece_sq = 11u8;                // d2
    let expected = bucket * FT_SIZE + 0 * FT_HALF + 0 * 64 + 11;
    assert_eq!(pst_feature_index(king_sq, true, pt, piece_sq), expected);
    // Enemy version: color_side=1 → add FT_HALF
    let expected_enemy = bucket * FT_SIZE + 1 * FT_HALF + 0 * 64 + 11;
    assert_eq!(pst_feature_index(king_sq, false, pt, piece_sq), expected_enemy);
}

// ---------------------------------------------------------------------------
// 4. Accumulator refresh with zero weights
// ---------------------------------------------------------------------------

#[test]
fn test_refresh_pst_zero_weights() {
    init_all();
    init_vortex_empty();
    assert!(is_vortex_loaded());

    let state = startpos_state();
    let mut net = IncrementalNetwork::new();
    net.refresh_pst(&state.board);

    let pst = net.current_pst_ref();
    assert!(pst.accurate[0], "White perspective should be accurate after refresh");
    assert!(pst.accurate[1], "Black perspective should be accurate after refresh");
    // Zero weights + zero biases → zero accumulator.
    assert!(pst.values[0].iter().all(|&v| v == 0), "Zero weights → zero accumulator (white)");
    assert!(pst.values[1].iter().all(|&v| v == 0), "Zero weights → zero accumulator (black)");
}

// ---------------------------------------------------------------------------
// 5. ensure_accurate marks stale accumulator accurate
// ---------------------------------------------------------------------------

#[test]
fn test_ensure_accurate_marks_accurate() {
    init_all();
    init_vortex_empty();

    let state = startpos_state();
    let mut net = IncrementalNetwork::new();
    assert!(!net.current_pst_ref().accurate[0]);
    net.ensure_accurate(&state.board);
    assert!(net.current_pst_ref().accurate[0], "ensure_accurate must set accurate flag");
}

// ---------------------------------------------------------------------------
// 6. activate_ft output
// ---------------------------------------------------------------------------

#[test]
fn test_activate_ft_zero_inputs_give_zero() {
    let pst    = [0i16; FT_SIZE];
    let threat = [0i16; FT_SIZE];
    let embed  = [0.0f32; FT_SIZE];
    let out    = activate_ft(&pst, &threat, &embed);
    assert!(out.iter().all(|&v| v == 0), "Zero inputs must produce zero activations");
}

#[test]
fn test_activate_ft_output_length() {
    let pst    = [0i16; FT_SIZE];
    let threat = [0i16; FT_SIZE];
    let embed  = [0.0f32; FT_SIZE];
    let out    = activate_ft(&pst, &threat, &embed);
    assert_eq!(out.len(), FT_SIZE, "activate_ft output length must equal FT_SIZE");

    let pst_max = [255i16; FT_SIZE];
    let out2    = activate_ft(&pst_max, &threat, &embed);
    assert_eq!(out2.len(), FT_SIZE);
}

// ---------------------------------------------------------------------------
// 7. Game phase bucketing
// ---------------------------------------------------------------------------

#[test]
fn test_game_phase_startpos_is_opening() {
    init_all();
    let state = startpos_state();
    let (phase_f, bucket) = game_phase(&state);
    assert!(phase_f > 0.9, "Starting position should be near opening phase");
    assert!(bucket > 12, "Starting position bucket should be in the upper range");
}

#[test]
fn test_game_phase_empty_is_endgame() {
    init_all();
    let mut state = GameState::new();
    state.board.add_piece(Color::White, PieceType::King, 4);
    state.board.add_piece(Color::Black, PieceType::King, 60);
    let (phase_f, bucket) = game_phase(&state);
    assert!(phase_f < 0.05, "K vs K should be endgame phase");
    assert_eq!(bucket, 0, "K vs K should be in bucket 0");
}

// ---------------------------------------------------------------------------
// 8. Push/pop preserves accumulator
// ---------------------------------------------------------------------------

#[test]
fn test_push_pop_preserves_state() {
    init_all();
    init_vortex_empty();

    let state = startpos_state();
    let mut net = IncrementalNetwork::new();
    net.ensure_accurate(&state.board);

    let values_before = net.current_pst_ref().values;
    net.push();
    net.current_pst().values[0][0] = 42;
    net.pop();
    assert_eq!(net.current_pst_ref().values[0][0], values_before[0][0],
        "Pop must restore the pre-push accumulator");
}

// ---------------------------------------------------------------------------
// 9. .vortex format: round-trip test
// ---------------------------------------------------------------------------

#[test]
fn test_vortex_round_trip() {
    init_all();
    init_vortex_empty();

    // Save the zero-weight file.
    let saved = save_vortex_weights().expect("save_vortex_weights should succeed when loaded");

    // Unload and reload from bytes.
    {
        let mut w = vortex_core::nnue::weights::WEIGHTS.lock()
            .unwrap_or_else(|e| e.into_inner());
        w.is_loaded = false;
        vortex_core::nnue::weights::IS_NNUE_LOADED
            .store(false, std::sync::atomic::Ordering::Relaxed);
    }

    let ok = load_vortex_weights(&saved);
    assert!(ok, "load_vortex_weights should succeed on a just-saved buffer");
    assert!(is_vortex_loaded(), "IS_NNUE_LOADED should be true after reload");
}

#[test]
fn test_vortex_header_magic_check() {
    // Wrong magic → rejected.
    let bad: Vec<u8> = b"XXXX".iter().chain(&[0u8; 100]).cloned().collect();
    assert!(!load_vortex_weights(&bad), "Wrong magic must be rejected");
}

#[test]
fn test_vortex_header_version_check() {
    init_all();
    init_vortex_empty();
    let mut saved = save_vortex_weights().unwrap();
    // Corrupt the version byte (offset 4).
    saved[4] = 99;
    assert!(!load_vortex_weights(&saved), "Wrong version must be rejected");
}

#[test]
fn test_vortex_header_ft_size_check() {
    init_all();
    init_vortex_empty();
    let mut saved = save_vortex_weights().unwrap();
    // Corrupt FT_SIZE (bytes 5-6, LE u16) → set to 256.
    let bad_ft = 256u16.to_le_bytes();
    saved[5] = bad_ft[0];
    saved[6] = bad_ft[1];
    assert!(!load_vortex_weights(&saved), "Wrong FT_SIZE must be rejected");
}

// ---------------------------------------------------------------------------
// 10. Feature index extractor (B3 — Python training bridge)
// ---------------------------------------------------------------------------

#[test]
fn test_pst_indices_count_equals_piece_count() {
    init_all();
    let state = startpos_state();
    let (w, b) = get_pst_indices(&state.board);
    // Starting position: 32 pieces total, each appears once per perspective.
    assert_eq!(w.len(), 32, "White PST indices: one per piece");
    assert_eq!(b.len(), 32, "Black PST indices: one per piece");
}

#[test]
fn test_pst_indices_in_bounds() {
    init_all();
    let state = startpos_state();
    let (w, b) = get_pst_indices(&state.board);
    for &idx in w.iter().chain(b.iter()) {
        assert!((idx as usize) < PST_FEATURES,
            "PST index {} out of bounds (PST_FEATURES={})", idx, PST_FEATURES);
    }
}

#[test]
fn test_threat_indices_in_bounds() {
    init_all();
    let state = startpos_state();
    let (w, b) = get_threat_indices(&state.board);
    for &idx in w.iter().chain(b.iter()) {
        assert!((idx as usize) < THREAT_FEATURES,
            "Threat index {} out of bounds (THREAT_FEATURES={})", idx, THREAT_FEATURES);
    }
}

#[test]
fn test_pst_indices_symmetric_startpos() {
    // At the starting position the board is symmetric, so the set of PST
    // indices for White's perspective from Black's side should mirror White's.
    // Both perspectives should have the same *number* of indices.
    init_all();
    let state = startpos_state();
    let (w, b) = get_pst_indices(&state.board);
    assert_eq!(w.len(), b.len());
}

#[test]
fn test_encode_decode_features_round_trip() {
    init_all();
    let state = startpos_state();
    let encoded = encode_features(&state.board);
    assert!(!encoded.is_empty(), "encode_features must produce non-empty output");

    let decoded = decode_features(&encoded)
        .expect("decode_features must succeed on freshly encoded data");

    let (pst_w, pst_b) = get_pst_indices(&state.board);
    let (thr_w, thr_b) = get_threat_indices(&state.board);

    assert_eq!(decoded.0, pst_w, "PST white round-trip mismatch");
    assert_eq!(decoded.1, pst_b, "PST black round-trip mismatch");
    assert_eq!(decoded.2, thr_w, "Threat white round-trip mismatch");
    assert_eq!(decoded.3, thr_b, "Threat black round-trip mismatch");
}

#[test]
fn test_pst_indices_change_after_move() {
    // Removing all pieces of one type should reduce the PST index count.
    init_all();
    let mut state = startpos_state();
    // Remove all Black pawns from the board directly.
    for sq in 48u8..56 {
        state.board.remove_piece(Color::Black, PieceType::Pawn, sq);
    }
    let (w, b) = get_pst_indices(&state.board);
    // 32 pieces - 8 Black pawns = 24.
    assert_eq!(w.len(), 24);
    assert_eq!(b.len(), 24);
}
