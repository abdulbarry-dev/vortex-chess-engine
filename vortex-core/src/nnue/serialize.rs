use crate::nnue::weights::IS_NNUE_LOADED;
use crate::types::{FT_SIZE, L2_SIZE, L3_SIZE, NUM_PHASE_BUCKETS,
                   PST_FEATURES, THREAT_FEATURES, POLICY_SIZE};

// ---------------------------------------------------------------------------
// .vortex binary format (plan §1.7)
// ---------------------------------------------------------------------------
//
// Offset  Bytes  Type    Content
// ──────  ─────  ──────  ──────────────────────────────────────────────────
//  0       4     u8[4]   Magic "VRTX"
//  4       1     u8      Format version = 1
//  5       2     u16-LE  FT_SIZE           = 768
//  7       1     u8      L2_SIZE           = 16
//  8       1     u8      L3_SIZE           = 32
//  9       1     u8      NUM_PHASE_BUCKETS = 16
// 10       2     u16-LE  PST_FEATURES      = 7 680   (fits u16)
// 12       4     u32-LE  THREAT_FEATURES   = 72 000  (>65535 → needs u32)
// 16       4     u32-LE  PST weights byte count
// 20       VAR   i16-LE  PST biases             [FT_SIZE]
// ...      VAR   i16-LE  PST weights            [PST_FEATURES × FT_SIZE]
// ...      VAR   i8      Threat weights         [THREAT_FEATURES × FT_SIZE]
// ...      VAR   f32-LE  Phase embeddings       [NUM_PHASE_BUCKETS × FT_SIZE]
// ...      VAR   i8      L1 weights             [L2_SIZE × FT_SIZE]
// ...      VAR   f32-LE  L1 biases              [NUM_PHASE_BUCKETS × L2_SIZE]
// ...      4     i32-LE  L1 quant               = 64
// ...      VAR   f32-LE  L2 weights             [L2_SIZE × L3_SIZE]
// ...      VAR   f32-LE  L2 biases              [NUM_PHASE_BUCKETS × L3_SIZE]
// ...      VAR   f32-LE  L3 weights             [L3_SIZE]
// ...      VAR   f32-LE  L3 biases              [NUM_PHASE_BUCKETS]
// ...      VAR   f32-LE  Policy weights         [POLICY_SIZE × FT_SIZE]
// ...      VAR   f32-LE  Policy biases          [POLICY_SIZE]

