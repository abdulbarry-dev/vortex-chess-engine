# Vortex-Core Rust Implementation Plan

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  TypeScript Bridge (WASM) — UCI CLI / Web Worker                 │
│  Calls: VortexCore::new(), search(), load_nnue(), evaluate()     │
└──────────────────────────┬───────────────────────────────────────┘
                           │ wasm-bindgen
┌──────────────────────────▼───────────────────────────────────────┐
│  vortex-core (Rust)                                               │
│                                                                   │
│  ┌────────────────────────┐  ┌─────────────────────────────┐    │
│  │  NNUE System            │  │  Search System (Phase 4)    │    │
│  │                         │  │                             │    │
│  │  DualAccumulator        │  │  IterativeDeepening         │    │
│  │  ├─ PstAccum (i16)     │  │  ├─ AspirationWindows       │    │
│  │  └─ ThreatAcc (i8)     │  │  ├─ NullMoveThreatExtract   │    │
│  │                         │  │  ├─ VarianceTracker         │    │
│  │  IncrementalNetwork     │  │  └─ SwindleMode             │    │
│  │  ├─ Stack (per ply)    │  └─────────────────────────────┘    │
│  │  ├─ Lazy accuracy      │                                      │
│  │  ├─ Cache refresh      │  ┌─────────────────────────────┐    │
│  │  └─ MultiplicativeFT   │  │  Handcrafted Eval (Phase 2) │    │
│  │                         │  │  Port TypeScript eval → Rust│    │
│  │  1 Brain                │  └─────────────────────────────┘    │
│  │  16 Phase Embeddings    │                                      │
│  │  72K Threat Features    │  ┌─────────────────────────────┐    │
│  │                         │  │  Weight I/O: .vortex format │    │
│  └────────────────────────┘  └─────────────────────────────┘    │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  Contempt System (Three-Tier Gradient)                     │   │
│  │  0 to -150cp:  Negative contempt → simplify, seek draws   │   │
│  │  -150 to -300: Zero contempt → trust fortress detection   │   │
│  │  Below -300cp: Positive contempt → swindle, create chaos  │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

External: Python Training Pipeline
  Self-play → Stockfish eval labels → train PyTorch → export .vortex
```

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Brains | **1 brain** | All data trains all weights. 2-brain considered but deferred — insufficient data to split cleanly. |
| Phase control | **16 learned embeddings** | Smooth transitions, no discontinuities, ~48 KB overhead. Stricly better than 8 sub-networks. |
| Threat interaction | **Defense-optimized (~72K)** | Exclude only King→non-pawn (noise). Include all pawn attacks, all checks, all captures. |
| Hidden layers | **L2=16, L3=32** | Reckless-validated tiny layers. Multiplicative FT gives quadratic expressiveness. |
| Per-phase bias | **Per-bucket L1/L2/L3 biases** | ~1 KB total. Acts as cheap phase-gating without weight duplication. |
| FT activation | **Multiplicative (split×product)** | Quadratic feature expansion at FT. Enables tiny L2. ~75% sparsity for fast L1 pass. |
| Eval fallback | **Full handcrafted eval port** | Usable engine before NNUE trained. Also useful for curriculum learning. |
| Training label | **Stockfish eval (single scalar)** | Clean numeric target, all data sources unified, trivially analyzable. |
| Contempt | **Three-tier gradient** | Score-driven: negative→zero→positive as position worsens. Resolves Swindle vs Draw-seeking cleanly. |
| Weight format | **`.vortex` binary** | Compact, no external dependencies, sized for WASM byte array loading. |

---

## Phase 1: NNUE Architecture (`src/nnue/`)

### 1.1 — `types.rs` (NEW)

**Core constants:**

| Constant | Value | Purpose |
|----------|-------|---------|
| `FT_SIZE` | 768 | Accumulator width (L1_SIZE) |
| `FT_HALF` | 384 | Multiplicative split point |
| `FT_QUANT` | 255 | Clamp maximum for each half |
| `FT_SHIFT` | 9 | Right shift after product |
| `L2_SIZE` | 16 | First hidden layer |
| `L3_SIZE` | 32 | Second hidden layer |
| `NUM_PHASE_BUCKETS` | 16 | Phase embedding count |
| `PST_FEATURES` | 7,680 | 10 king buckets × 12 piece-color × 64 squares |
| `THREAT_FEATURES` | ~72,000 | Defense-optimized interaction map |

**King bucket mapping (64→10):**

```
Ranks 1-2 (back ranks): bucket = file (0-7) — 8 buckets
Ranks 3-4 (slightly forward): bucket = 8 — 1 bucket
Ranks 5-8 (opponent territory): bucket = 9 — 1 bucket
```

Mirrored for black perspective via `sq ^ 56` flip.

### 1.2 — `accumulator.rs` (NEW)

**PST Accumulator:**
```rust
pub struct PstAccumulator {
    pub values: [[i16; FT_SIZE]; 2],   // [perspective][neuron]
    pub accurate: [bool; 2],           // stm/nstm validity flags
}

