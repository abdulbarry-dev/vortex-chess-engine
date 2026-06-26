# Vortex Chess Engine

A high-performance TypeScript chess engine targeting a 1600-1700 Elo rating, featuring full Universal Chess Interface (UCI) protocol support. The engine is built upon a modular architecture emphasizing code clarity, type safety, and a unique defensive AI philosophy.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)

## Features

### Core Engine and Search Algorithms
- **Full UCI Protocol Support**: Fully compatible with standard chess GUIs including Arena Chess and Cutechess.
- **Alpha-Beta Pruning**: Implements highly efficient search tree traversal, reliably reaching 4-6 ply depth in standard time controls.
- **Iterative Deepening & Aspiration Windows**: Utilizes progressive depth searching. Aspiration windows drastically narrow the search space around the expected score, maximizing pruning efficiency and minimizing wasted nodes.
- **Transposition Table**: Implements Zobrist hashing for position caching, preventing redundant calculations of identical board states reached via different move orders.
- **Quiescence Search**: Extends the search depth during tactical sequences (captures and promotions) to mitigate the horizon effect.
- **Move Ordering**: Employs Move Value Victim - Least Valuable Attacker (MVV-LVA), killer move heuristics, and history heuristics to optimize alpha-beta cutoff rates.
- **Defensive Time Management**: Dynamically allocates extra computational time when the engine detects deep tactical threats or experiences sudden evaluation drops, ensuring resilience in complex positions.

### Defensive AI and Evaluation System
Vortex is specifically tuned to play resilient, prophylactic chess. Rather than maximizing aggressive attacking chances, the evaluation function heavily penalizes structural weaknesses.
- **Brittleness Detection**: Identifies and penalizes opponent overextension. For example, it detects and punishes unsupported flank pawn attacks (like early h4/h5 pushes) by recognizing the structural fragility they leave behind.
- **Fortress Recognition**: Grants significant structural bonuses for maintaining unbroken pawn shields, particularly around castled king positions. It evaluates pawn chain integrity and penalizes unnecessary pawn advances.
- **Central Strike Counter-attacks**: Dynamically shifts into counter-attack mode when the opponent overextends on the flanks. The engine heavily rewards central pawn breaks (d4/e4/d5/e5) and piece centralization in response to premature flank aggression.
- **Material Evaluation**: Utilizes standard, slightly modernized piece values (P=100, N=320, B=330, R=500, Q=900).
- **Piece-Square Tables & Mobility**: Applies granular position-based bonuses that reward piece activity, central control, and optimal development squares.

### Defensive Opening Book
Vortex features a curated, Zobrist-hash-based Defensive Opening Book. This guarantees that the engine avoids early tactical blunders and safely guides the game into a complex middlegame where its defensive heuristics can excel. Key repertoires include:
- **Caro-Kann Defense**: A hyper-solid response to 1. e4.
- **Berlin Defense**: Known as "The Berlin Wall," designed to neutralize aggressive White setups in the Ruy Lopez.
- **Slav Defense**: A rock-solid response to 1. d4.
- **Queen's Gambit Declined (Orthodox)**: A classical and extremely safe response to the Queen's Gambit.
- **French & Nimzo-Indian Defenses**: Providing flexible, structurally sound positional play.

### Performance metrics
- **Search Speed**: 50,000+ nodes per second under typical Node.js environments.
- **Smart Time Management**: Adaptive depth adjustments based on remaining clock time and move complexity.
- **Type-Safe Architecture**: Written entirely in strict TypeScript, minimizing runtime errors and improving codebase maintainability.

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/abdulbarry-dev/vortex-chess-engine.git
cd vortex-chess-engine

# Install dependencies
npm install

