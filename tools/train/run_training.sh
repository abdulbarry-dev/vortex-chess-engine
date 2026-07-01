#!/usr/bin/env bash
# =============================================================================
# run_training.sh — Full Vortex NNUE training pipeline
#
# Steps:
#   1. Install Stockfish (if missing)
#   2. Download defensive grandmaster PGN data
#   3. Extract training positions (PGN → EPD)
#   4. Label positions with Stockfish (EPD → .vdata)
#   5. Train NNUE (PyTorch)
#   6. Export weights (.vortex)
#
# Usage:
#   chmod +x run_training.sh
#   ./run_training.sh
#
# Options (set as env vars before running):
#   SF_DEPTH=16          Stockfish search depth  (default 16)
#   EPOCHS=20            Training epochs          (default 20)
#   BATCH=2048           Training batch size      (default 2048)
#   LR=0.001             Learning rate            (default 0.001)
#   MAX_POSITIONS=300000 Max positions to label   (default 300000)
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOLS="$ROOT/tools"
DATA="$ROOT/data"
TRAIN="$TOOLS/train"

SF_DEPTH="${SF_DEPTH:-16}"
EPOCHS="${EPOCHS:-20}"
BATCH="${BATCH:-2048}"
LR="${LR:-0.001}"
MAX_POSITIONS="${MAX_POSITIONS:-300000}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[FAIL]${NC} $*" >&2; exit 1; }

mkdir -p "$DATA/pgn" "$DATA/epd" "$DATA/vdata" "$DATA/models"

# =============================================================================
# Step 1: Locate / install Stockfish
# =============================================================================
info "Step 1 — Locating Stockfish ..."

SF_BIN=""
for candidate in stockfish /usr/bin/stockfish /usr/local/bin/stockfish \
                 /opt/stockfish/stockfish "$DATA/stockfish"; do
    if command -v "$candidate" &>/dev/null 2>&1 || [ -x "$candidate" ]; then
        SF_BIN="$candidate"
        break
    fi
done

if [ -z "$SF_BIN" ]; then
    warn "Stockfish not found — downloading ..."
    SF_URL="https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-ubuntu-x86-64-avx2.tar"
    curl -L --progress-bar "$SF_URL" | tar -xf - --strip-components=1 -C "$DATA/"
    SF_BIN="$DATA/stockfish/stockfish-ubuntu-x86-64-avx2"
    chmod +x "$SF_BIN"
fi

success "Stockfish: $SF_BIN"
echo "  $($SF_BIN --version 2>/dev/null | head -1 || echo 'version unknown')"

# =============================================================================
# Step 2: Download defensive grandmaster PGN data
# =============================================================================
info "Step 2 — Downloading defensive grandmaster game databases ..."

PGN_DIR="$DATA/pgn"

download_pgn() {
    local url="$1"
    local name="$2"
    local dest="$PGN_DIR/$name"
    if [ -f "$dest" ]; then
        warn "  $name already exists — skipping"
        return 0
    fi
    info "  Downloading $name ..."
    curl -L --progress-bar --retry 3 -o "$dest" "$url" || warn "  Failed to download $name"
}

# ── Lichess Elite database 2024-01 (2300+ Elo games, ~800K games) ──
# This is the richest freely available high-Elo game set.
download_pgn \
    "https://database.lichess.org/elite/lichess_elite_2024-01.pgn.zst" \
    "lichess_elite_2024-01.pgn.zst"

# ── Lichess Elite 2023-12 (for volume) ──
download_pgn \
    "https://database.lichess.org/elite/lichess_elite_2023-12.pgn.zst" \
    "lichess_elite_2023-12.pgn.zst"

