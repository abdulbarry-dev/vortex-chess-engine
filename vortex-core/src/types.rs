

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Color {
    White,
    Black,
}

impl Color {
    pub fn opposite(&self) -> Color {
        match self {
            Color::White => Color::Black,
            Color::Black => Color::White,
        }
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum PieceType {
    Pawn,
    Knight,
    Bishop,
    Rook,
    Queen,
    King,
}

pub type Square = u8;

// ---------------------------------------------------------------------------
// NNUE Constants (must match the Python training script exactly)
// ---------------------------------------------------------------------------
pub const FT_SIZE: usize = 768;
pub const FT_HALF: usize = 384;
pub const FT_QUANT: i32 = 255;
pub const FT_SHIFT: u8 = 9;
pub const L2_SIZE: usize = 16;
pub const L3_SIZE: usize = 32;
pub const NUM_PHASE_BUCKETS: usize = 16;

/// 10 king-position buckets as defined in the architecture plan:
///   Buckets 0-7  → king on ranks 1-2, indexed by file (a=0 … h=7)
///   Bucket  8    → king on ranks 3-4 (slightly advanced)
///   Bucket  9    → king on ranks 5-8 (opponent territory)
///
/// Black perspective always uses `king_sq ^ 56` before bucketing,
/// which maps Black's back ranks 8-7 onto the same 0-7 file buckets.
pub const NUM_KING_BUCKETS: usize = 10;

/// PST_FEATURES = NUM_KING_BUCKETS × FT_SIZE = 10 × 768 = 7 680
pub const PST_FEATURES: usize = NUM_KING_BUCKETS * FT_SIZE;

/// Size of the Policy Head output (e.g. 1858 for Leela-style encoding)
pub const POLICY_SIZE: usize = 1858;

/// Threat feature count: ≈ max_attack_pairs × 6 victim types.
/// The ThreatMap validates this at runtime via `test_threat_features_vs_threat_map`.
pub const THREAT_FEATURES: usize = 72_000;

// ---------------------------------------------------------------------------
// King bucket (plan §1.1)
// ---------------------------------------------------------------------------

/// Map a king square (0-63, White-perspective) to one of 10 positional buckets.
///
/// Exact scheme from the architecture plan:
/// ```text
///   ranks 1-2  (sq/8 ∈ {0,1}) → bucket = file  (0..=7)   — 8 distinct buckets
///   ranks 3-4  (sq/8 ∈ {2,3}) → bucket = 8               — 1 bucket
///   ranks 5-8  (sq/8 ∈ {4..7})→ bucket = 9               — 1 bucket
/// ```
///
/// For the **Black perspective** the caller first flips: `king_sq ^ 56`.
/// This maps Black's back ranks (8,7 → flip → 1,2) into the same file buckets,
/// so the learned geometry is symmetric without doubling weight count.
#[inline(always)]
pub fn king_bucket(sq: Square) -> usize {
    let file = (sq % 8) as usize; // 0 (a-file) … 7 (h-file)
    let rank = (sq / 8) as usize; // 0 = rank 1, 7 = rank 8
    if rank <= 1 {
        file        // ranks 1-2 → 8 file buckets (0-7)
    } else if rank <= 3 {
        8           // ranks 3-4 → bucket 8
    } else {
        9           // ranks 5-8 → bucket 9
    }
}

// ---------------------------------------------------------------------------
// PST feature index (plan §1.2)
// ---------------------------------------------------------------------------

/// Compute the flat PST feature index for one piece from one perspective.
///
/// Formula from plan §1.2:
/// ```text
///   index = bucket × FT_SIZE + FT_HALF × (1 - is_friendly) + piece_type × 64 + piece_sq
///         = bucket × 768     + 384     × color_side         + pt × 64          + sq
/// ```
///
/// Arguments (all already in the caller's perspective coordinate system):
/// - `king_sq`    — king square for this perspective (flipped by caller for Black).
/// - `is_friendly`— true if the piece belongs to the same side as the perspective.
/// - `pt`         — piece type (Pawn=0 … King=5).
/// - `piece_sq`   — piece square (flipped by caller for Black, i.e. `sq ^ 56`).
///
/// The returned index is guaranteed < PST_FEATURES when arguments are valid.
#[inline(always)]
pub fn pst_feature_index(king_sq: Square, is_friendly: bool, pt: PieceType, piece_sq: Square) -> usize {
    let bucket    = king_bucket(king_sq);
    let color_idx = if is_friendly { 0usize } else { 1usize }; // friendly=0, enemy=1
    let pt_idx    = pt as usize;        // Pawn=0 … King=5
    let sq_idx    = piece_sq as usize;  // already flipped by caller
    // bucket*768 + color_side*384 + pt*64 + sq
    bucket * FT_SIZE + color_idx * FT_HALF + pt_idx * 64 + sq_idx
}