// HalfKP feature index:
// bucket * 768 + 384*(color_side) + 64*piece_type + (sq ^ flip)
```

**Threat Accumulator:**
```rust
pub struct ThreatAccumulator {
    pub values: [[i16; FT_SIZE]; 2],
    pub accurate: [bool; 2],
    pub delta: ArrayVec<ThreatDelta, 80>,  // packed deltas
}

// ThreatDelta: 32-bit packed
// [attacker_type:8 | from_sq:8 | victim_type:8 | to_sq:7 | add_flag:1]
```

**Defense-optimized threat interaction map:**
```
     P  N  B  R  Q  K
  P [0, 0, 0, 0, 0, 0]   // Pawn attacks everything (pawn storms are critical)
  N [0, 0, 0, 0, 0, 0]   // Knight attacks everything
  B [0, 0, 0, 0, 0, 0]   // Bishop attacks everything
  R [0, 0, 0, 0, 0, 0]   // Rook attacks everything
  Q [0, 0, 0, 0, 0, 0]   // Queen attacks everything
  K [0, 0, 0, 0, 0, 1]   // King→King excluded (impossible)
  // King→non-king: include — relevant for endgame activity
```

Only 1 exclusion (King→King). All other attack relationships are encoded.

### 1.3 — `weights.rs` (NEW)

```rust
pub struct VortexWeights {
    // PST: i16 for positional precision
    pub pst_weights: Vec<i16>,       // [10×768][768] = 11.8 MB
    pub pst_biases: [i16; FT_SIZE],  // 1.5 KB

    // Threat: i8 for compression
    pub threat_weights: Vec<i8>,     // [72,000][768] = ~55 MB

    // Phase embeddings: f32 (16 × 768 = 48 KB)
    pub phase_embeddings: Vec<f32>,  // [NUM_PHASE_BUCKETS][FT_SIZE]

    // Shared L1: i8 with L1_QUANT=64
    pub l1_weights: Vec<i8>,         // [L2_SIZE × FT_SIZE] = 12 KB
    pub l1_biases: Vec<f32>,         // [NUM_PHASE_BUCKETS][L2_SIZE] = 1 KB
    pub l1_quant: i32,               // = 64

    // Shared L2: f32
    pub l2_weights: Vec<f32>,        // [L2_SIZE][L3_SIZE] = 2 KB
    pub l2_biases: Vec<f32>,         // [NUM_PHASE_BUCKETS][L3_SIZE] = 2 KB

    // Shared L3: f32
    pub l3_weights: Vec<f32>,        // [L3_SIZE] = 128 B
    pub l3_biases: Vec<f32>,         // [NUM_PHASE_BUCKETS] = 64 B

    pub is_loaded: bool,
}
```

**Total weight memory: ~67 MB** (dominated by threat features at 55 MB)

### 1.4 — `forward.rs` (NEW)

**Game phase computation:**
```rust
pub fn game_phase(state: &GameState) -> (f32, usize) {
    let opening_material = 2 * (500*2 + 330*2 + 320*2 + 900); // ≈ 7800
    let w = state.board.non_pawn_material(Color::White);
    let b = state.board.non_pawn_material(Color::Black);
    let phase_f = ((w + b) as f32 / opening_material as f32).clamp(0.0, 1.0);
    // Smooth bucket selection with stochastic rounding during training
    let bucket = (phase_f * (NUM_PHASE_BUCKETS - 1) as f32) as usize;
    (phase_f, bucket)
}
```

**Multiplicative FT activation:**
```rust
pub fn activate_ft(
    pst: &[i16; FT_SIZE],
    threat: &[i16; FT_SIZE],
    phase_embed: &[f32; FT_SIZE],
) -> [u8; FT_SIZE] {
    let mut ft = [0u8; FT_SIZE];
    for i in 0..FT_SIZE {
        // Phase embedding (f32 [-1,1]) scaled to i16 and added to accumulator
        let embed = (phase_embed[i] * FT_QUANT as f32) as i16;
        let sum = (pst[i] as i32 + threat[i] as i32 + embed as i32)
            .clamp(0, FT_QUANT as i32) as i16;

        if i < FT_HALF {
            let left = sum as u16;
            let right = sum_will_come from right half;
        }
    }
    // Two-pass: first compute halves, then multiply pairwise
    let mut sums = [0i16; FT_SIZE];
    for i in 0..FT_SIZE {
        let embed = (phase_embed[i] * FT_QUANT as f32) as i16;
        sums[i] = (pst[i] as i32 + threat[i] as i32 + embed as i32)
            .clamp(0, FT_QUANT as i32) as i16;
    }
    for i in 0..FT_HALF {
        let product = (sums[i] as u16 * sums[i + FT_HALF] as u16) >> FT_SHIFT;
        ft[i] = product.min(255) as u8;
        ft[i + FT_HALF] = ft[i];  // mirrored
    }
    ft
}
```

### 1.5 — `evaluate.rs` (NEW — replaces old nnue.rs evaluate)

**Full forward pass:**
```
1. Phase bucket from material count
2. Select phase embedding for bucket
3. FT: pst + threat + phase_embed → clamp → multiplicative → [u8; 768]
4. NNZ: find non-zero indices (~75% sparsity → ~192 non-zero)
5. L1: u8 × i8 → i32 → dequant → f32 → CReLU → [f32; 16]
6. L2: f32 × f32 → CReLU → [f32; 32]
7. L3: f32 × f32 → scalar (centipawns/100)
8. Return (score × 100) as i32
```

**Dequant constant:**
```
DEQUANT = 1.0 / (FT_QUANT × FT_QUANT × L1_QUANT)
        = 1.0 / (255 × 255 × 64)
        ≈ 0.00000024
