# Chess Engine Development Guide for GitHub Copilot

## Project Overview

You are assisting in the development of a TypeScript-based chess engine targeting approximately **1600 Elo strength**. This strength level requires solid fundamentals: efficient move generation, reliable search with alpha-beta pruning (4-6 ply depth), basic position evaluation, and standard optimizations.

## Core Principles

### 1. Modularity First
- **One logical component per file**
- Each file should have a single, clear responsibility
- Avoid files exceeding 200-250 lines of code
- Split large classes into smaller, focused modules

### 2. Type Safety
- Use strict TypeScript settings (`strict: true`)
- Define explicit types for all function parameters and returns
- Use enums for piece types, colors, and flags
- Create type aliases for domain concepts (e.g., `Square`, `Bitboard`)

### 3. Performance Awareness
- Minimize object allocations in search loops
- Use make/unmake pattern instead of board copying
- Pre-compute lookup tables where beneficial
- Profile before optimizing

### 4. Clear Naming
- Use descriptive variable and function names
- Avoid abbreviations except for well-known terms (e.g., `ply`, `FEN`)
- Prefer `generateKnightMoves` over `genKnMoves`

---

## Project Structure

```
src/
├── core/
│   ├── Board.ts                    # Board state management
│   ├── Piece.ts                    # Piece type definitions and enums
│   ├── Square.ts                   # Square utilities and types
│   ├── Move.ts                     # Move representation and types
│   └── GameState.ts                # Overall game state (turn, castling, etc.)
│
├── move-generation/
│   ├── MoveGenerator.ts            # Main move generation coordinator
│   ├── PawnMoves.ts                # Pawn-specific move generation
│   ├── KnightMoves.ts              # Knight move generation
│   ├── BishopMoves.ts              # Bishop move generation
│   ├── RookMoves.ts                # Rook move generation
│   ├── QueenMoves.ts               # Queen move generation
│   ├── KingMoves.ts                # King move generation
│   ├── SlidingMoves.ts             # Shared sliding piece logic
│   ├── LegalityChecker.ts          # Legal move validation
│   └── AttackDetector.ts           # Square attack detection
│
├── evaluation/
│   ├── Evaluator.ts                # Main evaluation coordinator
│   ├── MaterialEvaluator.ts        # Piece material counting
│   ├── PieceSquareTables.ts        # Position-based piece bonuses
│   ├── PawnStructure.ts            # Pawn structure evaluation
│   ├── KingSafety.ts               # King safety evaluation
│   ├── MobilityEvaluator.ts        # Piece mobility scoring
│   └── EvaluationWeights.ts        # Tunable evaluation parameters
│
├── search/
│   ├── SearchEngine.ts             # Main search coordinator
│   ├── AlphaBeta.ts                # Alpha-beta pruning algorithm
│   ├── MoveOrdering.ts             # Move ordering heuristics
│   ├── TranspositionTable.ts       # Position caching
│   ├── QuiescenceSearch.ts         # Tactical search extension
│   ├── IterativeDeepening.ts       # Iterative deepening framework
│   └── SearchInfo.ts               # Search statistics and info
│
├── utils/
│   ├── FenParser.ts                # FEN string parsing
│   ├── FenGenerator.ts             # FEN string generation
│   ├── MoveNotation.ts             # Algebraic notation handling
│   ├── ZobristHashing.ts           # Position hashing
│   ├── PerftTester.ts              # Move generation testing
│   └── BitboardUtils.ts            # Bitboard helper functions
│
├── engine/
│   ├── ChessEngine.ts              # Main engine interface
│   ├── EngineConfig.ts             # Engine configuration
│   └── UCI.ts                      # UCI protocol implementation (optional)
│
├── constants/
│   ├── PieceValues.ts              # Standard piece values
│   ├── SearchConstants.ts          # Search-related constants
│   └── BoardConstants.ts           # Board dimensions and masks
│
└── types/
    ├── index.ts                    # Central type exports
    ├── Board.types.ts              # Board-related types
    ├── Move.types.ts               # Move-related types
    ├── Search.types.ts             # Search-related types
    └── Evaluation.types.ts         # Evaluation-related types
```