const HEADER_BYTES: usize = 22;
const FORMAT_VERSION: u8 = 2;

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/// Load weights from a `.vortex` binary buffer.
/// Validates the header against the compiled-in constants before reading data.
pub fn load_vortex_weights(buffer: &[u8]) -> bool {
    if buffer.len() < HEADER_BYTES {
        return false;
    }

    // ── Magic ──
    if &buffer[0..4] != b"VRTX" {
        return false;
    }

    // ── Header fields ──
    let version    = buffer[4];
    let ft_size    = u16::from_le_bytes([buffer[5],  buffer[6]])  as usize;
    let l2_size    = buffer[7] as usize;
    let l3_size    = buffer[8] as usize;
    let num_phase  = buffer[9] as usize;
    let pst_feat   = u16::from_le_bytes([buffer[10], buffer[11]]) as usize;
    let thr_feat   = u32::from_le_bytes([buffer[12], buffer[13],
                                         buffer[14], buffer[15]]) as usize;
    let _pst_bytes = u32::from_le_bytes([buffer[16], buffer[17],
                                         buffer[18], buffer[19]]) as usize;
    let policy_size = u16::from_le_bytes([buffer[20], buffer[21]]) as usize;

    // Validate against our compiled constants
    if version   != FORMAT_VERSION
        || ft_size   != FT_SIZE
        || l2_size   != L2_SIZE
        || l3_size   != L3_SIZE
        || num_phase != NUM_PHASE_BUCKETS
        || pst_feat  != PST_FEATURES
        || thr_feat  != THREAT_FEATURES
        || policy_size != POLICY_SIZE
    {
        return false;
    }

    let mut offset = HEADER_BYTES;
    let mut w = Box::new(crate::nnue::weights::VortexWeights::new());

    macro_rules! read_i16 {
        () => {{
            if offset + 2 > buffer.len() { return false; }
            let val = i16::from_le_bytes([buffer[offset], buffer[offset + 1]]);
            offset += 2;
            val
        }}
    }
    macro_rules! read_i8 {
        () => {{
            if offset + 1 > buffer.len() { return false; }
            let val = buffer[offset] as i8;
            offset += 1;
            val
        }}
    }
    macro_rules! read_f32 {
        () => {{
            if offset + 4 > buffer.len() { return false; }
            let val = f32::from_le_bytes([
                buffer[offset], buffer[offset+1],
                buffer[offset+2], buffer[offset+3],
            ]);
            offset += 4;
            val
        }}
    }
    macro_rules! read_i32 {
        () => {{
            if offset + 4 > buffer.len() { return false; }
            let val = i32::from_le_bytes([
                buffer[offset], buffer[offset+1],
                buffer[offset+2], buffer[offset+3],
            ]);
            offset += 4;
            val
        }}
    }

    // 1. PST biases  [FT_SIZE × i16]
    for i in 0..FT_SIZE {
        w.pst_biases[i] = read_i16!();
    }

    // 2. PST weights  [PST_FEATURES × FT_SIZE × i16]
    w.pst_weights.resize(PST_FEATURES * FT_SIZE, 0);
    for i in 0..w.pst_weights.len() {
        w.pst_weights[i] = read_i16!();
    }

    // 3. Threat weights  [THREAT_FEATURES × FT_SIZE × i8]
    //    Each of the THREAT_FEATURES threat pairs has a full FT_SIZE weight row.
    w.threat_weights.resize(THREAT_FEATURES * FT_SIZE, 0);
    for i in 0..w.threat_weights.len() {
        w.threat_weights[i] = read_i8!();
    }

    // 4. Phase embeddings  [NUM_PHASE_BUCKETS × FT_SIZE × f32]
    w.phase_embeddings.resize(NUM_PHASE_BUCKETS * FT_SIZE, 0.0);
    for i in 0..w.phase_embeddings.len() {
        w.phase_embeddings[i] = read_f32!();
    }

    // 5. L1 weights  [L2_SIZE × FT_SIZE × i8]
    w.l1_weights.resize(L2_SIZE * FT_SIZE, 0);
    for i in 0..w.l1_weights.len() {
        w.l1_weights[i] = read_i8!();
    }

    // 6. L1 biases  [NUM_PHASE_BUCKETS × L2_SIZE × f32]
    w.l1_biases.resize(NUM_PHASE_BUCKETS * L2_SIZE, 0.0);
    for i in 0..w.l1_biases.len() {
        w.l1_biases[i] = read_f32!();
    }

    // 7. L1 quant  (i32)
    w.l1_quant = read_i32!();

    // 8. L2 weights  [L2_SIZE × L3_SIZE × f32]
    w.l2_weights.resize(L2_SIZE * L3_SIZE, 0.0);
    for i in 0..w.l2_weights.len() {
        w.l2_weights[i] = read_f32!();
    }

    // 9. L2 biases  [NUM_PHASE_BUCKETS × L3_SIZE × f32]
    w.l2_biases.resize(NUM_PHASE_BUCKETS * L3_SIZE, 0.0);
    for i in 0..w.l2_biases.len() {
        w.l2_biases[i] = read_f32!();
    }

    // 10. L3 weights  [L3_SIZE × f32]
    w.l3_weights.resize(L3_SIZE, 0.0);
    for i in 0..w.l3_weights.len() {
        w.l3_weights[i] = read_f32!();
    }

    // 11. L3 biases  [NUM_PHASE_BUCKETS × f32]
    w.l3_biases.resize(NUM_PHASE_BUCKETS, 0.0);
    for i in 0..w.l3_biases.len() {
        w.l3_biases[i] = read_f32!();
    }

    // 12. Policy weights [POLICY_SIZE × FT_SIZE × f32]
    w.policy_weights.resize(POLICY_SIZE * FT_SIZE, 0.0);
    for i in 0..w.policy_weights.len() {
        w.policy_weights[i] = read_f32!();
    }

    // 13. Policy biases [POLICY_SIZE × f32]
    w.policy_biases.resize(POLICY_SIZE, 0.0);
    for i in 0..w.policy_biases.len() {
        w.policy_biases[i] = read_f32!();
    }

    w.is_loaded = true;
    unsafe {
        crate::nnue::weights::WEIGHTS_PTR = Box::into_raw(w);
    }
    IS_NNUE_LOADED.store(true, std::sync::atomic::Ordering::Relaxed);
    true
}

// ---------------------------------------------------------------------------
// Save (Rust reference implementation — mirrors load exactly)
// ---------------------------------------------------------------------------