```

### 1.6 — `network.rs` (NEW — Incremental Update System)

**Stack-based architecture:**
```rust
pub struct IncrementalNetwork {
    pub pst_stack: Vec<PstAccumulator>,     // allocated once, indexed by ply
    pub threat_stack: Vec<ThreatAccumulator>,
    pub index: usize,
}

impl IncrementalNetwork {
    pub fn push(&mut self, board: &Board, m: Move) {
        self.index += 1;
        // Copy previous state
        self.pst_stack[self.index].copy_from(&self.pst_stack[self.index - 1]);
        self.threat_stack[self.index].copy_from(&self.threat_stack[self.index - 1]);
        // Record delta (lazy — don't apply yet)
        self.pst_stack[self.index].delta.record_move(board, m);
        self.threat_stack[self.index].delta.record_move(board, m);
        // Mark both perspectives dirty
        self.pst_stack[self.index].accurate = [false, false];
        self.threat_stack[self.index].accurate = [false, false];
    }

    pub fn pop(&mut self) {
        self.index -= 1;
    }

    pub fn ensure_accurate(&mut self, state: &GameState, pov: Color) {
        let acc = &mut self.pst_stack[self.index];
        if acc.accurate[pov] { return; }
        if self.can_update_incrementally(state, pov) {
            self.pst_stack[self.index].apply_delta(state.board);
            self.threat_stack[self.index].apply_delta(state.board);
        } else {
            self.full_refresh(state, pov);
        }
        acc.accurate[pov] = true;
    }

    pub fn evaluate(&mut self, state: &GameState) -> i32 {
        self.ensure_accurate(state, state.side_to_move);
        self.ensure_accurate(state, state.side_to_move.opposite());
        evaluate_nnue(state, &self.dual_at(self.index))
    }
}
```

### 1.7 — `serialize.rs` (NEW — .vortex format)

```
.vortex binary layout:

Offset   | Size   | Content
---------|--------|--------
0        | 4      | Magic: "VRTX"
4        | 1      | Format version (u8) = 1
5        | 2      | FT_SIZE (u16) = 768
7        | 1      | L2_SIZE (u8) = 16
8        | 1      | L3_SIZE (u8) = 32
9        | 1      | NUM_PHASE_BUCKETS (u8) = 16
10       | 2      | PST_FEATURES (u16) = 7680
12       | 2      | THREAT_FEATURES (u16) = ~72000
14       | 4      | PST weights size in bytes (u32)
18       | VAR    | PST weights (i16[PST_FEATURES × FT_SIZE])
...      | 1.5K   | PST biases (i16[FT_SIZE])
...      | ~55MB  | Threat weights (i8[THREAT_FEATURES × FT_SIZE])
...      | ~48KB  | Phase embeddings (f32[NUM_PHASE_BUCKETS × FT_SIZE])
...      | ~12KB  | L1 weights (i8[L2_SIZE × FT_SIZE])
...      | 1KB    | L1 biases (f32[NUM_PHASE_BUCKETS × L2_SIZE])
...      | 2KB    | L2 weights (f32[L2_SIZE × L3_SIZE])
...      | 2KB    | L2 biases (f32[NUM_PHASE_BUCKETS × L3_SIZE])
...      | 128B   | L3 weights (f32[L3_SIZE])
...      | 64B    | L3 biases (f32[NUM_PHASE_BUCKETS])
```

### 1.8 — Integrate into `GameState`

**Modify `state.rs`:**
```rust
pub struct GameState {
    // Note: MUST migrate from flat array to `u64` Bitboards for performance!
    pub bitboards: [u64; 12], // 6 piece types x 2 colors
    pub occupancies: [u64; 3], // White, Black, Both
    // ... existing fields (side_to_move, castling_rights, etc.) ...
    pub nnue: IncrementalNetwork,
}
```

**Modify `make_move()`:**
```rust
pub fn make_move(&mut self, m: Move) -> UndoInfo {
    self.nnue.push(&self.board, m);
    // ... existing make_move logic ...
}
```

**Modify `unmake_move()`:**
```rust
pub fn unmake_move(&mut self, m: Move, undo: &UndoInfo) {
    self.nnue.pop();
    // ... existing unmake_move logic ...
}
```

**Remove old `refresh_accumulator` and `Accumulator` from `nnue.rs`** — they are replaced by the new batch of files.

---

## Phase 2: Handcrafted Fallback Evaluation

### Rewrite `src/evaluate.rs`

Port the TypeScript evaluation to Rust. The fallback activates when NNUE weights are not loaded (or can be used as a target for curriculum learning).

**Components to port:**

| Component | TypeScript Source | Constants | Eval Type |
|-----------|-------------------|-----------|-----------|
| Material | `MaterialEvaluator.ts` | P=100, N=320, B=330, R=500, Q=900 | Per-piece count |
| Piece-Square | `PieceSquareTables.ts` | Center bonus (-10 to +20) | Per-piece table |
| Pawn Structure | `PawnStructureEvaluator.ts` | Doubled=-10, Isolated=-15, Backward=-8, Passed=[0,10,20,35,60,100,150,0] | Per-pawn |
| Pawn Tension | `PawnStructureEvaluator.ts` | PAWN_TENSION_PENALTY=-10 per tense pair | Per-pawn-pair |
| King Safety | `KingSafetyEvaluator.ts` | PAWN_SHIELD=+10, OPEN_FILE=-20, ASYMMETRY=1.4 | 3×3 king zone |
| Mobility | `MobilityEvaluator.ts` | +2/safe move, CONSTRICTION: 0sq=50cp, 1sq=30cp, 2sq=15cp | Per-piece |
| Blockade | `BlockadeEvaluator.ts` | LOCKED_FILE=+20, GRIDLOCK=+40 (3+ files) | Per-file |
| Tablebase Magnetism | `Evaluator.ts` | +8/traded, +50 flat at ≤7 pieces (when losing >50cp) | Global |
| Simplification | `Evaluator.ts` | +8/traded piece (when losing >100cp) | Global |
| Fortress | `FortressEvaluator.ts` | Scale eval toward 0 on draw detection | Global |
| Swindle | `ComplexityEvaluator.ts` | Penalize trades, reward complexity (>-200cp) | Move ordering |

**Scoring structure:**
```rust
pub fn evaluate(state: &GameState) -> i32 {
    let mut opening = 0i32;
    let mut endgame = 0i32;

    // Material + Piece-Square
    opening += evaluate_material(state, Color::White);
    opening -= evaluate_material(state, Color::Black);

    // Pawn Structure + Tension (Snake Protocol)
    opening += evaluate_pawn_structure(state, Color::White);
    opening -= evaluate_pawn_structure(state, Color::Black);

    // King Safety (only in opening/middlegame)
    if game_phase(state).0 > 0.3 {
        opening += evaluate_king_safety(state, Color::White);
        opening -= evaluate_king_safety(state, Color::Black);
    }

    // Mobility
    opening += evaluate_mobility(state, Color::White);
    opening -= evaluate_mobility(state, Color::Black);

    // Blockade / Gridlocked
    opening += evaluate_blockade(state, Color::White);
    opening -= evaluate_blockade(state, Color::Black);

    // Phase taper
    let (phase_f, _) = game_phase(state);
    let score = opening as f32 * phase_f + endgame as f32 * (1.0 - phase_f);

    // Defensive modifiers (applied to final score)
    let score = score + tablebase_magnetism(state, score);
    let score = score + simplification_bonus(state, score);
    let score = fortress_scale(state, score);

    (score * 100.0) as i32
}
```

---

## Phase 3: Training Pipeline (External)

### 3.1 — Data Generation (`tools/generate_training_data/main.rs`)

Rust binary (not WASM — runs natively for speed).

```rust
fn main() {
    // 1. Initialize engine with current .vortex weights
    // 2. Play self-play games (Vortex vs Vortex, or vs Stockfish at low skill)
    // 3. For each position in each game:
    //    - Record zobrist hash
    //    - Compute game phase
    //    - Fork Stockfish subprocess, evaluate @ depth 18+ (Depth 12 is too shallow for positional labels)
    //    - (Optional) Curriculum labeling: override score to 0 if Vortex detects a fortress
    //    - Store: [hash: u64, score: i16, phase: u8, result: u8]
    // 4. Output .vdata binary format
}
```

**Output format (.vdata):**
```
File header:
  Magic: "VDAT" (4 bytes)
  Version: u8 = 1
  Num positions: u32

