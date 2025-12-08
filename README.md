# Vortex Chess Engine

A high-performance TypeScript chess engine targeting **1600 Elo strength** with full UCI protocol support. Built with a modular architecture emphasizing code clarity, type safety, and competitive play.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)

## 🎯 Features

### Core Engine
- **Full UCI Protocol Support** - Compatible with chess GUIs (Arena, Cutechess, etc.)
- **Alpha-Beta Pruning** - Efficient search with 4-6 ply depth
- **Iterative Deepening** - Progressive depth search for optimal move ordering
- **Transposition Table** - Position caching with Zobrist hashing
- **Quiescence Search** - Tactical extension to prevent horizon effect
- **Move Ordering** - MVV-LVA, killer moves, and history heuristics

### Evaluation System
- **Material Evaluation** - Standard piece values (P=100, N=320, B=330, R=500, Q=900)
- **Piece-Square Tables** - Position-based bonuses for all piece types
- **Pawn Structure** - Doubled, isolated, and passed pawn detection
- **King Safety** - Pawn shield and attack zone analysis
- **Mobility Evaluation** - Piece activity and control assessment
- **Endgame Detection** - Phase-aware evaluation tuning

### Performance
- **50,000+ nodes/second** - Efficient move generation and evaluation
- **Smart Time Management** - Adaptive depth based on remaining time
- **Optimized Legality Checking** - Early exits and caching for speed
- **Type-Safe Architecture** - Full TypeScript with strict mode

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/abdulbarry-dev/vortex-chess-engine.git
cd vortex-chess-engine

# Install dependencies
npm install

# Build the engine
npm run build:all
```

### Running the Engine

#### Command Line (UCI Mode)
```bash
npm start
```

Then enter UCI commands:
```
uci
isready
position startpos
go depth 5
quit
```

#### With Chess GUI

1. **Arena Chess GUI**:
   - Engines → Install New Engine
   - Select `dist/cli.js`
   - Choose "Node.js" as interpreter

2. **Cutechess-CLI**:
   ```bash
   cutechess-cli \
     -engine cmd="$PWD/dist/cli.js" name="Vortex" \
     -engine cmd=stockfish name="Stockfish" \
     -each proto=uci tc=40/60 \
     -rounds 10
   ```

## 📦 Project Structure

```
vortex-chess-engine/
├── src/
│   ├── cli.ts                      # UCI protocol implementation
│   ├── main.ts                     # Library entry point
│   │
│   ├── core/                       # Board representation
│   │   ├── Board.ts               # Board state management
│   │   ├── GameState.ts           # Game state (castling, en passant, etc.)
│   │   ├── Move.ts                # Move representation
│   │   ├── Piece.ts               # Piece types and utilities
│   │   └── Square.ts              # Square utilities
│   │
│   ├── move-generation/            # Move generation
│   │   ├── MoveGenerator.ts       # Main coordinator
│   │   ├── PawnMoves.ts           # Pawn move generation
│   │   ├── KnightMoves.ts         # Knight moves
│   │   ├── BishopMoves.ts         # Bishop moves
│   │   ├── RookMoves.ts           # Rook moves
│   │   ├── QueenMoves.ts          # Queen moves
│   │   ├── KingMoves.ts           # King moves
│   │   ├── SlidingMoves.ts        # Shared sliding logic
│   │   ├── LegalityChecker.ts     # Legal move validation
│   │   └── AttackDetector.ts      # Square attack detection
│   │
│   ├── evaluation/                 # Position evaluation
│   │   ├── Evaluator.ts           # Main evaluator coordinator
│   │   ├── MaterialEvaluator.ts   # Material counting
│   │   ├── PieceSquareTables.ts   # Position bonuses
│   │   ├── PawnStructure.ts       # Pawn structure analysis
│   │   ├── KingSafety.ts          # King safety evaluation
│   │   └── MobilityEvaluator.ts   # Mobility assessment
│   │
│   ├── search/                     # Search algorithms
│   │   ├── SearchEngine.ts        # Main search coordinator
│   │   ├── AlphaBeta.ts           # Alpha-beta pruning
│   │   ├── MoveOrdering.ts        # Move ordering heuristics
│   │   ├── TranspositionTable.ts  # Position cache
│   │   ├── QuiescenceSearch.ts    # Tactical search
│   │   └── IterativeDeepening.ts  # Iterative framework
│   │
│   ├── utils/                      # Utilities
│   │   ├── FenParser.ts           # FEN parsing
│   │   ├── FenGenerator.ts        # FEN generation
│   │   ├── MoveNotation.ts        # Algebraic notation
│   │   ├── ZobristHashing.ts      # Position hashing
│   │   └── PerftTester.ts         # Move gen testing
│   │
│   └── constants/                  # Configuration
│       ├── PieceValues.ts         # Material values
│       └── EvaluationWeights.ts   # Tunable parameters
│
├── tests/                          # Test suite
│   └── setup.test.ts              # Test configuration
│
├── scripts/                        # Helper scripts
│   ├── self-test.sh               # Engine validation
│   ├── test-time-management.sh    # Time control testing
│   └── elo-test.ts                # Performance benchmarks
│
└── dist/                           # Compiled output
    ├── cli.js                     # UCI executable
    └── vortex-engine.iife.js      # Library bundle
