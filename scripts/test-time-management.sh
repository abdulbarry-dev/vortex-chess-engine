#!/bin/bash
# Test time management behavior

echo "Testing time management with different time controls..."
echo ""

# Test 1: Simple time control
echo "Test 1: 60 seconds per side, no increment"
echo "Expected: Should use ~1-3 seconds per move"
(
  echo "uci"
  echo "isready"
  echo "position startpos"
  echo "go wtime 60000 btime 60000 winc 0 binc 0"
  sleep 5
  echo "quit"
) | timeout 10 ./dist/cli.js 2>&1 | grep -E "(bestmove|info depth)" | head -5

echo ""
echo "Test 2: Very short time control"
echo "Expected: Should use <500ms, depth 4 or less"
(
  echo "uci"
  echo "isready"
  echo "position startpos"
  echo "go wtime 5000 btime 5000 winc 0 binc 0"
  sleep 3
  echo "quit"
) | timeout 10 ./dist/cli.js 2>&1 | grep -E "(bestmove|info depth)" | head -5

echo ""
echo "Test 3: Fixed depth (no time management)"
echo "Expected: Should complete depth 5 search"
(
  echo "uci"
  echo "isready"
  echo "position startpos"
  echo "go depth 5"
  sleep 5
  echo "quit"
) | timeout 10 ./dist/cli.js 2>&1 | grep -E "(bestmove|info depth)" | head -5

echo ""
echo "✅ Time management tests complete"
