# VORTEX-2.0 NNUE Architecture

The Vortex Chess Engine implements a highly specialized, incrementally updated Neural Network (NNUE) designed specifically to evaluate defensive structures, king safety, and positional threats. 

Unlike massive generic NNUEs (like Stockfish's HalfKAv2), Vortex uses a dual-accumulator topology to process basic piece placements alongside explicit dynamic threats.

## 1. High-Level Topology

The network follows a **`(PST_IN + THREAT_IN) -> 16x2 -> 32 -> 1`** architecture.

1. **Input Features:** Two distinct sets of sparse features (PST and Threats).
2. **Accumulators (L0):** Two distinct 16-neuron accumulators per color (`PstAccumulator` and `ThreatAccumulator`).
3. **Hidden Layer (L1):** 32 neurons with clipped ReLU activation.
4. **Output Layer (L2):** 1 final neuron representing the static evaluation in centipawns.

---

## 2. The Input Features

### A. PST Features (Piece-Square Tables)
Inspired by HalfKP, these features evaluate where pieces are located relative to the King.
* **King Bucketing:** The board is divided into 9 symmetrical "buckets". The feature index depends heavily on which bucket the King is currently occupying.
* **Perspectives:** Features are mirrored for White and Black perspectives.
* **Updates:** Updated incrementally on every move (`make_move`), and completely refreshed if the King moves (since it changes the bucket).

### B. Threat Features (Attacker-Victim Maps)
This is Vortex's unique defensive mechanism. Instead of just looking at where pieces sit, the network explicitly tracks **who is attacking whom**.
* **Mapping:** Evaluates relationships in the format `Attacker (PieceType + Square)` → `Victim (PieceType + Square)`.
* **Cold-Starts:** Populated fully from scratch on turn 1 or after a null-move, then updated incrementally using `ThreatDelta` arrays.
* **Perspective:** Threat geometry is vertically flipped for the Black perspective to ensure symmetrical evaluation.

---

## 3. The Accumulator Stack

To ensure extreme performance (tens of millions of nodes per second), the network does not calculate from scratch. It uses an **Incremental Stack**.

1. **State Tracking:** `IncrementalNetwork` maintains a stack of 256 `PstAccumulator` and `ThreatAccumulator` arrays.
2. **Push/Pop:** During the search tree's `make_move` and `unmake_move`, the engine just pushes and pops pointers to the accumulators, applying fast vector addition/subtraction (deltas) instead of doing matrix multiplication.
3. **Lazy Evaluation:** `ensure_accurate()` is called right before evaluation. If the state was flagged as "stale" (e.g. from a king move or a complex capture sequence), it flushes the pending deltas or forces a hard refresh.

---

## 4. Forward Pass & Quantization

When `evaluate()` is called, the network executes the forward pass:

1. **Concatenation:** The 16 White PST, 16 Black PST, 16 White Threat, and 16 Black Threat neurons are concatenated into a single 64-element array. *Note: The active player's neurons are always placed first to give the network side-to-move context.*
2. **L1 (Hidden):** The 64 inputs are multiplied by the `L1_WEIGHTS`, accumulated into 32 buckets, and passed through a `Clipped ReLU` (values clamped between 0 and 127).
3. **L2 (Output):** The 32 hidden neurons are multiplied by the `L2_WEIGHTS` to produce the final scalar evaluation score.
4. **Dequantization:** Because the network uses fast 16-bit integer math (i16) during the search, the final output is divided by `QA * QB` (the quantization constants used during PyTorch training) to return a human-readable centipawn score.
