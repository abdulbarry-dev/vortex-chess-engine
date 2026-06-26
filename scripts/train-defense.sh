#!/bin/bash
set -e

echo "======================================================="
echo "   Vortex Defensive Training Pipeline (10,000 Games)   "
echo "======================================================="

# 1. Download a highly tactical opening suite (UHO - Unbalanced Human Openings)
# This forces Vortex out of its comfort zone and prevents move-10 draws.
echo "[1/4] Checking for UHO tactical opening suite..."
if [ ! -f "scripts/uho.epd" ]; then
  echo "      Downloading UHO suite (requires internet connection)..."
  curl -L -o scripts/uho.epd https://raw.githubusercontent.com/official-stockfish/books/master/UHO_4060_v2.epd
else
  echo "      scripts/uho.epd already exists, skipping download (Offline mode active)."
fi

# 2. Run 10,000 games of Vortex vs Vortex using the tactical openings
echo "[2/4] Running 10,000 self-play games (this will take a few hours)..."
echo "      Using 6 CPU cores to parallelize the matches."
./squashfs-root/usr/bin/cutechess-cli \
  -engine cmd="$PWD/dist/cli.js" name="Vortex-White" \
  -engine cmd="$PWD/dist/cli.js" name="Vortex-Black" \
  -each proto=uci tc=2+0.05 \
  -rounds 5000 -repeat -concurrency 6 \
  -openings file=scripts/uho.epd format=epd order=random \
  -pgnout scripts/training_games.pgn

# 3. Convert the PGN to EPD using our Python script
echo "[3/4] Converting PGN games to EPD tuning dataset..."
./venv/bin/python scripts/pgn-to-epd.py

# 4. Run the Texel Tuner
echo "[4/4] Running the Texel Tuner..."
npx tsx scripts/texel-tuning.ts scripts/dataset.epd

echo "======================================================="
echo " Training complete! Please update EVALUATION_WEIGHTS "
echo " in src/evaluation/Evaluator.ts with the new numbers."
echo "======================================================="
