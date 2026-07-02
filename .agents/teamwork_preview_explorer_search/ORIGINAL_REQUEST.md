## 2026-07-02T08:40:45Z
<USER_REQUEST>
Conduct a deep read-only audit of the search and evaluation mechanisms in vortex-core/src/search/ and vortex-core/src/evaluate.rs.
Focus areas:
1. Root TT bounds: Check vortex-core/src/search/mod.rs and verify how transposition table bounds at root are stored (exact vs alpha/beta bounds).
2. Quiescence quiet filtering: Check vortex-core/src/search/mod.rs and verify if quiet moves are being scored/sorted in quiescence search.
3. Root TT move ordering: Check vortex-core/src/search/mod.rs and verify if root TT move ordering is present.
4. Pawn tension sign reversal: Check HCE pawn tension evaluation in vortex-core/src/evaluate.rs and verify if white attacking black increases score or if it's reversed.
5. King safety scaling: Check king safety evaluation in vortex-core/src/evaluate.rs and check if difference in safety or raw score is scaled.
6. Swindle complexity: Check vortex-core/src/search/swindle.rs and verify color-aware pawn attacks in swindle complexity evaluation.
7. Defensive Philosophy: Read docs in docs/research/ (specifically defensive-philosophy.md, defensive-evaluation.md, etc.) and verify if the evaluation function aligns with prophylaxis, fortress scale, and defensive grandmaster concepts.
Deliverable: Write a detailed handoff report saved to 'handoff.md' in your working directory. Send a message to me (the parent) when done.
</USER_REQUEST>