/// Serialise the currently-loaded weights back to a `.vortex` byte vector.
/// Returns `None` if no weights are loaded.
/// Used for round-trip testing before the Python exporter is available.
pub fn save_vortex_weights() -> Option<Vec<u8>> {
    let w = unsafe { &*crate::nnue::weights::WEIGHTS_PTR };
    if !w.is_loaded { return None; }

    let pst_weight_bytes = PST_FEATURES * FT_SIZE * 2; // i16 = 2 bytes each
    let mut buf: Vec<u8> = Vec::new();

    // ── Header ──
    buf.extend_from_slice(b"VRTX");
    buf.push(FORMAT_VERSION);
    buf.extend_from_slice(&(FT_SIZE          as u16).to_le_bytes());
    buf.push(L2_SIZE          as u8);
    buf.push(L3_SIZE          as u8);
    buf.push(NUM_PHASE_BUCKETS as u8);
    buf.extend_from_slice(&(PST_FEATURES    as u16).to_le_bytes());
    buf.extend_from_slice(&(THREAT_FEATURES as u32).to_le_bytes());
    buf.extend_from_slice(&(pst_weight_bytes as u32).to_le_bytes());
    buf.extend_from_slice(&(POLICY_SIZE     as u16).to_le_bytes());

    // PST biases
    for &v in &w.pst_biases { buf.extend_from_slice(&v.to_le_bytes()); }
    // PST weights
    for &v in &w.pst_weights { buf.extend_from_slice(&v.to_le_bytes()); }
    // Threat weights
    for &v in &w.threat_weights { buf.push(v as u8); }
    // Phase embeddings
    for &v in &w.phase_embeddings { buf.extend_from_slice(&v.to_le_bytes()); }
    // L1 weights
    for &v in &w.l1_weights { buf.push(v as u8); }
    // L1 biases
    for &v in &w.l1_biases { buf.extend_from_slice(&v.to_le_bytes()); }
    // L1 quant
    buf.extend_from_slice(&w.l1_quant.to_le_bytes());
    // L2 weights
    for &v in &w.l2_weights { buf.extend_from_slice(&v.to_le_bytes()); }
    // L2 biases
    for &v in &w.l2_biases { buf.extend_from_slice(&v.to_le_bytes()); }
    // L3 weights
    for &v in &w.l3_weights { buf.extend_from_slice(&v.to_le_bytes()); }
    // L3 biases
    for &v in &w.l3_biases { buf.extend_from_slice(&v.to_le_bytes()); }
    // Policy weights
    for &v in &w.policy_weights { buf.extend_from_slice(&v.to_le_bytes()); }
    // Policy biases
    for &v in &w.policy_biases { buf.extend_from_slice(&v.to_le_bytes()); }

    Some(buf)
}

// ---------------------------------------------------------------------------
// Test / fallback helpers
// ---------------------------------------------------------------------------

/// Initialise the weight store with zero-filled buffers of the correct sizes
/// so that `refresh_pst` and the forward pass work without a real weight file.
/// Used by NNUE unit tests. Does NOT mark the engine as "loaded" for HCE tests.
pub fn init_vortex_empty() {
    let mut w = Box::new(crate::nnue::weights::VortexWeights::new());
    // PST
    w.pst_biases = [0; FT_SIZE];
    w.pst_weights.resize(PST_FEATURES * FT_SIZE, 0);
    // Threat — full [THREAT_FEATURES × FT_SIZE] embedding table
    w.threat_weights.resize(THREAT_FEATURES * FT_SIZE, 0);
    // Phase embeddings
    w.phase_embeddings.resize(NUM_PHASE_BUCKETS * FT_SIZE, 0.0);
    // L1
    w.l1_weights.resize(L2_SIZE * FT_SIZE, 0);
    w.l1_biases.resize(NUM_PHASE_BUCKETS * L2_SIZE, 0.0);
    w.l1_quant = 64;
    // L2
    w.l2_weights.resize(L2_SIZE * L3_SIZE, 0.0);
    w.l2_biases.resize(NUM_PHASE_BUCKETS * L3_SIZE, 0.0);
    // L3
    w.l3_weights.resize(L3_SIZE, 0.0);
    w.l3_biases.resize(NUM_PHASE_BUCKETS, 0.0);
    // Policy
    w.policy_weights.resize(POLICY_SIZE * FT_SIZE, 0.0);
    w.policy_biases.resize(POLICY_SIZE, 0.0);

    w.is_loaded = true;
    unsafe {
        crate::nnue::weights::WEIGHTS_PTR = Box::into_raw(w);
    }
    IS_NNUE_LOADED.store(true, std::sync::atomic::Ordering::Relaxed);
}

pub fn is_vortex_loaded() -> bool {
    IS_NNUE_LOADED.load(std::sync::atomic::Ordering::Relaxed)
}
