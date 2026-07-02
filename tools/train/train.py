"""
Vortex NNUE Training Script
============================
Architecture: plan §1.1–1.6 (1 brain, 16 phase embeddings)

Usage:
    python train.py [--data <dir_of_vdata>] [--epochs N] [--lr LR]
                    [--batch B] [--checkpoint checkpoint.pt]
                    [--resume checkpoint.pt]

Requirements:
    pip install torch numpy

.vdata format consumed here:
    File header (9 bytes):
        b"VDAT"           4 bytes  magic
        version:u8        1 byte   must be 2
        record_count:u32  4 bytes  LE
    Per record:
        hash:u64          8 bytes  (not used during training)
        phase:u8          1 byte   0-15 (phase bucket)
        result:i8         1 byte   0=draw 1=white_wins -1=black_wins
        bonus:i16         2 bytes  defensive bonus
        stm:u8            1 byte   0=white 1=black
        padding:bytes     27 bytes
        blob_len:u32      4 bytes  feature blob byte length
        blob:bytes        N bytes  encode_features() output
            pst_w_count:u16
            pst_b_count:u16
            thr_w_count:u16
            thr_b_count:u16
            pst_w[]:u32   (pst_w_count × 4 bytes)
            pst_b[]:u32
            thr_w[]:u32
            thr_b[]:u32
"""

import argparse
import glob
import math
import os
import struct
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader

# ---------------------------------------------------------------------------
# Architecture constants — must match src/types.rs and forward.rs exactly
# ---------------------------------------------------------------------------
PST_FEATURES    = 7_680
THREAT_FEATURES = 72_000
FT_SIZE         = 768
FT_HALF         = 384
FT_QUANT        = 255.0       # FT clamp ceiling (float representation)
L1_QUANT        = 64.0        # L1 weight quantisation factor
L2_SIZE         = 16
L3_SIZE         = 32
NUM_PHASE_BUCKETS = 16

# In float-space training we work in natural units — DEQUANT only applied at export.
# Keeping a scale constant here just for reference:
# DEQUANT = 1.0 / (FT_QUANT * FT_QUANT * L1_QUANT)  ← applied only in export.py

# Sigmoid temperature — maps centipawns to WDL probability
# 400 cp ≈ 80% win probability (common NNUE convention)
SIGMOID_SCALE = 400.0

# Clamp scores before sigmoid to prevent saturation from mate scores
# sigmoid(3000/400) = 0.9997 — well within gradient range
SCORE_CLAMP = 3000.0

# ---------------------------------------------------------------------------
# .vdata file reader
# ---------------------------------------------------------------------------

def _read_u32s(buf: bytes, off: int, n: int):
    end = off + n * 4
    return list(struct.unpack_from(f"<{n}I", buf, off)), end


def parse_vdata_file(path: str):
    """
    Generator that yields one dict per record:
        score  : int  (STM centipawns)
        phase  : int  (0-15)
        result : float (0.0=draw, 1.0=white_wins, -1.0=black_wins from STM view)
        stm    : int  (0=white, 1=black)
        pst_w  : list[int]
        pst_b  : list[int]
        thr_w  : list[int]
        thr_b  : list[int]
    """
    with open(path, "rb") as f:
        data = f.read()

    if data[:4] != b"VDAT":
        raise ValueError(f"{path}: bad magic")
    version = data[4]
    if version != 2:
        raise ValueError(f"{path}: version {version} != 2 — re-generate with current tool")
    record_count = struct.unpack_from("<I", data, 5)[0]
    off = 9

    for _ in range(record_count):
        if off + 16 > len(data):
            break

        _hash   = struct.unpack_from("<Q", data, off)[0]; off += 8
        phase   = data[off]; off += 1
        result  = struct.unpack_from("<b", data, off)[0]; off += 1
        bonus   = struct.unpack_from("<h", data, off)[0]; off += 2
        stm     = data[off]; off += 1
        off += 27 # padding
        blob_len = struct.unpack_from("<I", data, off)[0]; off += 4

        blob = data[off: off + blob_len]; off += blob_len

        # Parse feature blob
        if len(blob) < 8:
            continue
        pst_w_n, pst_b_n, thr_w_n, thr_b_n = struct.unpack_from("<4H", blob, 0)
        b_off = 8
        pst_w, b_off = _read_u32s(blob, b_off, pst_w_n)
        pst_b, b_off = _read_u32s(blob, b_off, pst_b_n)
        thr_w, b_off = _read_u32s(blob, b_off, thr_w_n)
        thr_b, b_off = _read_u32s(blob, b_off, thr_b_n)

        # Result from STM perspective
        if result == 0:
            result_stm = 0.5
        elif result == 1:
            result_stm = 1.0 if stm == 0 else 0.0
        else:
            result_stm = 0.0 if stm == 0 else 1.0

        yield {
            "score":   0, # Dummy score as it's no longer used
            "phase":   phase,
            "result":  result_stm,
            "stm":     stm,
            "pst_w":   pst_w,
            "pst_b":   pst_b,
            "thr_w":   thr_w,
            "thr_b":   thr_b,
        }


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

