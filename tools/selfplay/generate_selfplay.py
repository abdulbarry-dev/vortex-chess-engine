import os
import subprocess
import json
import chess
import chess.pgn
import sys

GAMES_COUNT = 100
CONCURRENCY = 4
TIME_CONTROL = "60+0.6"  # Fast bullet
ENGINE_CMD = "./v2_engine.sh"
PGN_OUTPUT = "selfplay.pgn"
DATASET_OUTPUT = "dataset.jsonl"

def run_cutechess():
    print(f"Running {GAMES_COUNT} games at {TIME_CONTROL}...")
    cmd = [
        "cutechess-cli",
        "-engine", f"cmd={ENGINE_CMD}", 'name="VORTEX-Zero-A"',
        "-engine", f"cmd={ENGINE_CMD}", 'name="VORTEX-Zero-B"',
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
                
                # Append to dataset
                dataset.append({
                    "fen": fen,
                    "policy_target": uci_move,
                    "value_target": value_target
                })
                
                board.push(move)

    with open(DATASET_OUTPUT, "w") as out:
        for entry in dataset:
            out.write(json.dumps(entry) + "\n")
            
    print(f"Generated {len(dataset)} training samples.")

if __name__ == "__main__":
    if not os.path.exists("v2_engine.sh"):
        print("Error: v2_engine.sh not found. Run from the root of vortex-chess-engine.")
        sys.exit(1)
        
    run_cutechess()
    parse_pgn()
