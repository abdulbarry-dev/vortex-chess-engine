import chess
import chess.engine
import chess.pgn
import asyncio
import datetime

async def play_game():
    print("Initializing engines...")
    # Initialize Vortex
    _, vortex = await chess.engine.popen_uci(["node", "dist/cli.js"])
    
    # Initialize Stockfish
    _, stockfish = await chess.engine.popen_uci(["./stockfish-bin"])

    # Limit Stockfish's skill level to make it an interesting fight
    # Skill Level 10 (out of 20) is around 2300-2500 Elo.
    await stockfish.configure({"Skill Level": 15})
    
    board = chess.Board()
    game = chess.pgn.Game()
    game.headers["Event"] = "Vortex vs Stockfish Training Match"
    game.headers["Date"] = datetime.datetime.now().strftime("%Y.%m.%d")
    game.headers["White"] = "Stockfish 16.1"
    game.headers["Black"] = "Vortex Engine"
    game.headers["Result"] = "*"
    
    node = game
    
    # Time controls: 0.1s for Stockfish, 0.5s for Vortex per move
    limit_sf = chess.engine.Limit(time=0.01)
    limit_vortex = chess.engine.Limit(time=0.1)

    print("Starting match: Stockfish (White) vs Vortex (Black)")
    
    while not board.is_game_over():
        if board.turn == chess.WHITE:
            result = await stockfish.play(board, limit_sf)
        else:
            result = await vortex.play(board, limit_vortex)
            
        move = result.move
        if move is None:
            print("Engine returned no move. Game over.")
            break
            
        board.push(move)
        node = node.add_variation(move)
        
        # print(f"Move: {move}, Eval: {result.info.get('score')}")
        
        # Print board occasionally
        if board.fullmove_number % 10 == 0 and board.turn == chess.WHITE:
            print(f"Move {board.fullmove_number}...")

    # Game over
    game.headers["Result"] = board.result()
    print("Game Over!")
    print("Result:", board.result())
    print("Reason:", board.outcome().termination.name if board.outcome() else "Unknown")
    
    # Save PGN
    with open("vortex_vs_stockfish.pgn", "w") as f:
        f.write(str(game))
    
    print("PGN saved to vortex_vs_stockfish.pgn")
    
    await stockfish.quit()
    await vortex.quit()

if __name__ == "__main__":
    asyncio.run(play_game())
