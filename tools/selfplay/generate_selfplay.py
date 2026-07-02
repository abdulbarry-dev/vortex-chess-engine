import os
import subprocess
import json
import chess
import chess.pgn
import sys

GAMES_COUNT = 100
CONCURRENCY = 4
TIME_CONTROL = "60+0.6"  # Fast bullet
ENGINE_CMD = "node ../../dist/cli.js"
PGN_OUTPUT = "selfplay.pgn"
DATASET_OUTPUT = "selfplay.epd"

def run_cutechess():
    print(f"Running {GAMES_COUNT} games at {TIME_CONTROL}...")
    cmd = [
        "cutechess-cli",
        "-engine", "cmd=../../v2_engine.sh", 'name="VORTEX-Zero-A"',
        "-engine", "cmd=../../v2_engine.sh", 'name="VORTEX-Zero-B"',
        "-each", "proto=uci", f"tc={TIME_CONTROL}",
        "-rounds", str(GAMES_COUNT),
        "-concurrency", str(CONCURRENCY),
        "-pgnout", PGN_OUTPUT
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("Matches complete.")

def parse_pgn():
    print("Parsing PGN into dataset...")
    dataset = []
    
    with open(PGN_OUTPUT, "r") as pgn_file:
        while True:
            game = chess.pgn.read_game(pgn_file)
            if game is None:
                break
            
            result = game.headers["Result"]
            if result == "1-0":
                value_target = 1.0
            elif result == "0-1":
                value_target = 0.0
            else:
                value_target = 0.5
                
            board = game.board()
            
            for move in game.mainline_moves():
                # Policy target is the move played
                uci_move = move.uci()
                fen = board.fen()
                
                relative_value = value_target if board.turn == chess.WHITE else (1.0 - value_target)
                
                # Append to EPD dataset
                dataset.append(f'{fen} c9 "{result}"')
                
                board.push(move)

    with open(DATASET_OUTPUT, "w") as out:
        for entry in dataset:
            out.write(entry + "\n")
            
    print(f"Generated {len(dataset)} training positions in {DATASET_OUTPUT}.")

if __name__ == "__main__":
    # Removed check
        
    run_cutechess()
    parse_pgn()
