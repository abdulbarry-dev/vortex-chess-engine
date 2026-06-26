# Draw by Attrition (50-Move Rule Gravity)

## Epic: vortex-chess-engine-5ol

---

## 1. Theoretical Foundation

The fifty-move rule states that either player may claim a draw if fifty consecutive
full moves pass without a pawn move or a piece capture. In the UCI protocol and
FIDE rules, this is tracked internally as the `halfmoveClock` (also called the
halfmove clock), which counts half-moves (plies). The draw is claimable when the
halfmoveClock reaches 100 plies (50 full moves).

From a defensive standpoint, the fifty-move rule is one of the most powerful
theoretical resources available to the side under pressure. Consider a position
where Black is a pawn down with a fortress: White cannot breach the fortress, but
Black must keep shuffling pieces to maintain it. If Black can shuffle for 50 full
moves without any pawn push or capture occurring, the game is drawn regardless of
the material imbalance.

Standard chess engines are designed to play for wins. They typically evaluate piece
shuffles as "neutral" or even slightly negative (due to repetition avoidance). This
causes them to sometimes accept unfavourable pawn captures or open-file plays just
to create "something" — inadvertently resetting the halfmoveClock and throwing away
a potential draw by attrition.

Vortex's "50-Move Rule Gravity" system flips this logic: when the engine is losing,
it begins to prefer moves that do NOT reset the clock, applying an increasing bonus
to non-resetting moves as the halfmoveClock rises. This makes the engine actively
run down the fifty-move draw clock as a concrete strategic objective.

---

## 2. Technical Background

### 2.1 What Resets the halfmoveClock?

The halfmoveClock is reset to 0 by exactly two types of moves:
- Any pawn move (pawn push, pawn capture, en passant)
- Any piece capture (regardless of piece type)

All other moves (piece shuffles, king moves without capture, castling) increment
the counter by 1.

### 2.2 How the halfmoveClock is Used in Vortex

In `GameState.ts`, the field `halfmoveClock` already exists and is correctly
maintained by `MoveExecutor.ts`. The `isFiftyMoveRule()` method returns true when
`halfmoveClock >= 100`.

The clock is already used in the AlphaBeta search tree to detect and score draws,
but it is NOT currently used as an active strategic signal to influence move
preference when the engine is in a losing position.

### 2.3 Insertion Point: Static Evaluation

The cleanest integration point is `Evaluator.evaluate()`. By adding an
"Attrition Bonus" term directly to the static evaluation score, we affect every
leaf node in the search tree simultaneously. The minimax search will naturally
prefer moves that maintain a high halfmoveClock score because those positions
evaluate higher when we are losing.

Crucially, the bonus is only applied when:
1. The base evaluation is below a threshold (we are losing — currently -100cp,
   approximately one pawn).
2. The halfmoveClock is above a minimum threshold (>= 10 plies), preventing the
   system from activating in the early game.

### 2.4 Attrition Bonus Formula

```
attritionBonus = round((halfmoveClock / 100) * MAX_ATTRITION_BONUS)
```

Where `MAX_ATTRITION_BONUS = 40cp`.

This means:
- At halfmoveClock = 0: bonus = 0cp (no effect)
- At halfmoveClock = 50 (25 moves played): bonus = 20cp
- At halfmoveClock = 80 (40 moves played): bonus = 32cp
- At halfmoveClock = 100 (draw!): bonus = 40cp (but the game is already drawn)

The bonus is applied from the perspective of the losing side. Since `evaluate()`
returns a score from White's perspective, and `state.currentPlayer` is `Color.White`
(+1) or `Color.Black` (-1), the bonus is added as:

```typescript
finalScore += attritionBonus * state.currentPlayer * -1;
// Negative because we want to HELP the losing side (who is evaluated negatively)
```

A simpler way to express this: if `finalScore < -100` (White is losing), the bonus
increases `finalScore` toward 0 (less negative = less losing). If `finalScore > 100`
(Black is losing), the bonus decreases `finalScore` toward 0 (less positive).

### 2.5 Clock Danger Mode

