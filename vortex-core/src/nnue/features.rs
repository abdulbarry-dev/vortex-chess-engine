/// Feature index extractor — the Rust↔Python training bridge.
///
/// For each board position this module produces the **list of active feature
/// indices** that Python's `torch.nn.EmbeddingBag` (mode='sum') expects as
/// input.  The accumulator forward pass (`refresh_pst`, `apply_threat_deltas`)
/// sums the weight rows at these indices; `EmbeddingBag` replicates that sum
/// during training, guaranteeing numerical equivalence.
///
/// # Coordinate conventions (must match training script exactly)
///
/// PST indices
/// -----------
/// For White perspective (persp=0):
///   - king_sq: White king square (0-63, no flip)
///   - piece_sq: piece square (0-63, no flip)
///   - is_friendly: piece color == White
///
/// For Black perspective (persp=1):
///   - king_sq: Black king square ^ 56  (vertical flip)
///   - piece_sq: piece square ^ 56
///   - is_friendly: piece color == Black
///
/// Threat indices
/// --------------
/// Derived from ThreatMap::get_index(attacker, from_sq, victim, to_sq).
/// For White perspective: raw squares.
/// For Black perspective: both from_sq and to_sq are ^ 56 flipped.
/// King→King attacks are excluded (no entry in ThreatMap).

use crate::board::Board;
use crate::types::{Color, PieceType, Square, PST_FEATURES, THREAT_FEATURES, pst_feature_index};
use crate::nnue::threat_map::get_threat_map;

/// All active PST feature indices for a position, for both perspectives.
///
/// Returns `(white_indices, black_indices)` where each is a `Vec<u32>` of
/// indices in `[0, PST_FEATURES)`.  Pass each to `EmbeddingBag(indices)`.
///
/// Each index corresponds to one piece on the board.  With 32 pieces maximum,
/// each Vec has at most 32 entries.
pub fn get_pst_indices(board: &Board) -> (Vec<u32>, Vec<u32>) {
    let w_king_sq = board.get_pieces(Color::White, PieceType::King).trailing_zeros() as Square;
    let b_king_sq = board.get_pieces(Color::Black, PieceType::King).trailing_zeros() as Square;
    let b_king_flip = b_king_sq ^ 56;

    let mut white_idx: Vec<u32> = Vec::with_capacity(32);
    let mut black_idx: Vec<u32> = Vec::with_capacity(32);

    for color in [Color::White, Color::Black] {
        for pt in [
            PieceType::Pawn,
            PieceType::Knight,
            PieceType::Bishop,
            PieceType::Rook,
            PieceType::Queen,
            PieceType::King,
        ] {
            let mut bb = board.get_pieces(color, pt);
            while bb != 0 {
                let sq = bb.trailing_zeros() as Square;
                bb &= bb - 1;

                // White perspective — raw squares, friendly = (color == White)
                let w = pst_feature_index(w_king_sq, color == Color::White, pt, sq);
                debug_assert!(w < PST_FEATURES, "PST index {w} out of range");
                white_idx.push(w as u32);

                // Black perspective — flip king and piece squares
                let b = pst_feature_index(b_king_flip, color == Color::Black, pt, sq ^ 56);
                debug_assert!(b < PST_FEATURES, "PST index {b} out of range");
                black_idx.push(b as u32);
            }
        }
    }

    (white_idx, black_idx)
}

/// All active threat feature indices for a position, for both perspectives.
///
/// Returns `(white_indices, black_indices)` where each is a `Vec<u32>` of
/// indices in `[0, THREAT_FEATURES)`.  Pass each to `EmbeddingBag(indices)`.
///
/// An index is emitted for every (attacker, from_sq) → (victim, to_sq) pair
/// where the attacker has an attack ray that reaches to_sq (per ThreatMap).
/// King→King pairs are omitted (not in the map).
pub fn get_threat_indices(board: &Board) -> (Vec<u32>, Vec<u32>) {
    let map = get_threat_map();
    let mut white_idx: Vec<u32> = Vec::with_capacity(128);
    let mut black_idx: Vec<u32> = Vec::with_capacity(128);

    for atk_color in [Color::White, Color::Black] {
        for atk_pt in [
            PieceType::Pawn,
            PieceType::Knight,
            PieceType::Bishop,
            PieceType::Rook,
            PieceType::Queen,
            PieceType::King,
        ] {
            let mut atk_bb = board.get_pieces(atk_color, atk_pt);
            while atk_bb != 0 {
                let from_sq = atk_bb.trailing_zeros() as Square;
                atk_bb &= atk_bb - 1;

                // Find all enemy squares this attacker reaches via ThreatMap.
                let vic_color = atk_color.opposite();
                for vic_pt in [
                    PieceType::Pawn,
                    PieceType::Knight,
                    PieceType::Bishop,
                    PieceType::Rook,
                    PieceType::Queen,
                    PieceType::King,
                ] {
                    let mut vic_bb = board.get_pieces(vic_color, vic_pt);
                    while vic_bb != 0 {
                        let to_sq = vic_bb.trailing_zeros() as Square;
                        vic_bb &= vic_bb - 1;

                        // White perspective — raw squares
                        if let Some(feat) = map.get_index(atk_pt, from_sq, vic_pt, to_sq) {
                            debug_assert!(feat < THREAT_FEATURES);
                            white_idx.push(feat as u32);
                        }

                        // Black perspective — flip both squares
                        if let Some(feat) = map.get_index(atk_pt, from_sq ^ 56, vic_pt, to_sq ^ 56) {
                            debug_assert!(feat < THREAT_FEATURES);
                            black_idx.push(feat as u32);
                        }
                    }
                }
            }
        }
    }

    (white_idx, black_idx)
}