```

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Self-Test (No External Dependencies)
```bash
npm run test:self
```

Validates:
- ✅ UCI protocol commands
- ✅ Position setup and FEN parsing
- ✅ Move generation correctness
- ✅ Tactical positions (mate in N)
- ✅ Performance benchmarks

### Tournament Testing
```bash
npm run test:cutechess
```

Runs 10 games vs Stockfish (Skill Level 5) at 40/60 time control.

### Performance Testing
```bash
npm run test:performance
```

Runs depth tests and nodes-per-second benchmarks.

## 🎮 Usage Examples

### As a Library

```typescript
import { ChessEngine } from 'vortex-chess-engine';

// Initialize engine
const engine = new ChessEngine();

// Set position
engine.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

// Search for best move
const result = engine.search({ depth: 5 });
console.log(`Best move: ${result.bestMove}`);
console.log(`Score: ${result.score} centipawns`);
console.log(`Nodes searched: ${result.nodes}`);
```

### UCI Commands

```bash
# Start engine
npm start

# UCI Protocol
> uci
id name Vortex Chess Engine v1.0.0
id author Vortex Team
option name Hash type spin default 64 min 1 max 1024
uciok

> isready
readyok

> position startpos moves e2e4 e7e5
> go depth 6
info depth 1 score cp 0 nodes 20 time 1
info depth 2 score cp 10 nodes 120 time 5
...
bestmove g1f3

> quit
```

## ⚙️ Configuration

### Evaluation Weights

Edit `src/constants/EvaluationWeights.ts`:

```typescript
export const EVALUATION_WEIGHTS = {
  material: 1.0,           // Material value weight
  pieceSquare: 0.5,        // Piece-square table weight
  pawnStructure: 0.3,      // Pawn structure weight
  kingSafety: 0.4,         // King safety weight
  mobility: 0.2,           // Mobility weight
};
```

### Search Parameters

Edit `src/constants/SearchConstants.ts`:

```typescript
export const SEARCH_CONFIG = {
  maxDepth: 64,            // Maximum search depth
  timeBuffer: 50,          // Safety margin (ms)
  defaultMovesToGo: 40,    // Moves until time control
};
```

## 🔧 Development

### Build Options

```bash
# Development build with watch mode
npm run dev

# Production build (library + CLI)
npm run build:all

# Build CLI only
npm run build:cli

# Type checking
npm run typecheck
```

### Code Style

- **Modularity First** - One logical component per file
- **Type Safety** - Strict TypeScript with explicit types
- **Clear Naming** - Descriptive variable and function names
- **Performance Aware** - Profile before optimizing

See `.github/copilot-instructions.md` for detailed development guidelines.

## 📊 Performance Benchmarks

### Search Performance
- **Depth 4**: ~573ms, ~8,000 nodes
- **Depth 5**: ~2-3s, ~50,000 nodes
- **Depth 6**: ~10-15s, ~300,000 nodes

### Time Management
- **40/60 control**: ~1.5s per move average
- **Adaptive depth**: 2-6 ply based on time
- **Safety margin**: 50ms buffer prevents timeouts

### Strength Estimation
- **Target**: 1600 Elo
- **Tactical**: Finds mate-in-2/3 reliably
- **Strategic**: Basic positional understanding

## 🐛 Known Issues & Limitations

- Opening book not yet implemented
- Endgame tablebases not supported
- Limited parallel search (single-threaded)
- Evaluation tuning ongoing

## 🤝 Contributing

Contributions welcome! Areas of interest:
- Opening book integration
- Evaluation parameter tuning
- Performance optimizations
- Bug fixes and testing

Please follow the modular architecture guidelines in `.github/copilot-instructions.md`.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Chess Programming Wiki](https://www.chessprogramming.org/) - Invaluable resource
- [Stockfish](https://stockfishchess.org/) - Testing opponent
- [Cutechess-CLI](https://github.com/cutechess/cutechess) - Tournament management

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/abdulbarry-dev/vortex-chess-engine/issues)
- **Documentation**: See `IMPROVEMENTS_SUMMARY.md` for recent fixes

---

**Made with ♟️ by the Vortex Team**