# Build the engine (compiles TypeScript and bundles the CLI)
npm run build:all
```

### Running the Engine

#### Command Line (UCI Mode)
```bash
npm start
```

Once the CLI is running, you can interact with the engine using standard UCI commands:
```
uci
isready
position startpos
go depth 5
quit
```

#### Integration with Chess GUIs

1. **Arena Chess GUI**:
   - Navigate to Engines -> Install New Engine.
   - Select the compiled `dist/cli.js` file.
   - Ensure "Node.js" is configured as the interpreter.

2. **Cutechess-CLI**:
   You can run automated engine matches using the provided shell script:
   ```bash
   cutechess-cli \
     -engine cmd="$PWD/run_vortex.sh" name="Vortex" \
     -engine cmd=stockfish name="Stockfish" \
     -each proto=uci tc=60 \
     -rounds 10
   ```

## Project Structure

```text
vortex-chess-engine/
├── src/
│   ├── cli.ts                      # Main UCI protocol implementation and event loop
│   ├── main.ts                     # Web Worker / Library entry point
│   │
│   ├── core/                       # Core board representation and state logic
│   ├── move-generation/            # Move generation (pawns, sliding pieces, legality checks)
│   ├── evaluation/                 # Position evaluation (Fortress, Brittleness, PSTs)
│   ├── search/                     # Search algorithms (AlphaBeta, Quiescence, Transposition)
│   ├── opening/                    # Zobrist-hashed Defensive Opening Book
│   ├── time/                       # Defensive Time Management and clock handling
│   ├── utils/                      # Utilities (FEN parsing, move notation)
│   └── constants/                  # Tunable engine parameters and weights
│
├── tests/                          # Comprehensive Vitest test suite
├── docs/research/                  # Defensive AI Research Knowledge Base
└── dist/                           # Compiled JavaScript output
```

## Testing and Validation

### Run the Test Suite
The engine includes a massive suite of unit and integration tests (nearly 800 tests covering game rules, move generation, and evaluation).
```bash
npm test
```

### Static Analysis
To run static type checking without emitting files:
```bash
npm run typecheck
```
This validates strict TypeScript compilation and ensures no unused variables or parameters exist in the codebase.

## Configuration

### Evaluation Weights

The engine's positional understanding and defensive personality can be tuned by modifying `src/types/Evaluation.types.ts` and the associated Evaluator classes. 

### Search Parameters

Search depth limits, safety margins, and time buffers are configured in `src/constants/SearchConstants.ts`:

```typescript
export const SEARCH_CONFIG = {
  maxDepth: 64,            // Absolute maximum search depth limit
  timeBuffer: 50,          // Time management safety margin (ms)
  defaultMovesToGo: 40,    // Assumed moves remaining until time control
};
```

## Performance Benchmarks

### Search Performance
- **Depth 4**: ~573ms, ~8,000 nodes searched
- **Depth 5**: ~2.5s, ~50,000 nodes searched
- **Depth 6**: ~12s, ~300,000 nodes searched

### Strength Estimation
- **Target Rating**: 1600-1700 Elo.
- **Playing Style**: Extremely solid, prophylactic, and counter-attacking. The engine frequently chooses structurally sound moves over highly tactical but risky variations.
- **Tactical Vision**: Reliably finds mate-in-2 and mate-in-3 combinations.
- **Opening Preparation**: Plays main-line defensive theory flawlessly up to ply 12, successfully avoiding early opening traps.

## Known Issues and Limitations

- **Endgame Tablebases**: Syzygy tablebases are not currently supported, which may result in sub-optimal conversions of drawn endgames.
- **Parallel Search**: The engine currently utilizes a single-threaded search implementation. Lazy SMP or similar parallelization is planned for future iterations.
- **Evaluation Tuning**: Automated parameter tuning (e.g., using Texel's Tuning Method) has not been run on the current evaluation weights.

## Contributing

Contributions to Vortex are welcome. Current areas of interest include:
- Expanding the defensive opening book lines.
- Implementing automated evaluation parameter tuning against a pool of ~1600 Elo engines.
- Implementing multi-threaded parallel search.

Please consult the markdown files within the `docs/research/` folder to understand the engine's unique defensive philosophy before proposing significant architectural changes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Chess Programming Wiki](https://www.chessprogramming.org/) - An invaluable resource for chess engine architecture.
- [Stockfish](https://stockfishchess.org/) - Utilized extensively as a benchmark opponent.
- [Cutechess](https://github.com/cutechess/cutechess) - Utilized for automated tournament management and engine testing.
