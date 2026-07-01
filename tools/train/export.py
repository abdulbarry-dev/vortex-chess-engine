"""
Vortex NNUE Export Script
==========================
Converts a trained VortexNNUE PyTorch model into the .vortex binary format
consumed by the Rust engine (serialize.rs::load_vortex_weights).

Usage:
    python export.py <checkpoint.pt> <output.vortex>

Quantisation scheme (must match Rust constants in types.rs / forward.rs):
    PST weights  : f32 → i16   scaled by FT_QUANT = 255
    Threat weights: f32 → i8   scaled by FT_QUANT = 255  (clamped to [-127,127])
    L1 weights   : f32 → i8   scaled by L1_QUANT  = 64   (clamped to [-127,127])
    Phase embeds, L1/L2/L3 biases, L2/L3 weights: kept as f32

.vortex header (20 bytes, plan §1.7):
    [0..4]   b"VRTX"
    [4]      version:u8         = 1
    [5..7]   FT_SIZE:u16-LE     = 768
    [7]      L2_SIZE:u8         = 16
    [8]      L3_SIZE:u8         = 32
    [9]      NUM_PHASE_BUCKETS:u8 = 16
    [10..12] PST_FEATURES:u16-LE  = 7680
    [12..16] THREAT_FEATURES:u32-LE = 72000
    [16..20] pst_weight_bytes:u32-LE
"""

import sys
import struct
import numpy as np
import torch

# ---------------------------------------------------------------------------
# Constants — must match types.rs exactly
# ---------------------------------------------------------------------------
FT_SIZE           = 768
FT_HALF           = 384
FT_QUANT          = 255        # integer ceiling for FT accumulator
L1_QUANT          = 64        # L1 weight quantisation scale
L2_SIZE           = 16
L3_SIZE           = 32
NUM_PHASE_BUCKETS = 16
PST_FEATURES      = 7_680
THREAT_FEATURES   = 72_000

FORMAT_VERSION    = 1


def _q_i16(arr: np.ndarray, scale: float) -> np.ndarray:
    """Quantise float array → int16, scaled by `scale`."""
    return (arr * scale).clip(-32768, 32767).astype(np.int16)


def _q_i8(arr: np.ndarray, scale: float) -> np.ndarray:
    """Quantise float array → int8 (stored as uint8 in file), scaled by `scale`."""
    return (arr * scale).clip(-127, 127).astype(np.int8)


