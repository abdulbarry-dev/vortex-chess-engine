import chess.pgn
import sys
import os

def parse_pgn(pgn_file, output_file):
    count = 0
    with open(pgn_file, 'r') as pgn, open(output_file, 'w') as out:
        while True:
            game = chess.pgn.read_game(pgn)
            if game is None:
                break
            
            result = game.headers.get("Result", "*")
            if result == "*":
                continue
                
            # Play out the game
            board = game.board()
            for move in game.mainline_moves():
                board.push(move)
                
                # Save positions after move 10 to avoid purely opening phase
                # Skip positions where a king is in check
                if board.fullmove_number > 10 and not board.is_check():
                    fen = board.fen()
                    out.write(f'{fen} c9 "{result}";\n')
                    count += 1

    print(f"Exported {count} positions to {output_file}")

if __name__ == "__main__":
    parse_pgn("scripts/training_games.pgn", "scripts/dataset.epd")
