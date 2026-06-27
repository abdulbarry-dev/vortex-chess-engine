#!/bin/bash

# Create the games directory if it doesn't exist
mkdir -p games

echo "====================================================="
echo "Starting 100 matches between Vortex and Stockfish..."
echo "NOTE: This script requires 'cutechess-cli' to be installed."
echo "If you don't have it, install it via: sudo apt install cutechess-cli"
echo "====================================================="

# Ensure Vortex is built before running
echo "Building Vortex..."
npm run build:all

for i in {1..60}
do
    echo "Playing game $i of 60..."
    
    # Calculate time control: increase by 10 seconds each game
    BASE_TIME=$(( i * 10 ))
    echo "Time control for this game: ${BASE_TIME} seconds + 0.1s increment"
    
    # Alternate colors so both engines get to play White and Black equally
    if [ $((i % 2)) -eq 0 ]; then
        # Vortex is White, Stockfish is Black
        ENGINE1="conf=Vortex cmd=node arg=dist/cli.js name=Vortex"
        ENGINE2="conf=Stockfish cmd=stockfish name=Stockfish"
    else
        # Stockfish is White, Vortex is Black
        ENGINE1="conf=Stockfish cmd=stockfish name=Stockfish"
        ENGINE2="conf=Vortex cmd=node arg=dist/cli.js name=Vortex"
    fi

    # Run the match using cutechess-cli
    cutechess-cli \
        -engine $ENGINE1 \
        -engine $ENGINE2 \
        -each proto=uci tc=${BASE_TIME}+0.1 \
        -rounds 1 \
        -pgnout games/game_$i.pgn \
        -concurrency 1 > /dev/null

    echo "Game $i complete! Saved to games/game_$i.pgn"
done

echo "====================================================="
echo "All 60 games completed successfully."
echo "Check the 'games/' folder for your PGN files."
echo "====================================================="