class VortexDataset(Dataset):
    """Loads all .vdata files from a directory into memory."""

    def __init__(self, data_dir: str):
        self.records = []
        paths = sorted(glob.glob(os.path.join(data_dir, "*.vdata")))
        if not paths:
            raise FileNotFoundError(f"No .vdata files found in {data_dir}")
        for p in paths:
            print(f"  Loading {p} ...", flush=True)
            self.records.extend(parse_vdata_file(p))
        print(f"  Total positions: {len(self.records):,}")

    def __len__(self):
        return len(self.records)

    def __getitem__(self, idx):
        return self.records[idx]


def collate_vortex(batch):
    """
    Custom collate: pad/concatenate variable-length index lists and build
    offsets for EmbeddingBag.
    """
    def make_eb_args(key):
        seqs = [torch.tensor(r[key], dtype=torch.long) for r in batch]
        offsets = torch.tensor(
            [0] + [len(s) for s in seqs[:-1]], dtype=torch.long
        ).cumsum(0)
        indices = torch.cat(seqs)
        return indices, offsets

    pst_w_idx, pst_w_off = make_eb_args("pst_w")
    pst_b_idx, pst_b_off = make_eb_args("pst_b")
    thr_w_idx, thr_w_off = make_eb_args("thr_w")
    thr_b_idx, thr_b_off = make_eb_args("thr_b")

    phase   = torch.tensor([r["phase"]  for r in batch], dtype=torch.long)
    score   = torch.tensor([r["score"]  for r in batch], dtype=torch.float32)
    result  = torch.tensor([r["result"] for r in batch], dtype=torch.float32)
    stm     = torch.tensor([r["stm"]    for r in batch], dtype=torch.long)

    return {
        "pst_w": (pst_w_idx, pst_w_off),
        "pst_b": (pst_b_idx, pst_b_off),
        "thr_w": (thr_w_idx, thr_w_off),
        "thr_b": (thr_b_idx, thr_b_off),
        "phase":  phase,
        "score":  score,
        "result": result,
        "stm":    stm,
    }


# ---------------------------------------------------------------------------
# Model  (must replicate forward.rs exactly)
# ---------------------------------------------------------------------------

