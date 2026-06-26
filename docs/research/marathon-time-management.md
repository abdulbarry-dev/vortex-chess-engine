# Defensive Time Management (Marathon Allocator)

## Epic: vortex-chess-engine-hpq

---

## 1. The Problem: Engines Assume 40-Move Games

Standard chess engines are designed around the assumption that a typical game
lasts approximately 40 moves. This assumption is baked into the fundamental
time allocation formula used by nearly every modern engine:

```
timePerMove = remainingTime / movesRemaining
```

Where `movesRemaining` defaults to 40 if no explicit move count is provided
by the GUI via the UCI `movestogo` field.

This heuristic works well for tactical, open, combinatorial games. However, it
catastrophically fails in long defensive grinding games of the kind Vortex is
designed to play. Consider a French Defense Advance Variation where both sides
castle and the central pawn structure is locked. Such games routinely exceed
80 to 100 moves. An engine using `movesRemaining = 40` will exhaust its clock
budget around move 60, entering a phase of severe time pressure precisely when
the opponent may launch their breakthrough attempt.

The Marathon Allocator solves this by:

1. Extending the expected game length to 80 moves as the Vortex default.
2. Adding a structural awareness layer: reducing time in closed, locked positions
   (where the correct move is usually obvious — piece shuffling) and extending
   time when the position opens up (where a tactical breakthrough is likely).
3. Maintaining a mandatory clock reserve so the engine can never be caught with
   less than a safe buffer.

---

## 2. Theoretical Background

### 2.1 Soft and Hard Time Limits

The chess programming community distinguishes between two time limit types:

- **Hard limit**: The absolute maximum time the engine will use on any single move.
  Exceeding this loses the game on time. In Vortex, this is `maxTime`.
- **Soft limit**: The target time the engine aims to use. When iterative deepening
  completes a full depth and the soft limit is exceeded, the engine stops and
  plays the best move found so far. In Vortex, this is `optimalTime`.

The soft limit is the primary tuning lever for the Marathon Allocator. Reducing
the soft limit in closed positions means the engine completes fewer depth
iterations per move, spending its saved time on critical later moves.

### 2.2 Best-Move Stability and Early Termination

A key insight from the Chessprogramming Wiki is that in stable, closed positions,
the best move rarely changes between depth N and depth N+4. If the engine detects
this stability (via the Variance Minimization system already in Vortex), it can
terminate the search early and bank the time. The Marathon Allocator formalises
this by reducing `optimalTime` when the position complexity score is low.

### 2.3 Position Complexity as a Proxy for Urgency

The existing `calculateComplexity(legalMoves, pieceCount, isTactical)` method
in `TimeManager` is a reasonable complexity proxy. The Marathon Allocator extends
this by incorporating the `lockedFileCount` from `BlockadeEvaluator` as a direct
structural signal:

- **High locked file count** (>= 3): position is deeply closed. Reduce optimal
  time by 30%. The engine just needs to shuffle safely.
- **Low locked file count** (0-1) with high legal moves: position is open and
  tactical. Extend optimal time by 40%. The opponent may be creating threats.

### 2.4 Clock Reserve Factor

The existing `EMERGENCY_TIME_FRACTION = 0.1` reserves 10% of clock time.
For a 5-minute game (300 seconds), this is a 30-second buffer. In a 100-move
defensive grind, 30 seconds is insufficient. The Marathon Allocator raises this
to 15% for all positions, guaranteeing a larger safety net for endgame play.

---

## 3. Implementation Plan

### 3.1 Constants to Change

```typescript
// Before (standard engine assumptions)
private readonly EXPECTED_MOVES_REMAINING = 40;
private readonly EMERGENCY_TIME_FRACTION = 0.1;

// After (marathon defensive allocator)
private readonly EXPECTED_MOVES_REMAINING = 80;
private readonly EMERGENCY_TIME_FRACTION = 0.15;
```

### 3.2 New Method: adjustForStructure

