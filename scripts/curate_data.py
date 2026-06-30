#!/usr/bin/env python3
import chess.pgn
import sys
import argparse

def is_noisy(board, move):
    # A move is noisy if it's a capture, promotion, or gives check
    return board.is_capture(move) or move.promotion is not None or board.gives_check(move)

def parse_pgn(pgn_file, output_file, window=4):
    count = 0
    total_games = 0

    with open(pgn_file, 'r') as pgn, open(output_file, 'w') as out:
        while True:
            game = chess.pgn.read_game(pgn)
            if game is None:
                break
            total_games += 1
            
            result = game.headers.get("Result", "*")
            if result == "*":
                continue
                
            # Convert game into a list of moves to look ahead
            moves = list(game.mainline_moves())
            board = game.board()
            
            # Precompute noise for all moves
            noise_array = []
            temp_board = game.board()
            for m in moves:
                noise_array.append(is_noisy(temp_board, m))
                temp_board.push(m)
                
            for i, move in enumerate(moves):
                board.push(move)
                
                # We want the position AFTER move `i`.
                # We skip early opening
                if board.fullmove_number <= 10:
                    continue
                    
                # Skip if king is in check
                if board.is_check():
                    continue
                    
                # Quiet position filter: check if there is any noisy move within `window` plies
                # both before and after this position.
                start_idx = max(0, i - window + 1)
                end_idx = min(len(moves), i + window + 1)
                
                is_quiet = True
                for j in range(start_idx, end_idx):
                    if noise_array[j]:
                        is_quiet = False
                        break
                        
                if is_quiet:
                    fen = board.fen()
                    out.write(f'{fen} c9 "{result}";\n')
                    count += 1

    print(f"Processed {total_games} games.")
    print(f"Exported {count} quiet positions to {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process game position files and discard tactical noise via a Quiet Position Filter.")
    parser.add_argument("input", help="Input PGN file")
    parser.add_argument("output", help="Output EPD file")
    parser.add_argument("--window", type=int, default=4, help="Quiescence window (plies). Positions within this many plies of a capture/check/promotion are discarded.")
    
    args = parser.parse_args()
    parse_pgn(args.input, args.output, args.window)
