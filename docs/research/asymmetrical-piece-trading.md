# Asymmetrical Piece Trading (Snake Protocol)

## Epic: vortex-chess-engine-kzd

---

## 1. Theoretical Foundation

In defensive chess, the most important strategic principle that separates strong
positional players from weaker ones is this: **not all piece trades are equal**.

A pawn capture opens a file. An open file gives rooks a trajectory toward the king.
An open file gives bishops diagonal access. An open file creates passed pawn
opportunities. In short, a pawn capture changes the structure of the game
permanently and almost always benefits the more active, attacking player.

A piece capture — trading a knight for a knight, a bishop for a bishop, a rook for
a rook — does none of these things. It reduces the total firepower on the board,
which relieves pressure on the defending side. When White sacrifices a piece to
attack, Black's best defence is often not to capture back immediately but to find
a defensive resource that eliminates the attacker's army piece by piece, draining
its attacking ammunition without opening any lines.

The Snake Protocol formalises this asymmetry in Vortex's evaluation:

1. **Pawn Tension Penalty:** Positions where pawns are directly threatening to
   capture each other ("pawn tension") are penalised, because a trade is likely
   imminent and any capture would open a file. The engine is encouraged to resolve
   this tension by retreating or side-stepping rather than capturing.

2. **Piece Simplification Bonus:** As non-pawn, non-king pieces disappear from
   the board (through any trade sequence), the engine awards a small but
   accumulating bonus to the losing side, reflecting the reduced attacking potential
   of the opponent's army.

The name "Snake Protocol" refers to the idea that the engine's defensive strategy
"coils" around the opponent's attack, shedding pieces while preserving the pawn
structure as an immovable wall.

---

## 2. Technical Background

### 2.1 Pawn Tension

Two pawns are in "tension" when one pawn can diagonally capture the other on the
next move. For example, a White pawn on e4 and a Black pawn on d5 are in tension:
White can play exd5 (opening the e-file and the f1-a6 diagonal) or Black can play
dxe4 (opening the d-file and the c8-h3 diagonal).

Pawn tension is not inherently bad — in attacking chess, creating tension and
forcing the opponent to resolve it on your terms is a key weapon. However, for
Vortex's defensive philosophy, any pawn tension is a liability because:

- If Vortex captures, it opens lines for the opponent.
- If the opponent captures, it opens lines Vortex must now defend.
- The best outcome is that neither side captures — the tension remains frozen.

By penalising pawn tension in the static evaluation, the engine assigns a lower
score to positions where captures are available, naturally preferring positions
where the pawn tension has been defused by manoeuvring rather than exchanging.

### 2.2 Piece Count as a Simplification Signal

The total number of non-pawn, non-king pieces on the board at game start is 14
(2 rooks, 2 bishops, 2 knights, 1 queen per side = 7 per side). As pieces are
traded, this count decreases.

When Vortex is losing (evaluation < -100cp), each piece traded off reduces the
opponent's attacking resources. The simplification bonus accumulates as:

```
bonus = (14 - currentPieceCount) * PIECE_SIMPLIFICATION_BONUS_PER_PIECE
```

Where `PIECE_SIMPLIFICATION_BONUS_PER_PIECE = 8cp`.

At maximum simplification (all 14 non-pawn pieces traded = K+P vs K+P):
`bonus = 14 * 8 = 112cp`

This is significant: it means a bare-king endgame is worth an extra pawn in
evaluation terms when we are losing, correctly steering the engine to keep trading
pieces even at material cost to reach the drawn endgame.

### 2.3 Implementation Architecture

The Snake Protocol has two components:

**Component 1 — `evaluatePawnTension()` in `PawnStructureEvaluator.ts`:**
- Scans all White pawns and checks if a Black pawn is diagonally adjacent
  (the attacking squares).
