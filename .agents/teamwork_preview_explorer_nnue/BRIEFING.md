# BRIEFING — 2026-07-02T09:43:24+01:00

## Mission
Audit NNUE core architecture in vortex-core/src/nnue/ focusing on dequantization multiplier, threat accumulator updates, and static weights lock type.

## 🔒 My Identity
- Archetype: Explorer
- Roles: Teamwork explorer
- Working directory: /home/vortex/Desktop/Projects/vortex-chess-engine/.agents/teamwork_preview_explorer_nnue
- Original parent: 360f6f16-2b42-4478-8e81-fee6fdcf6c6d
- Milestone: NNUE Core Architecture Audit

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- CODE_ONLY network mode

## Current Parent
- Conversation ID: 360f6f16-2b42-4478-8e81-fee6fdcf6c6d
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `vortex-core/src/nnue/forward.rs`
  - `vortex-core/src/nnue/network.rs`
  - `vortex-core/src/nnue/threat_map.rs`
  - `vortex-core/src/nnue/weights.rs`
  - `vortex-core/src/nnue/features.rs`
  - `vortex-core/src/types.rs`
- **Key findings**:
  - Math for the `512.0` dequantization multiplier in `forward.rs` is correct. It is equal to $2^{\text{FT\_SHIFT}}$ (where `FT_SHIFT` is 9), which scales the right-shifted product back to float space.
  - Threat map indexing is mathematically aligned between the training bridge (`features.rs`), full refresh (`refresh_threats`), and incremental update (`apply_threat_deltas`).
  - Discovered a double-sided threat leakage bug in `make_move` (`state.rs`) where threats between a moving piece and a captured piece are not removed because the pieces are removed from the board before the NNUE update is executed.
  - wrap-up of static weights in `RwLock` is correct to avoid SMP thread serialization, but using an atomic pointer/static reference would completely avoid atomic reader count cache line bouncing under high SMP core counts.
- **Unexplored areas**:
  - Verification of TS / Node UCI CLI implementation of NNUE features.

## Key Decisions Made
- Confirmed the math for dequantization multiplier.
- Confirmed threat map alignment, but identified the `make_move` state desync bug.
- Recommended optimization path for `WEIGHTS` lock contention.

## Artifact Index
- /home/vortex/Desktop/Projects/vortex-chess-engine/.agents/teamwork_preview_explorer_nnue/handoff.md — Final audit handoff report
