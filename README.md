# Vortex Chess Engine

A high-performance TypeScript chess engine targeting **1700 Elo strength** with full UCI protocol support. Built with a modular architecture emphasizing code clarity, type safety, and a unique **defensive AI philosophy**.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)

## 🎯 Features

### Core Engine & Search
- **Full UCI Protocol Support** - Compatible with chess GUIs (Arena, Cutechess, etc.)
- **Alpha-Beta Pruning** - Efficient search with 4-6 ply depth
- **Iterative Deepening & Aspiration Windows** - Progressive depth search that narrows search windows to drastically improve pruning efficiency.
- **Transposition Table** - Position caching with Zobrist hashing
- **Quiescence Search** - Tactical extension to prevent horizon effect
- **Move Ordering** - MVV-LVA, killer moves, and history heuristics
- **Defensive Time Management** - Allocates extra time when facing deep tactical threats or sudden evaluation drops.

### Defensive AI & Evaluation System
Vortex is specifically tuned to play resilient, prophylactic chess.
- **Brittleness Detection** - Identifies and penalizes opponent overextension (e.g., unsupported flank pawn attacks like early h4/h5 pushes).
- **Fortress Recognition** - Grants structural bonuses for maintaining unbroken pawn shields and solid castled positions.
- **Central Strike Counter-attacks** - Dynamically shifts into counter-attack mode, heavily rewarding central breaks (d4/e4/d5/e5) when the opponent overextends on the flanks.
- **Material Evaluation** - Standard piece values (P=100, N=320, B=330, R=500, Q=900)
- **Piece-Square Tables & Mobility** - Position-based bonuses and piece activity assessment.

### Opening Book
Vortex features a curated **Defensive Opening Book** that avoids early blunders and safely guides the engine into the middlegame. Key repertoires include:
- **Caro-Kann Defense**
- **Berlin Defense ("The Berlin Wall")**
- **Slav Defense**
- **Queen's Gambit Declined (Orthodox)**
- **French & Nimzo-Indian Defenses**

### Performance
- **50,000+ nodes/second** - Efficient move generation and evaluation
- **Smart Time Management** - Adaptive depth based on remaining time
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
     -engine cmd="$PWD/run_vortex.sh" name="Vortex" \
     -engine cmd=stockfish name="Stockfish" \
     -each proto=uci tc=60 \
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
│   ├── move-generation/            # Move generation
│   ├── evaluation/                 # Position evaluation (Fortress, Brittleness, etc.)
│   ├── search/                     # Search algorithms (AlphaBeta, AspirationWindows)
│   ├── opening/                    # Defensive Opening Book
│   ├── time/                       # Defensive Time Management
│   ├── utils/                      # Utilities
│   └── constants/                  # Configuration
│
├── tests/                          # Test suite (Vitest)
├── docs/research/                  # Defensive AI Research Knowledge Base
└── dist/                           # Compiled output
```

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Self-Test (No External Dependencies)
```bash
npm run typecheck
```

Validates:
- ✅ Strict TypeScript compilation
- ✅ Catching unused variables/parameters

## ⚙️ Configuration

### Evaluation Weights

Edit `src/types/Evaluation.types.ts` to adjust the defensive personality weights.

### Search Parameters

Edit `src/constants/SearchConstants.ts`:

```typescript
export const SEARCH_CONFIG = {
  maxDepth: 64,            // Maximum search depth
  timeBuffer: 50,          // Safety margin (ms)
  defaultMovesToGo: 40,    // Moves until time control
};
```

## 📊 Performance Benchmarks

### Search Performance
- **Depth 4**: ~573ms, ~8,000 nodes
- **Depth 5**: ~2-3s, ~50,000 nodes
- **Depth 6**: ~10-15s, ~300,000 nodes

### Strength Estimation
- **Target**: ~1600-1700 Elo
- **Style**: Extremely solid, prophylactic, counter-attacking.
- **Tactical**: Finds mate-in-2/3 reliably
- **Opening**: Plays main-line defensive theory up to ply 12.

## 🐛 Known Issues & Limitations

- Endgame tablebases not fully integrated.
- Limited parallel search (single-threaded).
- Evaluation tuning is an ongoing process.

## 🤝 Contributing

Contributions welcome! Areas of interest:
- Expanding the defensive opening book
- Evaluation parameter tuning against other ~1600 engines
- Implementing parallel search (Lazy SMP)

Please consult the `docs/research/` folder to understand the engine's defensive philosophy before making architectural changes.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Chess Programming Wiki](https://www.chessprogramming.org/) - Invaluable resource
- [Stockfish](https://stockfishchess.org/) - Testing opponent
- [Cutechess-CLI](https://github.com/cutechess/cutechess) - Tournament management