A new `adjustForStructure` method accepts the locked file count from
`BlockadeEvaluator.getLockedFileCount()` and modifies the time allocation:

```typescript
/**
 * Adjust time allocation based on pawn structure openness.
 *
 * @param allocation   - Base time allocation from allocateTime()
 * @param lockedFiles  - Number of locked pawn files (0-8) from BlockadeEvaluator
 * @param legalMoves   - Number of legal moves in the current position
 * @returns Adjusted allocation
 */
adjustForStructure(
  allocation: TimeAllocation,
  lockedFiles: number,
  legalMoves: number
): TimeAllocation {
  let factor = 1.0;

  if (lockedFiles >= 3) {
    // Deeply closed position: safe shuffling is fine, save clock time
    factor = 0.70;
  } else if (lockedFiles >= 1) {
    // Semi-closed: mild reduction
    factor = 0.85;
  } else if (legalMoves >= 35) {
    // Open and tactical: extend time to find correct response
    factor = 1.40;
  } else if (legalMoves >= 25) {
    factor = 1.15;
  }

  return {
    optimalTime: Math.floor(allocation.optimalTime * factor),
    maxTime: allocation.maxTime,    // Never reduce the hard ceiling
    minTime: allocation.minTime,
  };
}
```

### 3.3 Extended calculateComplexity Signature

The existing `calculateComplexity` method is extended with an optional
`lockedFiles` parameter so callers can include structural information:

```typescript
calculateComplexity(
  legalMoves: number,
  pieceCount: number,
  isTactical: boolean = false,
  lockedFiles: number = 0
): number {
  const moveComplexity = Math.min(legalMoves / 40, 1);
  const pieceComplexity = Math.min(pieceCount / 16, 1);
  const tacticalBonus = isTactical ? 0.3 : 0;

  // Locked files REDUCE complexity — the position is inherently stable
  const structuralCalm = Math.min(lockedFiles / 4, 0.3);

  const complexity =
    moveComplexity * 0.4 +
    pieceComplexity * 0.4 +
    tacticalBonus -
    structuralCalm;

  return Math.max(0, Math.min(complexity, 1));
}
```

---

## 4. Integration Points

The `adjustForStructure` method is called from `IterativeDeepening.ts` after
the initial `allocateTime()` call, passing in `blockadeEvaluator.getLockedFileCount(board)`.

Because `BlockadeEvaluator` is already instantiated in `Evaluator`, the cleanest
integration is to expose a static utility or pass the lock count through the
search configuration. The simplest approach for now: compute locked files once
at the start of each search in `IterativeDeepeningSearch.search()` and pass
the result to the time manager.

---

## 5. Expected Behavioral Impact

| Scenario | Before | After |
|---|---|---|
| French Defense, locked center (3 locked files) | Uses full time budget, may flag in move 70 | Saves 30% per move, comfortable until move 100 |
| Open Sicilian (0 locked files, 35+ legal moves) | Standard allocation | 40% more time for critical tactical decisions |
| Generic middlegame | 40-move budget, time pressure at move 50 | 80-move budget, comfortable throughout |

---

## 6. Tuning Guidance

| Parameter | Default | Effect |
|---|---|---|
| `EXPECTED_MOVES_REMAINING` | 80 | Increase for longer defensive grinds |
| `EMERGENCY_TIME_FRACTION` | 0.15 | Increase for more conservative clock management |
| Closed reduction factor | 0.70 | Decrease toward 0.60 if engine shuffles too slowly |
| Tactical extension factor | 1.40 | Reduce to 1.20 if engine times out in open positions |

---

## 7. References

- Chessprogramming Wiki: [Time Management](https://www.chessprogramming.org/Time_Management)
- Hyatt, R. (1999). *Crafty Chess Engine Source* — `time.c`.
- Romstad, M., Costalba, M., Kiiski, J. (2008). *Stockfish Time Management*.
- Chessprogramming Wiki: [Iterative Deepening](https://www.chessprogramming.org/Iterative_Deepening)
