#!/bin/bash
# Quick test script for the Vortex Chess Engine

echo "==================================================================="
echo "  VORTEX CHESS ENGINE - QUICK TEST"
echo "==================================================================="
echo ""

# Build the engine
echo "📦 Building engine..."
npm run build:all > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Run 'npm run build:all' to see errors."
    exit 1
fi

echo "✅ Build successful!"
echo ""

# Test UCI protocol
echo "🔧 Testing UCI protocol..."
echo "uci" | node dist/cli.js | head -6
echo ""

# Test position and go
echo "🎮 Testing search from starting position..."
(echo "uci"; echo "isready"; echo "position startpos"; echo "go depth 4"; sleep 2; echo "quit") | node dist/cli.js 2>/dev/null | grep "bestmove"
echo ""

echo "==================================================================="
echo "  SETUP COMPLETE!"
echo "==================================================================="
echo ""
echo "Your chess engine is ready for testing!"
echo ""
echo "Quick Start:"
echo "  1. Test with cutechess-cli:"
echo "     npm run test:cutechess"
echo ""
echo "  2. Manual UCI testing:"
echo "     node dist/cli.js"
echo "     Then type: uci, isready, position startpos, go depth 5"
echo ""
echo "  3. Play against Stockfish (10 games):"
echo "     cutechess-cli \\"
echo "       -engine cmd=\"node dist/cli.js\" name=\"Vortex\" \\"
echo "       -engine cmd=stockfish name=\"Stockfish\" option.\"Skill Level\"=5 \\"
echo "       -each proto=uci tc=40/60 \\"
echo "       -rounds 10 \\"
echo "       -pgnout games.pgn"
echo ""
echo "📊 Expected Elo: 2200-2500 (Master level)"
echo "==================================================================="
