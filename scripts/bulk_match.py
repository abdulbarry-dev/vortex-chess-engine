import chess
import chess.engine
import chess.pgn
import asyncio
import datetime
import os

CONCURRENCY = 2
TOTAL_GAMES = 2
GAME_TIME_SEC = 5.0  # 5 seconds per game for ultra-fast analysis

async def play_game(game_id):
    print(f"[{game_id}] Starting game...")
    try:
        # Initialize Vortex
        _, vortex = await chess.engine.popen_uci(["node", "dist/cli.js"])
        
        # Initialize Stockfish
        _, stockfish = await chess.engine.popen_uci(["./bin/stockfish-bin"])

        # Limit Stockfish's skill level to make it an interesting fight
        await stockfish.configure({"Skill Level": 15})
        
        board = chess.Board()
        game = chess.pgn.Game()
        game.headers["Event"] = f"Vortex vs Stockfish Match {game_id}"
        game.headers["Date"] = datetime.datetime.now().strftime("%Y.%m.%d")
        
        if game_id % 2 == 0:
            white_engine = stockfish
            black_engine = vortex
            game.headers["White"] = "Stockfish 16.1"
            game.headers["Black"] = "Vortex Engine"
        else:
            white_engine = vortex
            black_engine = stockfish
            game.headers["White"] = "Vortex Engine"
            game.headers["Black"] = "Stockfish 16.1"
            
        game.headers["Result"] = "*"
        node = game
        
        white_clock = GAME_TIME_SEC
        black_clock = GAME_TIME_SEC
        
        while not board.is_game_over():
            limit = chess.engine.Limit(white_clock=white_clock, black_clock=black_clock)
            
            start_time = datetime.datetime.now()
            if board.turn == chess.WHITE:
                result = await white_engine.play(board, limit)
                elapsed = (datetime.datetime.now() - start_time).total_seconds()
                white_clock = max(0.1, white_clock - elapsed)
            else:
                result = await black_engine.play(board, limit)
                elapsed = (datetime.datetime.now() - start_time).total_seconds()
                black_clock = max(0.1, black_clock - elapsed)
                
            move = result.move
            if move is None:
                break
                
            board.push(move)
            node = node.add_variation(move)

        game.headers["Result"] = board.result()
        print(f"[{game_id}] Finished! Result: {board.result()}")
        
        # Write game to file immediately
        with open("analysis_match.pgn", "a") as f:
            f.write(str(game))
            f.write("\n\n")
            
        await stockfish.quit()
        await vortex.quit()
        
        return True
    except Exception as e:
        print(f"[{game_id}] Error: {e}")
        return None

async def worker(queue, results):
    while True:
        game_id = await queue.get()
        pgn = await play_game(game_id)
        queue.task_done()

async def main():
    queue = asyncio.Queue()
    results = []

    for i in range(1, TOTAL_GAMES + 1):
        queue.put_nowait(i)

    tasks = []
    for _ in range(CONCURRENCY):
        task = asyncio.create_task(worker(queue, results))
        tasks.append(task)

    await queue.join()

    for task in tasks:
        task.cancel()

    print("Saved games to analysis_match.pgn")

if __name__ == "__main__":
    asyncio.run(main())
