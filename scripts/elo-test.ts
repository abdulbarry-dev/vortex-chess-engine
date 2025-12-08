/**
 * Elo Rating Test Script
 * Tests the engine's tactical strength and search performance
 */

import { Board } from '../src/core/Board';
import { GameState } from '../src/core/GameState';
import { Evaluator } from '../src/eval/Evaluator';
import { MoveGenerator } from '../src/move-generation/MoveGenerator';
import { SearchEngine } from '../src/search/SearchEngine';

interface TacticalTest {
  name: string;
  fen: string;
  expectedMove?: string;
  minDepth: number;
  description: string;
}

// Test positions from various Elo levels
const TACTICAL_POSITIONS: TacticalTest[] = [
  {
    name: "Beginner Mate in 1",
    fen: "3k4/R7/8/8/8/8/8/4K3 w - - 0 1",
    expectedMove: "a7a8",
    minDepth: 2,
    description: "~800 Elo: Simple back rank mate"
  },
  {
    name: "Fork Pattern",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    expectedMove: "f3g5",
    minDepth: 3,
    description: "~1200 Elo: Knight fork on f7"
  },
  {
    name: "Discovery Attack",
    fen: "r1bqr1k1/ppp2ppp/2n5/3p4/3P4/2PB1N2/PP3PPP/R1BQR1K1 w - - 0 10",
    minDepth: 4,
    description: "~1400 Elo: Discover check tactics"
  },
  {
    name: "Sacrifice for Attack",
    fen: "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 8",
    minDepth: 5,
    description: "~1600 Elo: Positional sacrifice"
  },
  {
    name: "Complex Combination",
    fen: "r1bqr1k1/1pp2pbp/p1np1np1/3Pp3/2P1P3/2N1BP2/PP1NB1PP/R2Q1RK1 w - - 0 11",
    minDepth: 6,
    description: "~1800 Elo: Multi-move combination"
  },
  {
    name: "Zugzwang Position",
    fen: "8/8/p1p5/1p5p/1P5p/8/PPP2K1p/4R1rk w - - 0 1",
    minDepth: 6,
    description: "~2000 Elo: Endgame zugzwang"
  },
  {
    name: "Defensive Resource",
    fen: "r2qkb1r/pb1n1p2/2p1pn1p/1p2N1pB/3P4/2N5/PPP2PPP/R2QR1K1 w kq - 0 12",
    minDepth: 7,
    description: "~2200 Elo: Find defensive counter-play"
  },
  {
    name: "Deep Tactical Shot",
    fen: "2rq1rk1/pb2bppp/1pn1pn2/2ppP3/3P4/1P1B1N1P/PBPN1PP1/R2Q1RK1 w - - 0 12",
    minDepth: 8,
    description: "~2400 Elo: Deep tactical sequence"
  }
];

interface PerformanceMetrics {
  depth: number;
  nodes: number;
  time: number;
  nps: number;
  bestMove: string;
  score: number;
}

async function testPosition(
  board: Board,
  state: GameState,
  generator: MoveGenerator,
  search: SearchEngine,
  test: TacticalTest
): Promise<PerformanceMetrics> {
  console.log(`\n🎯 Testing: ${test.name}`);
  console.log(`   Description: ${test.description}`);
  console.log(`   FEN: ${test.fen}`);
  
  const startTime = Date.now();
  const result = search.search(board, state, test.minDepth);
  const endTime = Date.now();
  
  const time = (endTime - startTime) / 1000;
  const nps = Math.floor(result.nodes / time);
  
  const metrics: PerformanceMetrics = {
    depth: result.depth,
    nodes: result.nodes,
    time,
    nps,
    bestMove: result.bestMove ? formatMove(result.bestMove) : "none",
    score: result.score
  };
  
  console.log(`   ✓ Depth: ${metrics.depth} | Nodes: ${metrics.nodes.toLocaleString()}`);
  console.log(`   ✓ Time: ${metrics.time.toFixed(2)}s | NPS: ${metrics.nps.toLocaleString()}`);
  console.log(`   ✓ Best Move: ${metrics.bestMove} | Score: ${(metrics.score / 100).toFixed(2)}`);
  
  if (test.expectedMove) {
    const found = metrics.bestMove === test.expectedMove;
    console.log(`   ${found ? '✅' : '❌'} Expected: ${test.expectedMove} ${found ? '(FOUND)' : '(MISSED)'}`);
  }
  
  return metrics;
}

function formatMove(move: any): string {
  const files = 'abcdefgh';
  const ranks = '12345678';
  const from = files[move.from % 8] + ranks[Math.floor(move.from / 8)];
  const to = files[move.to % 8] + ranks[Math.floor(move.to / 8)];
  return from + to;
}

async function runEloTest() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('   🏆 VORTEX CHESS ENGINE - ELO RATING TEST');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Initialize engine components
  const generator = new MoveGenerator();
  const evaluator = new Evaluator();
  const search = new SearchEngine(generator, evaluator);
  
  let totalNodes = 0;
  let totalTime = 0;
  let positionsSolved = 0;
  
  for (const test of TACTICAL_POSITIONS) {
    try {
      // TODO: Parse FEN and create board/state
      // For now, this is a template - you'll need to implement FEN parsing
      console.log(`\n⏭️  Skipping ${test.name} (FEN parser needed)`);
      
      // When you have FEN parser:
      // const { board, state } = parseFEN(test.fen);
      // const metrics = await testPosition(board, state, generator, search, test);
      // totalNodes += metrics.nodes;
      // totalTime += metrics.time;
      // if (test.expectedMove && metrics.bestMove === test.expectedMove) {
      //   positionsSolved++;
      // }
    } catch (error) {
      console.error(`   ❌ Error: ${error}`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('   📊 PERFORMANCE SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Nodes:     ${totalNodes.toLocaleString()}`);
  console.log(`Total Time:      ${totalTime.toFixed(2)}s`);
  console.log(`Average NPS:     ${Math.floor(totalNodes / totalTime).toLocaleString()}`);
  console.log(`Positions Solved: ${positionsSolved}/${TACTICAL_POSITIONS.length}`);
  
  // Estimate Elo based on positions solved
  const solveRate = positionsSolved / TACTICAL_POSITIONS.length;
  let estimatedElo = 1200;
  
  if (solveRate >= 0.875) estimatedElo = 2400;
  else if (solveRate >= 0.75) estimatedElo = 2200;
  else if (solveRate >= 0.625) estimatedElo = 2000;
  else if (solveRate >= 0.5) estimatedElo = 1800;
  else if (solveRate >= 0.375) estimatedElo = 1600;
  else if (solveRate >= 0.25) estimatedElo = 1400;
  else estimatedElo = 1200;
  
  console.log(`\n🎯 Estimated Elo: ~${estimatedElo}`);
  console.log('\n💡 Note: For accurate Elo rating, play against rated engines');
  console.log('   using tools like cutechess-cli or lichess-bot');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run the test
runEloTest().catch(console.error);