class VortexNNUE(nn.Module):
    """
    1-brain NNUE with:
      • Dual-accumulator PST + Threat (EmbeddingBag, mode='sum')
      • 16 phase embeddings (additive FT bias)
      • Multiplicative SCReLU feature transformer
      • Value Head: L1 [FT_SIZE → L2_SIZE], L2, L3 → 1 (centipawns)
      • Policy Head: Linear [FT_SIZE → 1858] → Softmax
    """

    def __init__(self):
        super().__init__()

        # Feature transformers
        self.pst_embed    = nn.EmbeddingBag(PST_FEATURES,    FT_SIZE, mode="sum")
        self.threat_embed = nn.EmbeddingBag(THREAT_FEATURES, FT_SIZE, mode="sum")
        self.phase_embed  = nn.Embedding(NUM_PHASE_BUCKETS,  FT_SIZE)

        # L1 weights (i8 after quantisation) — no bias in weight matrix itself
        self.l1_weight = nn.Parameter(torch.empty(L2_SIZE, FT_SIZE))
        # Per-phase biases at each layer
        self.l1_bias = nn.Embedding(NUM_PHASE_BUCKETS, L2_SIZE)
        self.l2_bias = nn.Embedding(NUM_PHASE_BUCKETS, L3_SIZE)
        self.l3_bias = nn.Embedding(NUM_PHASE_BUCKETS, 1)

        # L2 and L3 (Value Head)
        self.l2_weight = nn.Parameter(torch.empty(L3_SIZE, L2_SIZE))
        self.l3_weight = nn.Parameter(torch.empty(1, L3_SIZE))

        # Policy Head (FT_SIZE -> 1858 moves)
        self.policy_weight = nn.Parameter(torch.empty(1858, FT_SIZE))
        self.policy_bias = nn.Parameter(torch.empty(1858))

        self._init_weights()

    def _init_weights(self):
        # Float-space training: embeddings must produce values in [0,1] after clamp.
        # We initialise in [-0.1, 0.1] so the sum of ~30 PST features sits around 0
        # and clamps to a mix of 0s and positive values — SCReLU gets signal.
        nn.init.uniform_(self.pst_embed.weight,    -0.1, 0.1)
        nn.init.uniform_(self.threat_embed.weight, -0.05, 0.05)
        nn.init.uniform_(self.phase_embed.weight,  -0.01, 0.01)

        # L1: kaiming, standard range — no artificial scale clamp in float space
        nn.init.kaiming_uniform_(self.l1_weight, a=math.sqrt(5))

        nn.init.zeros_(self.l1_bias.weight)
        nn.init.zeros_(self.l2_bias.weight)
        nn.init.zeros_(self.l3_bias.weight)

        nn.init.kaiming_uniform_(self.l2_weight, a=math.sqrt(5))
        # L3 output should be in centipawn range (~[-5,+5] before ×100)
        nn.init.uniform_(self.l3_weight, -0.01, 0.01)

        # Policy Head initialization (zeroed out so it doesn't affect search until we train it)
        nn.init.zeros_(self.policy_weight)
        nn.init.zeros_(self.policy_bias)

    def _screlu(self, pst_acc, threat_acc, phase_bias):
        """
        SCReLU (plan §1.3):
          ft  = clamp(pst + threat + phase_bias, 0, 1)   [float repr of [0,FT_QUANT]]
          out = [lower * upper | lower * upper]           [FT_SIZE, mirrored]
        """
        ft = (pst_acc + threat_acc + phase_bias).clamp(0.0, 1.0)
        left  = ft[:, :FT_HALF]   # [B, 384]
        right = ft[:, FT_HALF:]   # [B, 384]
        mult  = left * right       # [B, 384]  — product in [0, 1]²
        return torch.cat([mult, mult], dim=1)  # [B, 768]

    def forward(self, pst_w, pst_b, thr_w, thr_b, phase, stm):
        """
        pst_w / pst_b : (indices, offsets) for EmbeddingBag
        thr_w / thr_b : (indices, offsets) for EmbeddingBag
        phase         : [B] long, 0-15
        stm           : [B] long, 0=white 1=black
        returns       : tuple (value_out: [B] float, policy_out: [B, 1858] float logits)

        NOTE: In float-space training we do NOT apply DEQUANT — that's only
        applied at export time when weights are quantised to int8/int16.
        """
        B = phase.shape[0]

        # Accumulate both perspectives
        pst_white  = self.pst_embed(*pst_w)     # [B, FT_SIZE]
        pst_black  = self.pst_embed(*pst_b)
        thr_white  = self.threat_embed(*thr_w)
        thr_black  = self.threat_embed(*thr_b)
        phase_bias = self.phase_embed(phase)     # [B, FT_SIZE]

        ft_white = self._screlu(pst_white, thr_white, phase_bias)  # [B, FT_SIZE]
        ft_black = self._screlu(pst_black, thr_black, phase_bias)

        # STM perspective: pick white or black accumulator per sample
        stm_mask = stm.view(B, 1).float()                          # 1.0 = black's turn
        ft_stm   = ft_white * (1 - stm_mask) + ft_black * stm_mask  # [B, FT_SIZE]

        # L1: float dot-product (no DEQUANT in training)
        l1_raw = ft_stm @ self.l1_weight.t()                       # [B, L2_SIZE]
        l1_out = (l1_raw + self.l1_bias(phase)).clamp(0.0, 1.0)

        # L2
        l2_out = (l1_out @ self.l2_weight.t() + self.l2_bias(phase)).clamp(0.0, 1.0)

        # L3 → scalar win probability logit
        value_out = (l2_out @ self.l3_weight.t() + self.l3_bias(phase)).squeeze(-1)  # [B]

        # Policy Head: Branching directly from ft_stm
        policy_logits = ft_stm @ self.policy_weight.t() + self.policy_bias  # [B, 1858]
        
        return value_out, policy_logits


# ---------------------------------------------------------------------------
# Loss: RL Outcome loss
# ---------------------------------------------------------------------------

def outcome_loss(pred_logit, target_result):
    """
    Loss = MSE(sigmoid(pred_logit), result)
    """
    pred_wdl = torch.sigmoid(pred_logit)
    loss_result = nn.functional.mse_loss(pred_wdl, target_result)
    return loss_result