---

## Module-Specific Guidelines

### Core Modules (`src/core/`)

#### Board.ts
- Manages the board state using either:
  - **8x8 array representation** (simpler, good for 1600 Elo)
  - **Bitboard representation** (faster, more complex)
- Provides `getPiece()`, `setPiece()`, `movePiece()` methods
- Handles board initialization and cloning if needed
- **Keep under 200 lines**

```typescript
// Example structure
export class Board {
  private squares: Piece[];
  
  constructor();
  getPiece(square: Square): Piece;
  setPiece(square: Square, piece: Piece): void;
  isEmpty(square: Square): boolean;
  isOccupiedBy(square: Square, color: Color): boolean;
  clone(): Board; // Only if not using make/unmake
}
```

#### Piece.ts
- Define piece types using enums
- Provide utility functions for piece queries
- **Keep under 100 lines**

```typescript
export enum PieceType {
  Pawn = 1,
  Knight = 2,
  Bishop = 3,
  Rook = 4,
  Queen = 5,
  King = 6
}

export enum Color {
  White = 1,
  Black = -1
}

export interface Piece {
  type: PieceType;
  color: Color;
}

export function isSliding(piece: Piece): boolean;
export function getPieceChar(piece: Piece): string;
```

#### Move.ts
- Define move structure with all necessary flags
- Include move construction utilities
- **Keep under 150 lines**

```typescript
export interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  captured?: Piece;
  promotion?: PieceType;
  flags: MoveFlags;
}

export enum MoveFlags {
  None = 0,
  Capture = 1 << 0,
  Castle = 1 << 1,
  EnPassant = 1 << 2,
  Promotion = 1 << 3,
  DoublePawnPush = 1 << 4
}
```

#### GameState.ts
- Track game state beyond board position
- Manage castling rights, en passant, fifty-move rule, move history
- **Keep under 200 lines**

```typescript
export class GameState {
  currentPlayer: Color;
  castlingRights: CastlingRights;
  enPassantSquare: Square | null;
  halfmoveClock: number;
  fullmoveNumber: number;
  moveHistory: Move[];
}
```

### Move Generation (`src/move-generation/`)

**Split each piece type into its own file** to keep logic clear and testable.

#### General Guidelines:
- Each piece file generates pseudo-legal moves for that piece
- `LegalityChecker.ts` filters out moves that leave king in check
- `AttackDetector.ts` determines if squares are under attack
- Generate moves into a pre-allocated array when possible (performance)
- **Each file should be 100-200 lines**

#### MoveGenerator.ts
- Coordinates all piece-specific generators
- Main entry point: `generateLegalMoves(board, gameState): Move[]`
- Delegates to piece-specific modules

```typescript
export class MoveGenerator {
  constructor(
    private pawnMoves: PawnMoveGenerator,
    private knightMoves: KnightMoveGenerator,
    // ... other generators
    private legalityChecker: LegalityChecker
  ) {}
  
  generateLegalMoves(board: Board, state: GameState): Move[];
  generateCaptures(board: Board, state: GameState): Move[];
}
```

#### Piece-Specific Files (e.g., KnightMoves.ts)
```typescript
export class KnightMoveGenerator {
  private readonly KNIGHT_OFFSETS = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1]
  ];
  
  generate(board: Board, square: Square, moves: Move[]): void;
}
```

#### SlidingMoves.ts
- Shared logic for bishops, rooks, queens
- Ray-based move generation
- **Keep under 150 lines**

```typescript
export class SlidingMoveGenerator {
  generateRay(
    board: Board,
    from: Square,
    direction: Direction,
    moves: Move[]
  ): void;
}
```