/// Serialise a position's feature indices to a compact binary record suitable
/// for streaming to Python over stdin/file.
///
/// # Binary layout (little-endian throughout)
///
/// ```text
/// Field                Size
/// ─────────────────── ─────
/// pst_w_count  u16     2
/// pst_b_count  u16     2
/// thr_w_count  u16     2
/// thr_b_count  u16     2
/// pst_w_data   u32[]   4 × pst_w_count
/// pst_b_data   u32[]   4 × pst_b_count
/// thr_w_data   u32[]   4 × thr_w_count
/// thr_b_data   u32[]   4 × thr_b_count
/// ```
///
/// Total for a typical middlegame position (30 pieces, ~80 threats per side):
///   8 + 4×30 + 4×30 + 4×80 + 4×80 = 8 + 240 + 240 + 320 + 320 ≈ 1.1 KB
pub fn encode_features(board: &Board) -> Vec<u8> {
    let (pst_w, pst_b) = get_pst_indices(board);
    let (thr_w, thr_b) = get_threat_indices(board);

    let capacity = 8
        + pst_w.len() * 4
        + pst_b.len() * 4
        + thr_w.len() * 4
        + thr_b.len() * 4;
    let mut buf = Vec::with_capacity(capacity);

    // Header counts
    buf.extend_from_slice(&(pst_w.len() as u16).to_le_bytes());
    buf.extend_from_slice(&(pst_b.len() as u16).to_le_bytes());
    buf.extend_from_slice(&(thr_w.len() as u16).to_le_bytes());
    buf.extend_from_slice(&(thr_b.len() as u16).to_le_bytes());

    // Index arrays
    for &i in &pst_w { buf.extend_from_slice(&i.to_le_bytes()); }
    for &i in &pst_b { buf.extend_from_slice(&i.to_le_bytes()); }
    for &i in &thr_w { buf.extend_from_slice(&i.to_le_bytes()); }
    for &i in &thr_b { buf.extend_from_slice(&i.to_le_bytes()); }

    buf
}

/// Decode a feature record produced by `encode_features`.
/// Returns `(pst_white, pst_black, threat_white, threat_black)`.
pub fn decode_features(buf: &[u8]) -> Option<(Vec<u32>, Vec<u32>, Vec<u32>, Vec<u32>)> {
    if buf.len() < 8 { return None; }
    let pst_w_n = u16::from_le_bytes([buf[0], buf[1]]) as usize;
    let pst_b_n = u16::from_le_bytes([buf[2], buf[3]]) as usize;
    let thr_w_n = u16::from_le_bytes([buf[4], buf[5]]) as usize;
    let thr_b_n = u16::from_le_bytes([buf[6], buf[7]]) as usize;

    let total = pst_w_n + pst_b_n + thr_w_n + thr_b_n;
    if buf.len() < 8 + total * 4 { return None; }

    fn read_u32s(buf: &[u8], off: &mut usize, n: usize) -> Vec<u32> {
        (0..n).map(|_| {
            let v = u32::from_le_bytes([buf[*off], buf[*off+1], buf[*off+2], buf[*off+3]]);
            *off += 4;
            v
        }).collect()
    }

    let mut off = 8usize;
    let pst_w = read_u32s(buf, &mut off, pst_w_n);
    let pst_b = read_u32s(buf, &mut off, pst_b_n);
    let thr_w = read_u32s(buf, &mut off, thr_w_n);
    let thr_b = read_u32s(buf, &mut off, thr_b_n);

    Some((pst_w, pst_b, thr_w, thr_b))
}