def export_vortex_weights(model, output_path: str):
    """
    Serialise `model` to a .vortex file.
    `model` must be a VortexNNUE instance (from train.py).
    """
    print(f"Exporting to {output_path} ...")
    sd = {k: v.detach().cpu().float().numpy() for k, v in model.state_dict().items()}

    # ── 1. PST weights ──
    # pst_embed.weight shape: [PST_FEATURES, FT_SIZE] (float, values ≈ 1/FT_QUANT)
    pst_w_f32 = sd["pst_embed.weight"]                   # [7680, 768]
    assert pst_w_f32.shape == (PST_FEATURES, FT_SIZE), \
        f"pst_embed.weight shape mismatch: {pst_w_f32.shape}"
    pst_w_i16 = _q_i16(pst_w_f32, FT_QUANT)              # i16, range [-255,255]

    # PST biases — stored as [FT_SIZE] i16.  The model uses EmbeddingBag so
    # there is no explicit bias; export zeros (Rust adds them to the accumulator seed).
    pst_biases_i16 = np.zeros(FT_SIZE, dtype=np.int16)

    pst_weight_bytes = int(pst_w_i16.nbytes)

    # ── 2. Threat weights ──
    # threat_embed.weight shape: [THREAT_FEATURES, FT_SIZE]
    thr_w_f32 = sd["threat_embed.weight"]                 # [72000, 768]
    assert thr_w_f32.shape == (THREAT_FEATURES, FT_SIZE), \
        f"threat_embed.weight shape mismatch: {thr_w_f32.shape}"
    thr_w_i8 = _q_i8(thr_w_f32, FT_QUANT)

    # ── 3. Phase embeddings ──
    # phase_embed.weight shape: [NUM_PHASE_BUCKETS, FT_SIZE]  (float)
    phase_f32 = sd["phase_embed.weight"].astype(np.float32)
    assert phase_f32.shape == (NUM_PHASE_BUCKETS, FT_SIZE)

    # ── 4. L1 weights ──
    # l1_weight shape: [L2_SIZE, FT_SIZE]  (float, values ≈ 1/L1_QUANT)
    l1_w_f32 = sd["l1_weight"]                            # [16, 768]
    assert l1_w_f32.shape == (L2_SIZE, FT_SIZE), \
        f"l1_weight shape mismatch: {l1_w_f32.shape}"
    l1_w_i8  = _q_i8(l1_w_f32, L1_QUANT)

    # ── 5. L1 biases (per phase) ──
    # l1_bias.weight shape: [NUM_PHASE_BUCKETS, L2_SIZE]
    l1_bias_f32 = sd["l1_bias.weight"].astype(np.float32)
    assert l1_bias_f32.shape == (NUM_PHASE_BUCKETS, L2_SIZE)

    # ── 6. L1 quant constant ──
    l1_quant_i32 = np.int32(L1_QUANT)

    # ── 7. L2 weights ──
    # l2_weight shape in PyTorch: [L3_SIZE, L2_SIZE]
    # Rust reads row-major [L2_SIZE × L3_SIZE]:
    #   for i in 0..L3_SIZE:
    #     for j in 0..L2_SIZE: w.l2_weights[i*L2_SIZE + j]
    # PyTorch: out = x @ W^T, so W[out_i, in_j].
    # Rust inner loop: sum += l1_out[j] * l2_weights[i*L2_SIZE + j]
    # → Rust layout is [L3_SIZE, L2_SIZE] which matches PyTorch directly.
    l2_w_f32 = sd["l2_weight"].astype(np.float32)         # [32, 16]
    assert l2_w_f32.shape == (L3_SIZE, L2_SIZE), \
        f"l2_weight shape mismatch: {l2_w_f32.shape}"

    # ── 8. L2 biases (per phase) ──
    l2_bias_f32 = sd["l2_bias.weight"].astype(np.float32)
    assert l2_bias_f32.shape == (NUM_PHASE_BUCKETS, L3_SIZE)

    # ── 9. L3 weights ──
    # l3_weight shape: [1, L3_SIZE] → flatten to [L3_SIZE]
    l3_w_f32 = sd["l3_weight"].flatten().astype(np.float32)
    assert l3_w_f32.shape == (L3_SIZE,)

    # ── 10. L3 biases (per phase) ──
    l3_bias_f32 = sd["l3_bias.weight"].flatten().astype(np.float32)
    assert l3_bias_f32.shape == (NUM_PHASE_BUCKETS,)

    # ── Write file ──
    with open(output_path, "wb") as f:
        # Header (20 bytes)
        f.write(b"VRTX")
        f.write(struct.pack("<B",  FORMAT_VERSION))
        f.write(struct.pack("<H",  FT_SIZE))
        f.write(struct.pack("<B",  L2_SIZE))
        f.write(struct.pack("<B",  L3_SIZE))
        f.write(struct.pack("<B",  NUM_PHASE_BUCKETS))
        f.write(struct.pack("<H",  PST_FEATURES))
        f.write(struct.pack("<I",  THREAT_FEATURES))
        f.write(struct.pack("<I",  pst_weight_bytes))

        # 1. PST biases [FT_SIZE × i16]
        f.write(pst_biases_i16.tobytes())

        # 2. PST weights [PST_FEATURES × FT_SIZE × i16]
        f.write(pst_w_i16.tobytes())

        # 3. Threat weights [THREAT_FEATURES × FT_SIZE × i8]
        f.write(thr_w_i8.tobytes())

        # 4. Phase embeddings [NUM_PHASE_BUCKETS × FT_SIZE × f32]
        f.write(phase_f32.tobytes())

        # 5. L1 weights [L2_SIZE × FT_SIZE × i8]
        f.write(l1_w_i8.tobytes())

        # 6. L1 biases [NUM_PHASE_BUCKETS × L2_SIZE × f32]
        f.write(l1_bias_f32.tobytes())

        # 7. L1 quant (i32)
        f.write(l1_quant_i32.tobytes())

        # 8. L2 weights [L3_SIZE × L2_SIZE × f32]  (Rust inner loop matches)
        f.write(l2_w_f32.tobytes())

        # 9. L2 biases [NUM_PHASE_BUCKETS × L3_SIZE × f32]
        f.write(l2_bias_f32.tobytes())

        # 10. L3 weights [L3_SIZE × f32]
        f.write(l3_w_f32.tobytes())

        # 11. L3 biases [NUM_PHASE_BUCKETS × f32]
        f.write(l3_bias_f32.tobytes())

    size_mb = sum([
        pst_biases_i16.nbytes, pst_w_i16.nbytes, thr_w_i8.nbytes,
        phase_f32.nbytes, l1_w_i8.nbytes, l1_bias_f32.nbytes,
        4,  # l1_quant
        l2_w_f32.nbytes, l2_bias_f32.nbytes,
        l3_w_f32.nbytes, l3_bias_f32.nbytes,
    ]) / 1024 / 1024

    print(f"Export complete → {output_path}  ({size_mb:.1f} MB)")
    print(f"  PST:    {pst_w_i16.shape}  i16  ({pst_w_i16.nbytes/1e6:.1f} MB)")
    print(f"  Threat: {thr_w_i8.shape}   i8   ({thr_w_i8.nbytes/1e6:.1f} MB)")
    print(f"  L1:     {l1_w_i8.shape}    i8")
    print(f"  L2:     {l2_w_f32.shape}   f32")
    print(f"  L3:     {l3_w_f32.shape}   f32")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python export.py <checkpoint.pt> <output.vortex>")
        sys.exit(1)

    ckpt_path   = sys.argv[1]
    output_path = sys.argv[2]

    # Import model class from train.py in the same directory
    sys.path.insert(0, str(__file__).rsplit("/", 1)[0])
    from train import VortexNNUE

    ckpt  = torch.load(ckpt_path, map_location="cpu")
    model = VortexNNUE()
    model.load_state_dict(ckpt["model"])
    model.eval()

    export_vortex_weights(model, output_path)