### Evaluation (`src/evaluation/`)

For 1600 Elo, focus on:
1. Material counting (most important)
2. Piece-square tables (significant impact)
3. Basic pawn structure (doubled, isolated, passed pawns)
4. Simple king safety
5. Piece mobility (optional but helpful)

#### Evaluator.ts
- Coordinates all evaluation components
- Returns a score in centipawns (positive = white advantage)
- **Keep under 150 lines**

```typescript
export class Evaluator {
  constructor(
    private material: MaterialEvaluator,
    private pieceSquares: PieceSquareEvaluator,
    private pawnStructure: PawnStructureEvaluator,
    private kingSafety: KingSafetyEvaluator,
    private weights: EvaluationWeights
  ) {}
  
  evaluate(board: Board, state: GameState): number;
}
```

#### MaterialEvaluator.ts
- Count piece values
- Standard values: P=100, N=320, B=330, R=500, Q=900
- **Keep under 80 lines**

#### PieceSquareTables.ts
- Define tables for each piece type
- Separate tables for opening/middlegame and endgame
- **Keep under 250 lines** (tables are verbose)

```typescript
export class PieceSquareEvaluator {
  private readonly PAWN_TABLE: number[];
  private readonly KNIGHT_TABLE: number[];
  // ... other tables
  
  evaluate(board: Board): number;
}
```

#### PawnStructure.ts
- Evaluate doubled, isolated, and passed pawns
- Simple implementation for 1600 Elo
- **Keep under 150 lines**

#### KingSafety.ts
- Basic king safety: pawn shield, open files near king
- Don't overcomplicate for 1600 Elo target
- **Keep under 120 lines**

### Search (`src/search/`)

For 1600 Elo, implement:
1. Alpha-beta pruning (essential)
2. Iterative deepening (essential)
3. Move ordering (essential)
4. Transposition table (significant improvement)
5. Quiescence search (prevents horizon effect)

#### SearchEngine.ts
- Main interface to the search
- Manages time control and search parameters
- **Keep under 180 lines**

```typescript
export class SearchEngine {
  constructor(
    private alphaBeta: AlphaBetaSearch,
    private moveOrdering: MoveOrderer,
    private transpositionTable: TranspositionTable,
    private quiescence: QuiescenceSearch
  ) {}
  
  findBestMove(
    board: Board,
    state: GameState,
    depth: number
  ): SearchResult;
}
```

#### AlphaBeta.ts
- Core alpha-beta pruning algorithm
- Use negamax variant for cleaner code
- Track node count and statistics
- **Keep under 200 lines**

```typescript
export class AlphaBetaSearch {
  search(
    board: Board,
    depth: number,
    alpha: number,
    beta: number,
    color: Color
  ): number;
  
  searchRoot(
    board: Board,
    depth: number
  ): { move: Move; score: number };
}
```

#### MoveOrdering.ts
- Implement MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
- Consider promotions and castling
- Add killer moves for 1600+ Elo
- **Keep under 150 lines**

```typescript
export class MoveOrderer {
  orderMoves(moves: Move[], board: Board): Move[];
  scoreMove(move: Move): number;
}
```

#### TranspositionTable.ts
- Hash table for position caching
- Store depth, score, best move, and node type
- Use Zobrist hashing for keys
- **Keep under 200 lines**

```typescript
export interface TTEntry {
  zobristKey: bigint;
  depth: number;
  score: number;
  flag: 'exact' | 'lowerbound' | 'upperbound';
  bestMove?: Move;
  age: number;
}

export class TranspositionTable {
  store(key: bigint, entry: TTEntry): void;
  probe(key: bigint): TTEntry | null;
  clear(): void;
}
```

#### QuiescenceSearch.ts
- Search only captures and checks until quiet
- Prevents horizon effect
- Essential for tactical strength
- **Keep under 150 lines**

