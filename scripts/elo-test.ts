/**
 * @file elo-test.ts
 * @description Benchmarks search performance (depths 4, 5, 6) on typical positions
 */

import { SearchEngine } from '../src/search/SearchEngine';
import { Evaluator } from '../src/evaluation/Evaluator';
import { MoveGenerator } from '../src/move-generation/MoveGenerator';
import { parseFen } from '../src/utils/FenParser';

const TEST_POSITIONS = [
  { name: 'Starting Position', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  { name: 'Kiwipete (Complex)', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1' },
  { name: 'Middlegame Tactical', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5' },
  { name: 'Endgame', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1' }
];

const TARGET_DEPTHS = [4, 5];

function formatNumber(num: number): string {
  return num.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
}

function runBenchmark(useNnue: boolean) {
  console.log(`\\n====================================`);
  console.log(`BENCHMARK: ${useNnue ? 'NNUE' : 'CLASSICAL'} EVALUATION`);
  console.log(`====================================\\n`);

  const evaluator = new Evaluator();
  evaluator.useNnue = useNnue;
  const moveGenerator = new MoveGenerator();
  const engine = new SearchEngine(evaluator, moveGenerator);
  
  let totalNodes = 0;
  let totalTimeMs = 0;

  for (const pos of TEST_POSITIONS) {
    console.log(`--- Position: ${pos.name} ---`);
    const parsed = parseFen(pos.fen);
    if (!parsed) {
      console.error('Failed to parse FEN:', pos.fen);
      continue;
    }

    for (const depth of TARGET_DEPTHS) {
      // Force engine to search exact depth by not using iterative deepening time limits
      // We configure the engine with standard limits
      const startTime = performance.now();
      const result = engine.findBestMove(parsed.board, parsed.state, depth, 60000);
      const elapsed = performance.now() - startTime;
      
      const nodes = result.stats.nodes;
      const nps = Math.floor(nodes / (elapsed / 1000));
      
      console.log(`Depth ${depth}: ${formatNumber(nodes)} nodes in ${elapsed.toFixed(2)}ms -> ${formatNumber(nps)} NPS`);
      
      if (depth === 5) { // Collect depth 5 stats for aggregate
        totalNodes += nodes;
        totalTimeMs += elapsed;
      }
    }
    console.log('');
  }

  const aggregateNps = Math.floor(totalNodes / (totalTimeMs / 1000));
  console.log(`Aggregate (Depth 5) NPS: ${formatNumber(aggregateNps)}`);
}

function main() {
  // Warm up V8
  console.log('Warming up engine...');
  const evaluator = new Evaluator();
  const moveGenerator = new MoveGenerator();
  const engine = new SearchEngine(evaluator, moveGenerator);
  const parsed = parseFen(TEST_POSITIONS[0]!.fen);
  if (parsed) engine.findBestMove(parsed.board, parsed.state, 3, 1000);

  runBenchmark(false);
  runBenchmark(true);
}

main();
