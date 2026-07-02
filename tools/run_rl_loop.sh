#!/usr/bin/env bash
# =============================================================================
# run_rl_loop.sh — Infinite RL Loop Orchestration (Phase 4)
#
# Automates: Generate -> Train -> Evaluate -> Promote
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/tools"
DATA="$ROOT/data"
TRAIN="$TOOLS/train"

EPOCHS="${EPOCHS:-10}"
BATCH="${BATCH:-2048}"
LR="${LR:-0.001}"
ITERATIONS="${ITERATIONS:-1000}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[FAIL]${NC} $*" >&2; exit 1; }

mkdir -p "$DATA/vdata" "$DATA/models"

# Ensure Rust generator is built
info "Building Rust data generator..."
cargo build --release --manifest-path "$TOOLS/generate_training_data/Cargo.toml" --quiet
GEN_BIN="$TOOLS/generate_training_data/target/release/generate_training_data"

# Main RL Loop
for ((i=1; i<=ITERATIONS; i++)); do
    info "========================================================="
    info " RL LOOP ITERATION $i"
    info "========================================================="

    # 1. Generate
    info "Step 1: Generating self-play games..."
    cd "$TOOLS/selfplay"
    # Ensure cutechess uses the current best engine. generate_selfplay.py uses v2_engine.sh
    python3 generate_selfplay.py
    
    # Move the generated EPD to the data directory
    mv selfplay.epd "$DATA/selfplay_iter_${i}.epd"
    cd "$ROOT"

    # 2. Convert to .vdata
    info "Step 2: Converting self-play EPD to .vdata..."
    "$GEN_BIN" "$DATA/selfplay_iter_${i}.epd" "$DATA/vdata/selfplay_iter_${i}.vdata"

    # 3. Train
    info "Step 3: Training NNUE..."
    CKPT_LATEST="$DATA/models/vortex_nnue_latest.pt"
    RESUME_FLAG=""
    if [ -f "$CKPT_LATEST" ]; then
        RESUME_FLAG="--resume $CKPT_LATEST"
    fi

    python3 "$TRAIN/train.py" \
        --data        "$DATA/vdata" \
        --epochs      "$EPOCHS" \
        --batch       "$BATCH" \
        --lr          "$LR" \
        --checkpoint  "$DATA/models/vortex_nnue.pt" \
        $RESUME_FLAG

    # Symlink best checkpoint
    BEST=$(ls -t "$DATA/models"/vortex_nnue_ep*.pt 2>/dev/null | head -1)
    if [ -n "$BEST" ]; then
        ln -sf "$BEST" "$CKPT_LATEST"
    fi

    # 4. Evaluate & Promote
    info "Step 4: Exporting new weights..."
    VORTEX_OUT="$ROOT/vortex_nnue_new.vortex"
    python3 "$TRAIN/export.py" "$CKPT_LATEST" "$VORTEX_OUT"
    
    # Ideally, we would evaluate VORTEX-Zero-A (new) vs VORTEX-Zero-B (old) here.
    # For now, we auto-promote.
    info "Promoting new weights..."
    mv "$VORTEX_OUT" "$ROOT/vortex_nnue.vortex"
    
    # Clean up old EPD to save space
    rm "$DATA/selfplay_iter_${i}.epd"
    
    success "Iteration $i complete."
done