- Each pawn pair in tension returns a `-PAWN_TENSION_PENALTY` to the score.
- Applied symmetrically: White pawn tension penalises White (reduces score),
  Black pawn tension penalises Black (increases score from White's perspective).

**Component 2 — `calculateSimplificationBonus()` in `Evaluator.ts`:**
- Called when `finalScore < -100` (Vortex is losing).
- Counts current non-pawn, non-king pieces.
- Awards `(14 - count) * 8cp` bonus to the losing side.

---

## 3. Implementation Plan

### 3.1 PawnStructureEvaluator.ts — evaluatePawnTension()

```typescript
/**
 * Calculate the pawn tension penalty.
 *
 * Pawn tension exists when a pawn can capture diagonally in the next move.
 * Each pawn pair in tension reduces the score by PAWN_TENSION_PENALTY because:
 * - If we capture: we open a file, benefiting the attacker.
 * - If they capture: we must defend an open file.
 * - Best outcome: tension remains frozen. Penalising it steers the engine away.
 *
 * @param board - Current board state
 * @returns Tension penalty score from White's perspective (negative = White penalised)
 */
evaluatePawnTension(board: Board): number {
  let score = 0;
  const PAWN_TENSION_PENALTY = -10; // centipawns per tense pawn pair

  for (const [square, piece] of board.getAllPieces()) {
    if (piece.type !== PieceType.Pawn) continue;
    const file = getFile(square);
    const rank = getRank(square);

    if (piece.color === Color.White) {
      // White pawn can capture to rank+1, files file-1 and file+1
      for (const targetFile of [file - 1, file + 1]) {
        if (targetFile < 0 || targetFile > 7) continue;
        const targetSq = (rank + 1) * 8 + targetFile;
        if (targetSq > 63) continue;
        const target = board.getPiece(targetSq);
        if (target && target.type === PieceType.Pawn && target.color === Color.Black) {
          score += PAWN_TENSION_PENALTY; // Penalise White for having this tension
        }
      }
    }
  }

  return score;
}
```

### 3.2 Evaluator.ts — calculateSimplificationBonus()

```typescript
/**
 * Calculate the Piece Simplification Bonus for the Snake Protocol.
 *
 * When losing, reward positions where the total piece count is low.
 * Each piece traded off the board reduces the opponent's attacking resources
 * and brings the game closer to a drawable endgame.
 *
 * @param board      - Current board state
 * @param finalScore - Current evaluation (White's perspective)
 * @returns Bonus in centipawns (positive = helps White, negative = helps Black)
 */
private calculateSimplificationBonus(board: Board, finalScore: number): number {
  if (Math.abs(finalScore) < 100) return 0; // Near-equal, no need

  const BONUS_PER_PIECE = 8;
  const STARTING_PIECE_COUNT = 14; // 7 non-pawn, non-king pieces per side

  let currentPieceCount = 0;
  for (const [_sq, piece] of board.getAllPieces()) {
    if (piece.type !== PieceType.Pawn && piece.type !== PieceType.King) {
      currentPieceCount++;
    }
  }

  const piecesTraded = STARTING_PIECE_COUNT - currentPieceCount;
  if (piecesTraded <= 0) return 0;

  const bonus = piecesTraded * BONUS_PER_PIECE;

  if (finalScore < -100) {
    return bonus;   // White is losing — reward simplification for White
  } else if (finalScore > 100) {
    return -bonus;  // Black is losing — reward simplification for Black
  }

  return 0;
}
```

---

## 4. Integration Points

### 4.1 PawnStructureEvaluator.evaluate()

Add a call to `evaluatePawnTension()` inside the existing `evaluate()` method,
after the existing pawn analysis loop:

```typescript
// Snake Protocol: Pawn Tension Penalty
score += this.evaluatePawnTension(board);
```

### 4.2 Evaluator.evaluate()

Add the simplification bonus call just before the attrition bonus:

```typescript
// Snake Protocol: Piece Simplification Bonus
finalScore += this.calculateSimplificationBonus(board, finalScore);
```

---

## 5. Expected Behavioral Impact

- In the opening/early middlegame where material is balanced, pawn tension
  penalties will gently discourage captures, keeping the position closed.
- When losing (after move 15+), Vortex will begin to actively seek piece
  exchanges — knight-for-knight, bishop-for-bishop — to drain the opponent's army.
- In combination with the 50-Move Rule Gravity system, Vortex in a losing position
  will: (a) avoid pawn captures (keep clock running), (b) seek piece trades (drain
  attacker's firepower), creating a dual-layered defensive strategy.
- The engine will become noticeably resistant to pawn levers (e.g. f4-f5, e5-e6)
  even when they appear superficially tactical.

---

## 6. Tuning Guidance

| Parameter | Default | Effect of Increasing |
|---|---|---|
| `PAWN_TENSION_PENALTY` | -10cp per pair | Stronger avoidance of pawn captures |
| `BONUS_PER_PIECE` | 8cp per traded piece | Stronger drive to simplify when losing |
| Activation threshold | -100cp | Lower to activate simplification earlier |

Caution: setting `PAWN_TENSION_PENALTY` too high (> -25cp) may cause the engine
to refuse all pawn tension even in genuinely winning positions.

---

## 7. References

- Nimzowitsch, A. (1925). *My System* — Chapter 2: The Blockade; Chapter 5: The
  Theory of Overprotection.
- Petrosian, T. (1969). *Strategy and Tactics* — Analysis of prophylactic thinking.
- Chessprogramming Wiki: [Static Exchange Evaluation](https://www.chessprogramming.org/Static_Exchange_Evaluation)
- Chessprogramming Wiki: [Pawn Structure](https://www.chessprogramming.org/Pawn_Structure)