# ── Decompress .zst files if zstd is available ──
if command -v zstd &>/dev/null; then
    for f in "$PGN_DIR"/*.pgn.zst; do
        [ -f "$f" ] || continue
        out="${f%.zst}"
        if [ ! -f "$out" ]; then
            info "  Decompressing $(basename "$f") ..."
            zstd -d "$f" -o "$out" --quiet
        fi
    done
elif command -v python3 &>/dev/null; then
    # Fallback: use python zstandard if zstd binary missing
    python3 -c "
import zstandard, os, glob
for f in glob.glob('$PGN_DIR/*.pgn.zst'):
    out = f[:-4]
    if os.path.exists(out): continue
    print(f'  Decompressing {os.path.basename(f)} ...')
    with open(f,'rb') as src, open(out,'wb') as dst:
        dctx = zstandard.ZstdDecompressor()
        dctx.copy_stream(src, dst)
" 2>/dev/null || warn "  zstandard Python module not available — install with: pip3 install zstandard"
fi

PGN_COUNT=$(find "$PGN_DIR" -name "*.pgn" | wc -l)
info "  PGN files available: $PGN_COUNT"

# =============================================================================
# Step 3: Extract training positions (PGN → EPD)
# =============================================================================
info "Step 3 — Extracting defensive positions from PGN files ..."

EPD_FILE="$DATA/epd/defensive_training.epd"

if [ -f "$EPD_FILE" ] && [ "$(wc -l < "$EPD_FILE")" -gt 10000 ]; then
    warn "  EPD already exists ($(wc -l < "$EPD_FILE" | tr -d ' ') positions) — skipping extraction"
else
    python3 "$TRAIN/pgn_to_fen.py" \
        --pgn-dir    "$PGN_DIR"  \
        --out        "$EPD_FILE" \
        --sample-every  5        \
        --min-elo    2200        \
        --max-positions "$MAX_POSITIONS" \
        --skip-plies 12          \
        --min-plies  40
fi

EPD_LINES=$(wc -l < "$EPD_FILE" | tr -d ' ')
success "  Positions extracted: $EPD_LINES"

if [ "$EPD_LINES" -lt 1000 ]; then
    die "Too few positions ($EPD_LINES). Check PGN files and Elo filter."
fi

# =============================================================================
# Step 4: Label with Stockfish (EPD → .vdata)
# =============================================================================
info "Step 4 — Labelling positions with Stockfish (depth $SF_DEPTH) ..."
info "  This will take a while (~1-2 hours for 300K positions at depth 16)"

VDATA_FILE="$DATA/vdata/defensive_training.vdata"

if [ -f "$VDATA_FILE" ]; then
    warn "  .vdata already exists — skipping Stockfish labelling"
else
    # Build the data generator if not already built
    cargo build --release \
        --manifest-path "$TOOLS/generate_training_data/Cargo.toml" \
        --quiet

    GEN_BIN="$TOOLS/generate_training_data/target/release/generate_training_data"

    "$GEN_BIN" "$SF_BIN" "$EPD_FILE" "$VDATA_FILE" "$SF_DEPTH"
fi

# Quick file size sanity check
VDATA_SIZE=$(stat -c%s "$VDATA_FILE" 2>/dev/null || echo 0)
success "  .vdata file: $(numfmt --to=iec "$VDATA_SIZE" 2>/dev/null || echo "${VDATA_SIZE} bytes")"

# =============================================================================
# Step 5: Train NNUE
# =============================================================================
info "Step 5 — Training NNUE ($EPOCHS epochs, batch $BATCH, lr $LR) ..."

CKPT_LATEST="$DATA/models/vortex_nnue_latest.pt"
RESUME_FLAG=""
if [ -f "$CKPT_LATEST" ]; then
    warn "  Resuming from $CKPT_LATEST"
    RESUME_FLAG="--resume $CKPT_LATEST"
fi

python3 "$TRAIN/train.py" \
    --data        "$DATA/vdata"  \
    --epochs      "$EPOCHS"      \
    --batch       "$BATCH"       \
    --lr          "$LR"          \
    --checkpoint  "$DATA/models/vortex_nnue.pt" \
    $RESUME_FLAG

# Symlink best checkpoint
BEST=$(ls -t "$DATA/models"/vortex_nnue_ep*.pt 2>/dev/null | head -1)
if [ -n "$BEST" ]; then
    ln -sf "$BEST" "$CKPT_LATEST"
    success "  Latest checkpoint: $BEST"
fi

# =============================================================================
# Step 6: Export .vortex weights
# =============================================================================
info "Step 6 — Exporting to .vortex format ..."

BEST_CKPT=$(ls -t "$DATA/models"/vortex_nnue_ep*.pt 2>/dev/null | head -1)
VORTEX_OUT="$ROOT/vortex_nnue.vortex"

python3 "$TRAIN/export.py" "$BEST_CKPT" "$VORTEX_OUT"

success "All done!"
echo
echo "  Weights file : $VORTEX_OUT"
echo "  Run engine   : cd $ROOT && npm run build:all && npm start"
echo "  Load NNUE    : setoption name NNUEFile value $VORTEX_OUT"