def combined_loss(pred_logit, pred_policy, target_result, target_policy):
    """
    Combined loss for Vortex Zero: Value Loss (MSE) + Policy Loss (Cross Entropy)
    """
    v_loss = outcome_loss(pred_logit, target_result)
    
    # If target_policy is missing or dummy (e.g. -1), we can ignore policy loss for this batch
    if target_policy is None or (target_policy == -1).all():
        return v_loss, v_loss, torch.tensor(0.0, device=pred_logit.device)
        
    p_loss = nn.functional.cross_entropy(pred_policy, target_policy)
    
    total_loss = v_loss + p_loss
    return total_loss, v_loss, p_loss


# ---------------------------------------------------------------------------
# Training loop
# ---------------------------------------------------------------------------

def move_batch(batch, device):
    def to_dev(t):
        return t.to(device)
    return {
        "pst_w":  (to_dev(batch["pst_w"][0]),  to_dev(batch["pst_w"][1])),
        "pst_b":  (to_dev(batch["pst_b"][0]),  to_dev(batch["pst_b"][1])),
        "thr_w":  (to_dev(batch["thr_w"][0]),  to_dev(batch["thr_w"][1])),
        "thr_b":  (to_dev(batch["thr_b"][0]),  to_dev(batch["thr_b"][1])),
        "phase":  to_dev(batch["phase"]),
        "score":  to_dev(batch["score"]),
        "result": to_dev(batch["result"]),
        "stm":    to_dev(batch["stm"]),
        "target_policy": torch.full((batch["stm"].shape[0],), -1, dtype=torch.long, device=device) # Dummy policy for now
    }


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    print("Loading dataset...")
    dataset = VortexDataset(args.data)
    loader  = DataLoader(
        dataset,
        batch_size=args.batch,
        shuffle=True,
        num_workers=min(4, os.cpu_count() or 1),
        collate_fn=collate_vortex,
        pin_memory=(device.type == "cuda"),
    )

    model = VortexNNUE().to(device)
    start_epoch = 0

    if args.resume:
        ckpt = torch.load(args.resume, map_location=device)
        model.load_state_dict(ckpt["model"])
        start_epoch = ckpt.get("epoch", 0)
        print(f"Resumed from {args.resume} (epoch {start_epoch})")

    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=args.epochs * len(loader), eta_min=args.lr * 0.01
    )

    print(f"Training for {args.epochs} epoch(s), {len(dataset):,} positions, "
          f"batch={args.batch}, lr={args.lr}")

    for epoch in range(start_epoch, start_epoch + args.epochs):
        model.train()
        total_loss = 0.0

        for step, batch in enumerate(loader):
            b = move_batch(batch, device)
            optimizer.zero_grad()

            pred_value, pred_policy = model(
                b["pst_w"], b["pst_b"],
                b["thr_w"], b["thr_b"],
                b["phase"], b["stm"],
            )

            loss, v_loss, p_loss = combined_loss(pred_value, pred_policy, b["result"], b["target_policy"])
            loss.backward()

            # Gradient clipping for stability
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()

            total_loss += loss.item()

            if (step + 1) % 500 == 0:
                avg = total_loss / (step + 1)
                lr  = scheduler.get_last_lr()[0]
                print(f"  epoch {epoch+1} step {step+1:5d}/{len(loader)}  "
                      f"loss={avg:.6f}  lr={lr:.2e}")

        avg_loss = total_loss / len(loader)
        print(f"Epoch {epoch+1}  avg_loss={avg_loss:.6f}")

        # Save checkpoint
        ckpt_path = args.checkpoint.replace(".pt", f"_ep{epoch+1}.pt")
        torch.save({"epoch": epoch + 1, "model": model.state_dict()}, ckpt_path)
        print(f"  → saved {ckpt_path}")

    print("Training complete.")
    return model


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Vortex NNUE trainer")
    parser.add_argument("--data",       default="data",
                        help="Directory containing .vdata files")
    parser.add_argument("--epochs",     type=int,   default=10)
    parser.add_argument("--lr",         type=float, default=1e-3)
    parser.add_argument("--batch",      type=int,   default=1024)
    parser.add_argument("--checkpoint", default="vortex_nnue.pt",
                        help="Base path for checkpoint files")
    parser.add_argument("--resume",     default=None,
                        help="Resume from a checkpoint file")
    args = parser.parse_args()
    train(args)
