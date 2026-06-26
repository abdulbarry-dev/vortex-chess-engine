/**
 * @file texel-tuning.ts
 * @description Automated Evaluation Tuning using Texel's Tuning Method
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { PIECE_VALUES } from '../src/constants/PieceValues';
import { EVALUATION_WEIGHTS, Evaluator } from '../src/evaluation/Evaluator';
import { PieceType } from '../src/core/Piece';
import { parseFen } from '../src/utils/FenParser';

const DATASET_URL = 'https://raw.githubusercontent.com/abdulbarry-dev/vortex-chess-engine/main/scripts/dataset.epd';
const DATASET_PATH = path.join(__dirname, 'dataset.epd');
const SAMPLE_DATASET = `
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 c9 "1/2-1/2";
rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1 c9 "1-0";
rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2 c9 "0-1";
r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3 c9 "1-0";
r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3 c9 "1/2-1/2";
r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3 c9 "1-0";
r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3 c9 "0-1";
r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3 c9 "1/2-1/2";
r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3 c9 "1-0";
r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3 c9 "0-1";
`.trim();

interface PositionData {
  fen: string;
  result: number; // 1.0 for White win, 0.5 for Draw, 0.0 for Black win
}

const K_CONSTANT = 1.13; // Often optimized, but ~1.13 is standard for chess evaluation tuning

function sigmoid(evalScore: number): number {
  return 1 / (1 + Math.pow(10, (-K_CONSTANT * evalScore) / 400));
}

function calculateMSE(positions: PositionData[], evaluator: Evaluator): number {
  let totalError = 0;
  for (const pos of positions) {
    const parsed = parseFen(pos.fen);
    if (!parsed) continue;

    const { board, state } = parsed;
    let evalScore = evaluator.evaluate(board, state);
    
    // Evaluation is relative to the side to move. We need it relative to White for the sigmoid.
    if (state.currentPlayer === -1) {
      evalScore = -evalScore;
    }

    const predicted = sigmoid(evalScore);
    const error = pos.result - predicted;
    totalError += error * error;
  }
  return totalError / positions.length;
}

async function downloadDataset(): Promise<void> {
  if (fs.existsSync(DATASET_PATH)) {
    return;
  }
  console.log('Creating sample dataset...');
  fs.writeFileSync(DATASET_PATH, SAMPLE_DATASET, 'utf8');
}

function parseDataset(filePath: string): PositionData[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const positions: PositionData[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    // Format: FEN c9 "RESULT";
    const parts = line.split(' c9 "');
    if (parts.length < 2) continue;
    
    const fen = parts[0]!;
    const resultStr = parts[1]!.replace('";', '').trim();
    
    let result = 0.5;
    if (resultStr === '1-0') result = 1.0;
    else if (resultStr === '0-1') result = 0.0;
    
    positions.push({ fen, result });
  }

  return positions;
}

async function main() {
  console.log('Starting Texel Tuning...');
  const args = process.argv.slice(2);
  const dataPath = args.length > 0 ? args[0] : DATASET_PATH;
  
  if (!fs.existsSync(dataPath)) {
    if (dataPath === DATASET_PATH) {
      await downloadDataset();
    } else {
      console.error(`Dataset file not found: ${dataPath}`);
      process.exit(1);
    }
  }
  
  const positions = parseDataset(dataPath);
  console.log(`Loaded ${positions.length} positions for tuning from ${dataPath}.`);

  const evaluator = new Evaluator();
  
  let bestMSE = calculateMSE(positions, evaluator);
  console.log(`Initial MSE: ${bestMSE.toFixed(6)}`);

  // Parameters we want to tune
  const paramsToTune = [
    { name: 'MATERIAL_PAWN', obj: PIECE_VALUES, key: PieceType.Pawn, step: 5 },
    { name: 'MATERIAL_KNIGHT', obj: PIECE_VALUES, key: PieceType.Knight, step: 10 },
    { name: 'MATERIAL_BISHOP', obj: PIECE_VALUES, key: PieceType.Bishop, step: 10 },
    { name: 'MATERIAL_ROOK', obj: PIECE_VALUES, key: PieceType.Rook, step: 10 },
    { name: 'MATERIAL_QUEEN', obj: PIECE_VALUES, key: PieceType.Queen, step: 20 },
    { name: 'WEIGHT_MATERIAL', obj: EVALUATION_WEIGHTS, key: 'MATERIAL', step: 0.1 },
    { name: 'WEIGHT_PIECE_SQUARE', obj: EVALUATION_WEIGHTS, key: 'PIECE_SQUARE', step: 0.1 },
    { name: 'WEIGHT_PAWN_STRUCTURE', obj: EVALUATION_WEIGHTS, key: 'PAWN_STRUCTURE', step: 0.1 },
    { name: 'WEIGHT_KING_SAFETY', obj: EVALUATION_WEIGHTS, key: 'KING_SAFETY', step: 0.1 },
    { name: 'WEIGHT_MOBILITY', obj: EVALUATION_WEIGHTS, key: 'MOBILITY', step: 0.1 },
    { name: 'WEIGHT_BLOCKADE', obj: EVALUATION_WEIGHTS, key: 'BLOCKADE', step: 0.1 },
    { name: 'WEIGHT_OVEREXTENSION', obj: EVALUATION_WEIGHTS, key: 'OVEREXTENSION', step: 0.1 },
    { name: 'WEIGHT_COORDINATION', obj: EVALUATION_WEIGHTS, key: 'COORDINATION', step: 0.1 },
  ];

  const iterations = 50; // Keep it small for demonstration
  console.log(`\nStarting local search optimization (${iterations} iterations)...`);

  for (let iter = 1; iter <= iterations; iter++) {
    let improved = false;
    
    for (const param of paramsToTune) {
      const originalValue = param.obj[param.key as any];
      
      // Try increasing
      param.obj[param.key as any] = originalValue + param.step;
      let newMSE = calculateMSE(positions, evaluator);
      if (newMSE < bestMSE) {
        bestMSE = newMSE;
        improved = true;
        console.log(`Iter ${iter}: ${param.name} increased to ${param.obj[param.key as any]} (MSE: ${bestMSE.toFixed(6)})`);
        continue;
      }
      
      // Try decreasing
      param.obj[param.key as any] = originalValue - param.step;
      newMSE = calculateMSE(positions, evaluator);
      if (newMSE < bestMSE) {
        bestMSE = newMSE;
        improved = true;
        console.log(`Iter ${iter}: ${param.name} decreased to ${param.obj[param.key as any]} (MSE: ${bestMSE.toFixed(6)})`);
        continue;
      }
      
      // Revert if no improvement
      param.obj[param.key as any] = originalValue;
    }
    
    if (!improved) {
      console.log(`Converged after ${iter} iterations.`);
      break;
    }
  }

  console.log('\n--- Final Tuned Parameters ---');
  console.log('Piece Values:', {
    Pawn: PIECE_VALUES[PieceType.Pawn],
    Knight: PIECE_VALUES[PieceType.Knight],
    Bishop: PIECE_VALUES[PieceType.Bishop],
    Rook: PIECE_VALUES[PieceType.Rook],
    Queen: PIECE_VALUES[PieceType.Queen]
  });
  console.log('Evaluation Weights:', EVALUATION_WEIGHTS);
  console.log(`Final MSE: ${bestMSE.toFixed(6)}`);
}

main().catch(console.error);
