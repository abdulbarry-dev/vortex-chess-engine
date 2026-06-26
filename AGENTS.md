# Vortex Chess Engine — Agent Guide

## Quick start

```bash
npm install
npm run build:all   # must run before `npm start`
npm start           # UCI REPL on stdin
npm test            # vitest (all 30 test files)
npm run typecheck   # tsc --noEmit (tsconfig excludes tests/)
```

## Commands

| Command | What it does |
|---|---|
| `npm test` | `vitest run` — all tests. No --run flag needed |
| `npm run test:watch` | `vitest` (interactive watch mode) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run dev` | `vite build --watch` (library only, not CLI) |
| `npm run build` | `tsc && vite build` (types + library IIFE) |
| `npm run build:cli` | `tsc src/cli.ts --outDir dist …` + chmod (CommonJS) |
| `npm run build:all` | both of the above |
| `npm run test:self` | (no-op — `scripts/self-test.sh` does not exist) |
| `npm run test:performance` | `tsx scripts/elo-test.ts` (fails — `scripts/` missing) |

## Architecture

- **Two entrypoints**: `src/cli.ts` (Node UCI CLI, `#!/usr/bin/env node`) and `src/main.ts` (library / Worker IIFE entry, built by Vite).
- **Two UCI implementations**: `src/core/UciHandler.ts` (class, tested by vitest) and `src/cli.ts` (self-contained `UciInterface` class, not tested). Both exist, the CLI one is what `npm start` runs; they are similar but not identical.
- **Board**: 64-element flat array (`Piece | null`[64]), square 0 = a1, 63 = h8. Not 8×8.
- **Piece types**: `PieceType` enum (1-6: Pawn=1…King=6), `Color` enum (White=1, Black=-1).
- **Search stack**: `SearchEngine` → `IterativeDeepeningSearch` → `AlphaBetaSearch` (+ quiescence integrated). Separate modules exist for LMR, futility pruning, null-move pruning, aspiration windows, check extensions, MultiPV, pondering, PVS.
- **Types** live in `src/types/` (not scattered): `Move.types.ts`, `Search.types.ts`, `Board.types.ts`, `Evaluation.types.ts`, re-exported via `src/types/index.ts`.
- **Constants** in `src/constants/`: `SearchConstants.ts`, `PieceValues.ts`, `BoardConstants.ts`, `Positions.ts`. There is no `EvaluationWeights.ts` file (READAME is wrong).
- **Time manager** at `src/time/TimeManager.ts`, **OpeningBook** at `src/opening/OpeningBook.ts`, **EndgameTablebase** at `src/endgame/EndgameTablebase.ts`.

## Testing quirks

- Tests are **not** included in `tsconfig.json` (excluded). Vitest resolves them separately.
- Tests import from `../src/…` directly (no build step needed).
- Perft tests compare against known node counts (starting position, Kiwipete).
- `scripts/` directory **does not exist on disk** — `npm run test:self` and `npm run test:performance` will fail.
- `.github/copilot-instructions.md` referenced in README does not exist (`.github/` is gitignored and absent).

## Key deviations from README

The README is stale in several places:
- No `scripts/` or `.github/` directories exist.
- No `EvaluationWeights.ts` — weights are defined as `EvaluationWeights` interface in `src/types/Evaluation.types.ts`.
- README tree omits `src/types/`, `src/time/`, `src/endgame/`, `src/opening/`, and many `src/search/` modules.
- README tree lists `KingSafety.ts`, `MobilityEvaluator.ts`, `PawnStructure.ts` but actual eval files are `KingSafetyEvaluator.ts`, `MobilityEvaluator.ts`, `PawnStructureEvaluator.ts`.
- `dist/` is gitignored; always rebuild before running.

## Conventions

- Strict TypeScript (`strict: true` with all strict flags). `noUnusedLocals` and `noUnusedParameters` are on — dead code breaks the build.
- Comments use JSDoc (`@file`, `@description`). Preserve this style when adding doc comments.
- No `.env` files or runtime secrets.

## Research Knowledge Base

Vortex is a specialized defensive chess engine focused on prophylaxis, threat prediction, and fortress recognition. Whenever making architectural or evaluation changes, agents **MUST** consult the research knowledge base located in `docs/research/` to ensure the modifications align with the engine's defensive philosophy.

Key documents to review:
- `docs/research/defensive-philosophy.md`
- `docs/research/threat-prediction.md`
- `docs/research/fortress-recognition.md`
- `docs/research/overextension-detection.md`
- `docs/research/defensive-evaluation.md`
- `docs/research/defensive-grandmasters.md`
- `docs/research/engine-research.md`
- `docs/research/defensive-ai-opportunities.md`
- `docs/research/research-roadmap.md`

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