#### IterativeDeepening.ts
- Search progressively deeper (1-ply, 2-ply, 3-ply, etc.)
- Improves move ordering through PV (principal variation)
- Allows time management
- **Keep under 120 lines**

### Utilities (`src/utils/`)

#### FenParser.ts & FenGenerator.ts
- Parse and generate FEN strings
- Critical for testing and initialization
- **Each under 150 lines**

#### ZobristHashing.ts
- Pre-compute random values for each piece on each square
- Incrementally update hash during make/unmake
- **Keep under 150 lines**

```typescript
export class ZobristHasher {
  private pieceKeys: bigint[][][];
  private castlingKeys: bigint[];
  private enPassantKeys: bigint[];
  private sideKey: bigint;
  
  computeHash(board: Board, state: GameState): bigint;
  updateHash(hash: bigint, move: Move): bigint;
}
```

#### PerftTester.ts
- Performance testing for move generation
- Essential for debugging
- **Keep under 100 lines**

```typescript
export class PerftTester {
  perft(board: Board, depth: number): number;
  divide(board: Board, depth: number): Map<string, number>;
}
```

---

## Code Generation Guidelines for Copilot

### When Generating New Files:

1. **Start with imports and types**
   ```typescript
   import { Board } from '../core/Board';
   import { Move, MoveFlags } from '../core/Move';
   import { Square } from '../core/Square';
   ```

2. **Add clear class/function documentation**
   ```typescript
   /**
    * Generates all legal knight moves for a given position.
    * Knights move in an L-shape: 2 squares in one direction, 1 in perpendicular.
    */
   export class KnightMoveGenerator {
   ```

3. **Keep functions focused and small**
   - Each function should do one thing
   - Prefer 20-40 lines per function
   - Extract complex logic into helper functions

4. **Use descriptive variable names**
   ```typescript
   // Good
   const targetSquare = fromSquare + offset;
   const capturedPiece = board.getPiece(targetSquare);
   
   // Avoid
   const ts = fs + o;
   const cp = b.gp(ts);
   ```

5. **Add inline comments for complex logic**
   ```typescript
   // Check if knight move wraps around board edge
   if (Math.abs(fromFile - targetFile) > 2) continue;
   ```

### When Expanding Existing Files:

1. **Follow existing patterns in the file**
2. **Don't exceed 250 lines** - suggest splitting if needed
3. **Maintain consistent formatting and style**
4. **Add to existing sections logically**

### When Implementing Algorithms:

1. **Start with the simplest correct implementation**
2. **Add optimizations only after profiling**
3. **Include references for complex algorithms**
   ```typescript
   /**
    * Alpha-beta pruning with negamax framework.
    * Based on: https://www.chessprogramming.org/Alpha-Beta
    */
   ```

### Testing Guidelines:

1. **Create test files parallel to source**
   ```
   src/move-generation/KnightMoves.ts
   tests/move-generation/KnightMoves.test.ts
   ```

2. **Test edge cases**
   - Board boundaries
   - Empty boards
   - Positions with many pieces
   - Special moves (castling, en passant, promotion)

3. **Use descriptive test names**
   ```typescript
   describe('KnightMoveGenerator', () => {
     it('generates 8 moves from center square on empty board', () => {
       // ...
     });
     
     it('generates 2 moves from corner square on empty board', () => {
       // ...
     });
   });
   ```

---

## Performance Targets for 1600 Elo

- **Search depth**: 4-6 ply in middlegame
- **Nodes per second**: 50,000 - 500,000 (depends on evaluation complexity)
- **Move generation**: < 1ms for typical positions
- **Evaluation**: < 0.1ms per position
- **Transposition table hit rate**: > 80% at depth 5+

---

## Implementation Priority

Build in this order for steady progress:

### Phase 1: Core (Week 1)
1. `Piece.ts`, `Square.ts`, `Move.ts`
2. `Board.ts` (array-based)
3. `GameState.ts`

