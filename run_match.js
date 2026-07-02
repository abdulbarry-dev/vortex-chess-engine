import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';

const STOCKFISH_CMD = './stockfish-bin';
const VORTEX_CMD = 'node';
const VORTEX_ARGS = ['dist/cli.js'];
const TC = { time: 60, increment: 0 }; // 40/60 ≈ 1min + 0
const NUM_GAMES = 3;

class UciEngine {
  constructor(cmd, args = []) {
    this.cmd = cmd;
    this.args = args;
    this.proc = null;
    this.readline = null;
    this.buffer = [];
    this.resolvers = {};
    this.cmdId = 0;
    this.ready = false;
  }

  async start() {
    this.proc = spawn(this.cmd, this.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.readline = createInterface({ input: this.proc.stdout, crlfDelay: Infinity });

    const lines = [];
    this.readline.on('line', (line) => {
      lines.push(line);
      if (line === 'uciok') this._resolve('uci', lines);
      else if (line === 'readyok') this._resolve('isready', lines);
      else if (line.startsWith('bestmove')) this._resolve('bestmove', lines);
      else if (line.startsWith('info')) { /* ignore */ }
    });

    this.send('uci');
    await this._wait('uci', 10000);
    this.send('isready');
    await this._wait('isready', 5000);
    this.ready = true;
  }

  send(cmd) {
    this.proc.stdin.write(cmd + '\n');
  }

  _resolve(key, data) {
    if (this.resolvers[key]) {
      this.resolvers[key](data);
      delete this.resolvers[key];
    }
  }

  _wait(key, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        delete this.resolvers[key];
        reject(new Error(`Timeout waiting for ${key}`));
      }, timeout);
      this.resolvers[key] = (data) => {
        clearTimeout(timer);
        resolve(data);
      };
    });
  }

  async setPosition(fen) {
    this.send(`position fen ${fen}`);
  }

  async setPositionStart() {
    this.send('position startpos');
  }

  async go(movestogo, wtime, btime, winc = 0, binc = 0) {
    this.send(`go movestogo ${movestogo} wtime ${wtime} btime ${btime} winc ${winc} binc ${binc}`);
    const lines = await this._wait('bestmove', 300000);
    const bestLine = lines.find(l => l.startsWith('bestmove'));
    if (!bestLine) return null;
    const parts = bestLine.split(' ');
    return parts[1] === '(none)' ? null : parts[1];
  }

  async stop() {
    this.send('stop');
  }

  quit() {
    try { this.send('quit'); } catch {}
    try { this.proc.kill(); } catch {}
  }
}

function formatGame(pgnMoves, result, whiteName, blackName) {
  const date = new Date().toISOString().split('T')[0];
  return `[Event "Vortex vs Stockfish Match"]
[Date "${date}"]
[White "${whiteName}"]
[Black "${blackName}"]
[Result "${result}"]
[TimeControl "40/60"]

${pgnMoves} ${result}\n\n`;
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

async function playGame(gameNum, vortexIsWhite) {
  const whiteName = vortexIsWhite ? 'Vortex' : 'Stockfish';
  const blackName = vortexIsWhite ? 'Stockfish' : 'Vortex';

  console.log(`\n=== Game ${gameNum}: ${whiteName} vs ${blackName} ===`);

  const vortex = new UciEngine(VORTEX_CMD, VORTEX_ARGS);
  const stockfish = new UciEngine(STOCKFISH_CMD);

  await vortex.start();
  await stockfish.start();

  await vortex.setPositionStart();
  await stockfish.setPositionStart();

  const moves = [];
  let fen = START_FEN;
  let wtime = 60000, btime = 60000;
  let result = '*';
  let gameOver = false;

  // Simple move counter for time management
  let moveCount = 0;

  while (!gameOver) {
    const isWhiteTurn = fen.split(' ')[1] === 'w';
    const engineIsWhite = vortexIsWhite;

    // Determine which engine plays
    const currentEngine = (isWhiteTurn === engineIsWhite) ? vortex : stockfish;
    const name = (isWhiteTurn === engineIsWhite) ? whiteName : blackName;

    const movesDone = moveCount;
    const movestogo = Math.max(1, 40 - movesDone);

    const wt = isWhiteTurn ? wtime : wtime;
    const bt = isWhiteTurn ? btime : btime;

    try {
      const move = await currentEngine.go(movestogo, wtime, btime, 0, 0);
      if (!move) {
        console.log(`  ${name}: no move (game over)`);
        gameOver = true;
        break;
      }

      moves.push(move);
      moveCount++;
      console.log(`  ${moveCount}. ${move} (${name})`);

      // Update FEN via a simple proxy - push move to both engines
      vortex.send(`position startpos moves ${moves.join(' ')}`);
      stockfish.send(`position startpos moves ${moves.join(' ')}`);

      // Simple time deduction
      if (isWhiteTurn) wtime -= 500;
      else btime -= 500;
      if (wtime <= 0 || btime <= 0) {
        console.log('  Time forfeit');
        gameOver = true;
        result = wtime <= 0 ? '0-1' : '1-0';
        break;
      }

    } catch (err) {
      console.log(`  Error from ${name}: ${err.message}`);
      gameOver = true;
      break;
    }
  }

  vortex.quit();
  stockfish.quit();

  const pgnMoves = moves.join(' ');
  return formatGame(pgnMoves, result, whiteName, blackName);
}

async function main() {
  console.log('=== Vortex vs Stockfish Match ===');
  console.log(`Time control: 40/60 (${NUM_GAMES} games)`);
  console.log('================================\n');

  const allPgns = [];

  for (let i = 1; i <= NUM_GAMES; i++) {
    const vortexIsWhite = (i % 2 === 1); // alternate
    const pgn = await playGame(i, vortexIsWhite);
    allPgns.push(pgn);
    console.log(`\nGame ${i} finished.`);
  }

  const output = allPgns.join('');
  writeFileSync('stockfish_match_3.pgn', output);
  console.log(`\nAll games complete. Results saved to stockfish_match_3.pgn`);
  console.log(output);
}

main().catch(console.error);