When the halfmoveClock is very high (>= 80 plies, meaning 40 moves have been played
without a reset) and the engine is losing, it enters "Clock Danger Mode." In this
mode, the attrition bonus scales sharply to discourage any move that would reset the
clock. This is implemented by increasing the MAX multiplier from 40cp to 60cp in
the bonus formula when `halfmoveClock >= 80`.

---

## 3. Implementation Plan

### 3.1 Changes to Evaluator.ts

Add a new private method `calculateAttritionBonus()` and call it from `evaluate()`:

```typescript
/**
 * Calculate the Attrition Bonus for the 50-Move Rule Gravity system.
 *
 * When Vortex is losing (finalScore outside the losing threshold), it applies
 * an increasing bonus to positions with a high halfmoveClock. This incentivises
 * the search to prefer non-resetting moves (piece shuffles) over pawn pushes or
 * captures, running down the clock toward a draw by attrition.
 *
 * @param finalScore    - Current evaluation score (White's perspective)
 * @param halfmoveClock - Current halfmove clock value from GameState
 * @returns Attrition bonus in centipawns (positive = helps White, negative = helps Black)
 */
private calculateAttritionBonus(finalScore: number, halfmoveClock: number): number {
  // Only activate when losing and the clock is meaningfully advanced
  if (halfmoveClock < 10) return 0;
  if (Math.abs(finalScore) < 100) return 0;  // Position is roughly equal

  const maxBonus = halfmoveClock >= 80 ? 60 : 40;  // Clock Danger Mode at >= 80 plies
  const bonus = Math.round((halfmoveClock / 100) * maxBonus);

  if (finalScore < -100) {
    // White is losing — add bonus to raise White's score toward 0
    return bonus;
  } else if (finalScore > 100) {
    // Black is losing — subtract bonus to lower White's score toward 0
    return -bonus;
  }

  return 0;
}
```

Called in `evaluate()` just before the final return:

```typescript
// 50-Move Rule Gravity (Draw by Attrition)
finalScore += this.calculateAttritionBonus(finalScore, state.halfmoveClock);
```

---

## 4. Integration with Other Systems

The Attrition system interacts with several existing Vortex systems:

- **Swindle Mode:** When losing heavily (< -200cp), Swindle Mode adds a complexity
  bonus to avoid trades. Attrition Gravity adds a separate, additive bonus tied to
  the clock. Both systems reinforce each other in a losing position.
- **Variance Minimization:** The Stability Grind Mode discourages volatile positions.
  In a locked, attrition-based position, volatility naturally drops, further reducing
  the stability penalty and amplifying the net defensive bonus.
- **Blockade Evaluator:** Locked pawn structures naturally prevent pawn captures from
  resetting the clock. The Blockade bonus and the Attrition bonus stack additively,
  making locked defensive positions doubly rewarding.

---

## 5. Expected Behavioral Impact

- When a pawn down in a locked position after move 25, Vortex will begin subtly
  preferring piece shuffles over any move that would reset the clock.
- The engine will become noticeably reluctant to accept en passant captures or
  voluntary pawn pushes in losing positions after move 30+.
- In extreme cases (40+ moves without a reset), the engine essentially treats the
  draw clock as a primary objective, avoiding captures at the cost of 32cp+ in
  positional evaluation — a rational sacrifice to secure the draw.

---

## 6. Tuning Guidance

| Parameter | Default | Effect of Increasing |
|---|---|---|
| Activation threshold | -100cp | Lower to activate earlier (more aggressive attrition play) |
| MIN clock threshold | 10 plies | Raise to avoid early-game influence |
| MAX_ATTRITION_BONUS (normal) | 40cp | Increase for stronger attrition preference |
| MAX_ATTRITION_BONUS (danger) | 60cp | Increase for extreme clock-running behavior |
| Clock Danger threshold | 80 plies | Lower to 60 for earlier danger mode activation |

---

## 7. References

- FIDE Laws of Chess, Article 9.3: Fifty-move rule.
- Chessprogramming Wiki: [Fifty-move Rule](https://www.chessprogramming.org/Fifty-move_Rule)
- Chessprogramming Wiki: [Draw](https://www.chessprogramming.org/Draw)
- Nimzowitsch, A. (1925). *My System* — Chapter on the Art of Blockade and Defence.
- Fine, R. (1941). *Basic Chess Endings* — Section on drawing techniques.