### Phase 2: Move Generation (Week 1-2)
4. `KnightMoves.ts`, `KingMoves.ts` (easiest)
5. `SlidingMoves.ts` for rooks, bishops, queen
6. `PawnMoves.ts` (most complex)
7. `LegalityChecker.ts`
8. `MoveGenerator.ts` (coordinator)

### Phase 3: Basic Engine (Week 2)
9. `MaterialEvaluator.ts`
10. `PieceSquareTables.ts`
11. `Evaluator.ts` (coordinator)
12. Simple `AlphaBeta.ts` (no optimizations yet)
13. `ChessEngine.ts` interface

### Phase 4: Optimizations (Week 3)
14. `MoveOrdering.ts`
15. `TranspositionTable.ts` + `ZobristHashing.ts`
16. `QuiescenceSearch.ts`
17. `IterativeDeepening.ts`

### Phase 5: Polish (Week 3-4)
18. `PawnStructure.ts`
19. `KingSafety.ts`
20. `FenParser.ts` / `FenGenerator.ts`
21. `PerftTester.ts`
22. Testing and tuning

---

## Common Pitfalls to Avoid

### ❌ Don't Do:
- Create monolithic files with multiple responsibilities
- Mix board representation logic with move generation
- Put evaluation code in search modules
- Use global state
- Forget to unmake moves in search
- Generate moves by copying entire board
- Ignore type safety with `any` types

### ✅ Do:
- Keep each file focused on one responsibility
- Use dependency injection for testability
- Profile before optimizing
- Write tests for move generation (use Perft)
- Use make/unmake pattern in search
- Pre-allocate arrays in hot paths
- Leverage TypeScript's type system

---

## Example File Template

```typescript
/**
 * @file KnightMoves.ts
 * @description Generates all pseudo-legal knight moves
 */

import { Board } from '../core/Board';
import { Move, MoveFlags } from '../core/Move';
import { Square } from '../core/Square';
import { Piece } from '../core/Piece';

/**
 * Generates knight moves using pre-computed offset table.
 * Knights move in an L-shape: 2 squares in one direction and 1 perpendicular.
 */
export class KnightMoveGenerator {
  // Knight can move to 8 possible squares (if in center of board)
  private readonly OFFSETS: number[] = [
    -17, -15, -10, -6, 6, 10, 15, 17
  ];

  /**
   * Generate all pseudo-legal knight moves from a square.
   * Does not check if moves leave king in check.
   * 
   * @param board Current board state
   * @param from Source square
   * @param moves Array to populate with generated moves
   */
  generate(board: Board, from: Square, moves: Move[]): void {
    const piece = board.getPiece(from);
    if (!piece || piece.type !== PieceType.Knight) return;

    const fromRank = Math.floor(from / 8);
    const fromFile = from % 8;

    for (const offset of this.OFFSETS) {
      const to = from + offset;
      
      // Check if move stays on board
      if (to < 0 || to > 63) continue;
      
      const toRank = Math.floor(to / 8);
      const toFile = to % 8;
      
      // Check for wrapping (knight jumped off edge)
      if (Math.abs(fromRank - toRank) > 2) continue;
      if (Math.abs(fromFile - toFile) > 2) continue;
      
      const target = board.getPiece(to);
      
      // Can't capture own pieces
      if (target && target.color === piece.color) continue;
      
      // Add move
      moves.push({
        from,
        to,
        piece,
        captured: target || undefined,
        flags: target ? MoveFlags.Capture : MoveFlags.None
      });
    }
  }
}
```

---

## Final Notes

- **Modularity is key**: When a file approaches 200 lines, consider splitting it
- **Test as you go**: Use Perft to validate move generation
- **Optimize later**: Get correctness first, then profile and optimize
- **Comment complex logic**: Future you will thank present you
- **Follow the structure**: This organization scales well as complexity grows

This architecture will produce a clean, maintainable engine capable of ~1600 Elo with proper tuning of evaluation weights and search depth.