Per position (40 bytes):
  zobrist_hash: u64
  stockfish_score: i16 (centipawns, from White's perspective)
  game_phase: u8 (0-15)
  game_result: u8 (0=draw, 1=white_wins, 2=black_wins)
  padding: 12 bytes (future use)
```

### 3.2 — Label Pipeline (`tools/label_positions/main.rs`)

Processes any PGN / position file:
```rust
fn main() {
    // 1. Parse input PGN (CCRL, LC0, Lichess)
    // 2. Extract all unique positions (dedup by zobrist hash)
    // 3. Batch-spawn Stockfish, evaluate all positions
    // 4. Output .vdata
}
```

**Data sources:**
| Source | Estimated Positions | Labeling Cost |
|--------|-------------------|---------------|
| Self-play (10K games) | ~5M | ~120 hours @ depth 18+ |
| CCRL database | ~2M | ~40 hours |
| LC0 training data | ~3M | ~30 hours |
| Lichess online games | ~5M | ~50 hours |
| **Total** | **~15M** | **~150 hours** (batchable, ~1 week) |

### 3.3 — Python Training (`tools/train/train.py`)

**Architecture (matches Rust forward pass exactly):**
```python
class VortexNNUE(nn.Module):
    def __init__(self):
        self.pst_embed = nn.EmbeddingBag(PST_FEATURES, FT_SIZE, mode='sum')
        self.threat_embed = nn.EmbeddingBag(THREAT_FEATURES, FT_SIZE, mode='sum')
        self.phase_embed = nn.Embedding(NUM_PHASE_BUCKETS, FT_SIZE)

        self.l1 = nn.Linear(FT_SIZE, L2_SIZE, bias=False)  # bias per-phase
        self.l2 = nn.Linear(L2_SIZE, L3_SIZE, bias=False)
        self.l3 = nn.Linear(L3_SIZE, 1, bias=False)

        # Per-phase biases
        self.l1_bias = nn.Embedding(NUM_PHASE_BUCKETS, L2_SIZE)
        self.l2_bias = nn.Embedding(NUM_PHASE_BUCKETS, L3_SIZE)
        self.l3_bias = nn.Embedding(NUM_PHASE_BUCKETS, 1)

    def forward(self, pst_idx, threat_idx, phase_bucket):
        pst = self.pst_embed(pst_idx)            # [B, 768]
        threat = self.threat_embed(threat_idx)    # [B, 768]
        phase = self.phase_embed(phase_bucket)    # [B, 768]

        # FT sum + clamp
        ft = torch.clamp(pst + threat + phase, 0, 255)

        # Multiplicative split
        left, right = ft.chunk(2, dim=-1)         # [B, 384] each
        ft_mul = (left * right) >> 9              # [B, 384]
        ft_mul = torch.cat([ft_mul, ft_mul], dim=-1)  # [B, 768]

        # L1
        l1 = F.linear(ft_mul, self.l1.weight, self.l1_bias(phase_bucket))
        l1 = F.relu(l1)

        # L2
        l2 = F.linear(l1, self.l2.weight, self.l2_bias(phase_bucket))
        l2 = F.relu(l2)

        # L3 → scalar
        score = F.linear(l2, self.l3.weight, self.l3_bias(phase_bucket))
        return score  # normalized to [-1, 1], multiply by 100 for centipawns
```

**Loss:** MSE(predicted, stockfish_target)
**Optimizer:** AdamW, lr=3e-4, batch=4096
**Training:** 10 epochs over ~15M positions (~150M total samples)
**Hardware:** GPU recommended (RTX 3090+ ≈ 2 days for 10 epochs)

### 3.4 — Export (`tools/train/export.py`)

```python
def export_vortex(model, path):
    # PST: f32 → i16 (symmetric quantization)
    pst_i16 = quantize_symmetric(model.pst_embed.weight, 16)

    # Threat: f32 → i8
    threat_i8 = quantize_symmetric(model.threat_embed.weight, 8)

    # L1: f32 → i8 with scale = 64
    l1_i8, l1_scale = quantize_with_scale(model.l1.weight, 8)

    # Phase embeddings: f32 (no quantization)
    phase_f32 = model.phase_embed.weight.float()

    # L2/L3: f32 (no quantization — tiny)
    l2_f32 = model.l2.weight.float()
    l3_f32 = model.l3.weight.float()

    # Biases: f32
    l1_bias = model.l1_bias.weight.float()
    l2_bias = model.l2_bias.weight.float()
    l3_bias = model.l3_bias.weight.float()

    write_vortex_binary(path,
        pst_weights=pst_i16, pst_biases=model.pst_embed.bias,
        threat_weights=threat_i8,
        phase_embeddings=phase_f32,
        l1_weights=l1_i8, l1_biases=l1_bias, l1_quant=64,
        l2_weights=l2_f32, l2_biases=l2_bias,
        l3_weights=l3_f32, l3_biases=l3_bias,
    )
```

---

## Phase 4: Search Upgrades

### 4.1 — Iterative Deepening (`src/search/id.rs`)

Replace single-depth `search_root()`:
```rust
pub struct SearchStats {
    pub best_move: u16,
    pub best_score: i16,
    pub nodes: u64,
    pub volatility: f32,
    pub threat_delta: i16,
    pub contempt: i16,
}

pub fn search_root_id(
    state: &mut GameState,
    max_depth: i8,
    time_limit_ms: u64,
    tt: &mut TranspositionTable,
    ctrl: &mut SearchControl,
) -> SearchStats {
    let mut best_move = Move(0);
    let mut best_score = 0i16;
    let mut prev_score = 0i16;
    let mut volatility = 0.0f32;

    for depth in 1..=max_depth {
        if ctrl.stop || ctrl.time_up() { break; }

        // Aspiration windows (depth >= 3)
        let (alpha, beta) = if depth >= 3 {
            (best_score - 25, best_score + 25)
        } else { (-INFINITY, INFINITY) };

        let result = search_with_windowing(state, depth, alpha, beta, tt, ctrl);

        // Track volatility
        if depth >= 2 {
            let delta = (result.score - prev_score).abs() as f32;
            volatility = volatility * 0.7 + delta * 0.3;
            prev_score = result.score;
        }

        // Defensive: don't stop when getting mated
        if result.score > -MATE_SCORE + MAX_PLY as i16 {
            best_move = result.best_move;
            best_score = result.score;
        } else {
            // Being mated — continue searching
            best_move = result.best_move;
            best_score = result.score;
        }
    }

    SearchStats {
        best_move: best_move.0,
        best_score,
        nodes: ctrl.nodes,
        volatility,
        threat_delta: 0,  // filled by null-move extraction
        contempt: compute_contempt(best_score),
    }
}
```

### 4.2 — Aspiration Windows (`src/search/aspiration.rs`)

```rust
const ASPIRATION_WINDOW: i16 = 25;

pub fn search_with_windowing(
    state: &mut GameState,
    depth: i8,
    mut alpha: i16,
    mut beta: i16,
    tt: &mut TranspositionTable,
    ctrl: &mut SearchControl,
) -> SearchResult {
    let mut delta = ASPIRATION_WINDOW;

    loop {
        let result = search_root(state, depth, alpha, beta, tt, ctrl);

        if result.score <= alpha {
            // Fail-low: widen downward
            if alpha == -INFINITY { return result; }
            alpha = (alpha - delta).max(-INFINITY);
            delta = delta.saturating_mul(2);
        } else if result.score >= beta {
            // Fail-high: widen upward
            if beta == INFINITY { return result; }
            beta = (beta + delta).min(INFINITY);
            delta = delta.saturating_mul(2);
        } else {
            return result;
        }

        if ctrl.stop || ctrl.time_up() { break; }
    }

    // Fallback: full window
    search_root(state, depth, -INFINITY, INFINITY, tt, ctrl)
}
```

### 4.3 — Variance Tracker (`src/search/variance.rs`)

```rust
pub struct VarianceTracker {
    pub prev_scores: Vec<i16>,
    pub stability: Vec<f32>,  // running average of |score_delta|
}

impl VarianceTracker {
    pub fn new(num_root_moves: usize) -> Self { ... }

    pub fn update(&mut self, moves: &[(Move, i16)]) {
        // Compute |delta| for each root move, smooth into stability
        for (i, &(_, score)) in moves.iter().enumerate() {
            let prev = self.prev_scores.get(i).copied().unwrap_or(score);
            let delta = (score - prev).abs() as f32;
            let s = self.stability.get(i).copied().unwrap_or(0.0);
            self.stability[i] = s * 0.6 + delta * 0.4;
        }
        self.prev_scores = moves.iter().map(|&(_, s)| s).collect();
    }

    /// When multiple moves score within 20cp, pick the most stable
    pub fn select_stable(&self, candidates: &[(Move, i16)]) -> usize {
        if candidates.len() < 2 { return 0; }
        let best = candidates.iter().map(|&(_, s)| s).max().unwrap_or(0);
        let pool: Vec<usize> = candidates.iter().enumerate()
            .filter(|&(_, &(_, s))| (best - s).abs() <= 20)
            .map(|(i, _)| i)
            .collect();

        if pool.len() >= 2 {
            *pool.iter()
                .min_by(|&&a, &&b| self.stability[a].partial_cmp(&self.stability[b]).unwrap())
                .unwrap()
        } else {
            candidates.iter().enumerate()
                .max_by_key(|&(_, &(_, s))| s)
                .map(|(i, _)| i).unwrap_or(0)
        }
    }
}
```

### 4.4 — Null-Move Threat Extraction

**Extend `search.rs` null-move logic:**

```rust
fn search_position(state, depth, alpha, beta, ply, tt, ctrl, killers, history) -> i16 {
    // ... standard search preamble ...

    // Null-move pruning with threat extraction
    if depth >= 3 && !is_in_check(&state) && !is_endgame(&state) {
        let mut null_state = state.clone();
        null_state.side_to_move = null_state.side_to_move.opposite();
        null_state.en_passant_sq = None;

        let r = if depth > 6 { 3 } else { 2 };
        let null_score = -search_position(null_state, depth - 1 - r, -beta, -beta + 1, ply + 1, tt, ctrl, killers, history);

        if null_score >= beta { return beta; }

        // Threat extraction
        let current_eval = evaluate(&state);
        let threat_delta = current_eval - null_score;
        if threat_delta > 200 {
            // Severe threat detected — candidate moves that prevent
            // this score drop get extension
            state.threat_delta = threat_delta;
        } else {
            state.threat_delta = 0;
        }
    }

    // ... rest of search — move loop with extension for threat-neutralizing moves ...
}
```

### 4.5 — Swindle Mode (`src/search/swindle.rs`)

```rust
pub struct SwindleMode {
    pub active: bool,
}
impl SwindleMode {
    /// Called from evaluate() when score < -300cp
    pub fn modify_move_ordering(&self, m: Move, base_score: i32) -> i32 {
        if !self.active { return base_score; }
        let mut bonus = 0;
        if m.is_capture() { bonus += 150; }          // keep tension
        if m.is_promotion() { bonus += 200; }        // imbalance
        // Check if move trades queen
        if is_queen_trade(m) { bonus -= 500; }       // avoid simplification
        base_score + bonus
    }

    /// Penalize positional simplicity
    pub fn complexity_bonus(&self, state: &GameState, score: i32) -> i32 {
        if !self.active { return 0; }
        let mobility = count_legal_moves(state);
        let tension = count_pawn_tension(state);
        ((mobility as i32) * 2 + (tension as i32) * 5).min(150)
    }
}
```

---

## Phase 5: Contempt System

### Three-Tier Gradient

```rust
/// Compute contempt factor based on current evaluation.
/// Returns value in centipawns applied as eval offset.
pub fn compute_contempt(eval_score: i16) -> i16 {
    match eval_score {
        // Tier 1: Slightly losing — seek draws, simplify
        s if s > -150 && s < 0 => -20,

        // Tier 2: Clearly losing — trust fortress detection, zero bias
        s if s > -300 => 0,

        // Tier 3: Desperate — avoid draws, create chaos
        _ => 50,
    }
}
```

### Contempt Application Points

```
1. Evaluation offset:
   final_score = nnue_eval(state) + compute_contempt(eval_score)

2. Draw score override:
   repetition_value = contempt >= 0 ? 0 : contempt  (negative contempt makes draws attractive)

3. Move ordering influence:
   Tier 1 (negative contempt): bonus for captures that trade pieces
   Tier 3 (positive contempt): bonus for checks, promotions, queen moves

4. 50-move rule:
   Tier 1: pursue 50-move draws (Snake Protocol active)
   Tier 3: avoid 50-move draws (play for tricks)
```

### Contempt × Snake Protocol × Swindle Mode Interaction

```
Score Range       Contempt   Primary System     Strategy
────────────────────────────────────────────────────────────
0 to -150cp       Negative   Snake Protocol     Simplify, trade pieces
                                                   Seek 7-piece endgames
                                                   Tablebase Magnetism active

-150 to -300cp    Zero       Fortress Detection  Lock position
                                                   Seek opposite bishops
                                                   Gridlock pawn structure
                                                   "Bend without breaking"

Below -300cp      Positive   Swindle Mode        Create chaos
                                                   Avoid trades
                                                   Maximize complexity
                                                   "Nothing to lose"
```

These three tiers are **mutually exclusive by design** — each activates in its own score range. No conflict.

---

## Phase 6: WASM Bridge Updates

### Update `src/lib.rs`

**New WASM bindings:**
*(Note: You MUST compile with `RUSTFLAGS="-C target-feature=+simd128"` and use `core::arch::wasm32` for the NNUE accumulator, otherwise TS handcrafted eval will out-perform WASM!)*

```rust
#[wasm_bindgen]
impl VortexCore {
    // Existing API (unchanged):
    // new(), reset_board(), set_side_to_move(), add_piece(), etc.

    // Updated search: returns JSON with full stats
    pub fn search(&mut self, depth: i8, time_limit_ms: u64) -> JsValue {
        let stats = search_root_id(&mut self.state, depth, time_limit_ms,
                                    &mut self.tt, &mut self.ctrl);
        // Return { best_move, score, nodes, volatility, threat_delta, contempt }
        serde_wasm_bindgen::to_value(&stats).unwrap()
    }

    // Evaluate position (for TS bridge)
    pub fn evaluate(&self) -> i32 {
        let mut score = if self.weights.is_loaded {
            self.state.nnue.evaluate(&self.state)
        } else {
            evaluate_handcrafted(&self.state)
        };

        // HYBRID EVALUATION: Always apply defensive personality modifiers
        // on top of the base positional score (NNUE or handcrafted).
        // This prevents Vortex from becoming a generic Stockfish clone.
        score += tablebase_magnetism(&self.state, score);
        score += simplification_bonus(&self.state, score);
        score = fortress_scale(&self.state, score);

        score
    }

    // NNUE status
    pub fn get_game_phase(&self) -> u8 { game_phase(&self.state).1 as u8 }
    pub fn is_nnue_loaded(&self) -> bool { self.weights.is_loaded }
    pub fn get_contempt(&self) -> i16 {
        let score = self.evaluate();
        compute_contempt(score as i16)
    }
    pub fn get_volatility(&self) -> f32 { self.last_volatility }

    // Threat extraction
    pub fn get_threat_delta(&self) -> i16 { self.state.threat_delta }
}
```

---

## Execution Sequence & Timeline

```
Week 1-2   Phase 1.1-1.4   types.rs, accumulator.rs, weights.rs, forward.rs
Week 3     Phase 1.5-1.6   evaluate.rs, network.rs
Week 4     Phase 1.7-1.8   serialize.rs, state.rs integration
           ── Checkpoint 1 ── cargo test --test nnue_test passes

Week 5     Phase 2         Rewrite evaluate.rs (handcrafted fallback)
           ── Checkpoint 2 ── cargo test --test eval_test passes
           ── Checkpoint 2 ── npm test (TS bridge integration)

Week 6-7   Phase 3.1-3.2   Data generation + label pipeline tools
Week 8-9   Phase 3.3-3.4   Python training + export
           ── Checkpoint 3 ── First .vortex weights loaded via WASM

Week 10    Phase 4.1-4.2   Iterative deepening + aspiration windows
Week 11    Phase 4.3-4.5   Variance tracker, threat extraction, swindle mode
Week 12    Phase 5         Contempt system integration
           ── Checkpoint 4 ── npm run derby:quick (100-round blitz match)
```

---

## Testing Strategy

| Test | What It Validates | Command |
|------|-------------------|---------|
| **Phase 1** | Accumulator full_refresh == incremental result | `cargo test --test nnue_test --test accumulator_consistency` |
| **Phase 1** | Multiplicative FT: output range [0..127], sparsity ~75% | `cargo test --test nnue_test --test ft_output_properties` |
| **Phase 1** | Phase embeddings correct bucket selection | `cargo test --test nnue_test --test phase_bucket_mapping` |
| **Phase 1** | Round-trip serialize/deserialize identity | `cargo test --test serialize_test` |
| **Phase 2** | Starting position = 0, Scholar's Mate > 500cp | `cargo test --test eval_test` |
| **Phase 2** | Defensive eval matches TypeScript on 100 test positions | `npm test` (TS integration) |
| **Phase 4** | Depth 6 finds Scholar's Mate in < 1M nodes | `cargo test --test search_test --test mate_detection` |
| **Phase 4** | Volatility higher in tactical positions | `cargo test --test search_test --test volatility_metric` |
| **Phase 5** | Contempt offset applied correctly at each tier | `cargo test --test contempt_test` |
| **All** | No regressions in legal move generation | `cargo test --test board_test` |
| **All** | 100-round blitz match vs baseline | `npm run derby:quick` |

---

## Files Changed Summary

| File | Action | Phase |
|------|--------|-------|
| `src/nnue/types.rs` | **NEW** | 1 |
| `src/nnue/accumulator.rs` | **NEW** | 1 |
| `src/nnue/weights.rs` | **NEW** | 1 |
| `src/nnue/forward.rs` | **NEW** | 1 |
| `src/nnue/evaluate.rs` | **NEW** | 1 |
| `src/nnue/network.rs` | **NEW** | 1 |
| `src/nnue/serialize.rs` | **NEW** | 1 |
| `src/nnue.rs` | **DELETE** (split into modules) | 1 |
| `src/state.rs` | **EDIT** (add IncrementalNetwork) | 1 |
| `src/search.rs` | **EDIT** (threat extraction, lazy eval) | 1, 4 |
| `src/evaluate.rs` | **REWRITE** (handcrafted fallback) | 2 |
| `src/search/id.rs` | **NEW** | 4 |
| `src/search/aspiration.rs` | **NEW** | 4 |
| `src/search/variance.rs` | **NEW** | 4 |
| `src/search/swindle.rs` | **NEW** | 4 |
| `src/contempt.rs` | **NEW** | 5 |
| `tools/generate_training_data/main.rs` | **NEW** | 3 |
| `tools/label_positions/main.rs` | **NEW** | 3 |
| `tools/train/train.py` | **NEW** | 3 |
| `tools/train/export.py` | **NEW** | 3 |
| `src/lib.rs` | **EDIT** (WASM bindings) | 6 |
| `Cargo.toml` | **EDIT** (add serde-wasm-bindgen, rayon) | 6 |
