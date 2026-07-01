#!/usr/bin/env python3
"""
pgn_to_fen.py — Extract training positions from PGN files.

Filters for positions that match Vortex's defensive philosophy:
  • Long games (≥ 30 plies) — short games rarely have defensive themes
  • Skip first 6 plies (opening book noise)
  • Skip check positions (scores are evaluation outliers)
  • Sample every N plies to avoid correlated positions
  • Annotate with game result for WDL training

Output: one FEN per line in Lichess EPD format:
  <fen> c9 "<result>"
  (result: "1-0", "0-1", "1/2-1/2")

Usage:
  python3 pgn_to_fen.py [--pgn-dir <dir>] [--out <file.epd>]
                        [--sample-every N] [--min-elo N] [--max-positions N]
"""

import argparse
import os
import sys
import random
import chess
import chess.pgn

# Defensive grandmasters we prioritise (case-insensitive substring match)
DEFENSIVE_MASTERS = [
    "petrosian", "karpov", "andersson", "smyslov", "carlsen", "kramnik",
    "leko", "geller", "portisch", "timman", "ivanchuk", "spassky",
]

def is_defensive_game(headers: dict) -> bool:
    """Boost probability of keeping games by a known defensive master."""
    for key in ["White", "Black"]:
        player = headers.get(key, "").lower()
        if any(m in player for m in DEFENSIVE_MASTERS):
            return True
    return False


def pgn_to_epd(pgn_paths, out_path, sample_every=5, min_elo=2000,
               max_positions=500_000, skip_plies=12, min_plies=40):
    """
    Extract FEN positions from PGN files and write EPD format.
    """
    total_written = 0
    total_games   = 0
    skipped_elo   = 0
    skipped_short = 0

    with open(out_path, "w") as out:
        for pgn_path in pgn_paths:
            print(f"  Processing {pgn_path} ...", flush=True)
            try:
                pgn_file = open(pgn_path, encoding="utf-8", errors="replace")
            except OSError as e:
                print(f"  Warning: {e}", file=sys.stderr)
                continue

            while total_written < max_positions:
                try:
                    game = chess.pgn.read_game(pgn_file)
                except Exception:
                    break
                if game is None:
                    break

                total_games += 1
                headers = game.headers

                # Elo filter
                try:
                    white_elo = int(headers.get("WhiteElo", "0") or "0")
                    black_elo = int(headers.get("BlackElo", "0") or "0")
                    avg_elo   = (white_elo + black_elo) // 2
                except ValueError:
                    avg_elo = 0

                if avg_elo > 0 and avg_elo < min_elo:
                    skipped_elo += 1
                    continue

                result = headers.get("Result", "*")
                if result not in ("1-0", "0-1", "1/2-1/2"):
                    continue

                # Boost defensive master games — sample them more heavily
                boost = is_defensive_game(headers)
                eff_sample = max(1, sample_every // 2) if boost else sample_every

                # Walk the game tree
                board  = game.board()
                moves  = list(game.mainline_moves())
                n_plies = len(moves)

                if n_plies < min_plies:
                    skipped_short += 1
                    continue

                for ply, move in enumerate(moves):
                    board.push(move)

                    # Skip opening and late game (low signal)
                    if ply < skip_plies:
                        continue
                    if ply > n_plies - 6:
                        break

                    # Sample every N plies (with some jitter to decorrelate)
                    if (ply % eff_sample) != 0:
                        continue

                    # Skip positions in check (eval spikes)
                    if board.is_check():
                        continue

                    # Skip positions where game is effectively over
                    if board.is_game_over():
                        break

                    fen = board.fen()
                    out.write(f'{fen} c9 "{result}"\n')
                    total_written += 1

                    if total_written >= max_positions:
                        break

                if total_written % 10_000 == 0 and total_written > 0:
                    print(f"    {total_written:,} positions written "
                          f"({total_games:,} games processed) ...", flush=True)

            pgn_file.close()

    print(f"\nDone.")
    print(f"  Games processed : {total_games:,}")
    print(f"  Skipped (elo)   : {skipped_elo:,}")
    print(f"  Skipped (short) : {skipped_short:,}")
    print(f"  Positions written: {total_written:,}  → {out_path}")
    return total_written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PGN → EPD extractor")
    parser.add_argument("--pgn-dir",       default="data/pgn",
                        help="Directory containing .pgn files")
    parser.add_argument("--out",           default="data/training_positions.epd",
                        help="Output EPD file")
    parser.add_argument("--sample-every",  type=int, default=5,
                        help="Take 1 position every N plies (default 5)")
    parser.add_argument("--min-elo",       type=int, default=2200,
                        help="Minimum average Elo (0 = no filter)")
    parser.add_argument("--max-positions", type=int, default=500_000,
                        help="Maximum positions to extract")
    parser.add_argument("--skip-plies",    type=int, default=12,
                        help="Skip first N plies (opening)")
    parser.add_argument("--min-plies",     type=int, default=40,
                        help="Discard games shorter than N plies")
    args = parser.parse_args()

    pgn_files = sorted([
        os.path.join(args.pgn_dir, f)
        for f in os.listdir(args.pgn_dir)
        if f.endswith(".pgn") or f.endswith(".pgn.gz")
    ])

    if not pgn_files:
        print(f"No .pgn files found in {args.pgn_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(pgn_files)} PGN file(s) in {args.pgn_dir}")
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    pgn_to_epd(
        pgn_files,
        args.out,
        sample_every  = args.sample_every,
        min_elo       = args.min_elo,
        max_positions = args.max_positions,
        skip_plies    = args.skip_plies,
        min_plies     = args.min_plies,
    )
