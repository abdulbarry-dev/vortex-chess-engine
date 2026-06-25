---
name: performance-profiling
description: Use when measuring or improving engine throughput — nodes-per-second, hot-spot analysis, optimization of hot loops, or benchmarking search and move generation performance.
---

# Performance Profiling

## Key metrics

| Metric | Current target |
|---|---|
| Nodes/sec | ~50,000 |
| Depth 4 search | ~573ms, ~8,000 nodes |
| Depth 5 search | ~2-3s, ~50,000 nodes |
| Depth 6 search | ~10-15s, ~300,000 nodes |

## Available tooling

- `npm test -- tests/Search.test.ts` — spot-check search speed (depth 2-4)
- Perft depth 4 (~197k nodes) via `tests/Perft.test.ts` — sanity check movegen speed
- V8/Node.js: `node --prof dist/cli.js` for flame graphs; `node --trace-opt`, `--trace-deopt`
- Manual: insert `performance.now()` markers, run `node --allow-natives-syntax`

## Typical optimization targets (in priority order)

1. **Move generation** — per-piece loops, sliding ray computation
2. **Legality checking** — in-check detection during search
3. **Evaluation** — piece-square table lookups, pawn structure analysis
4. **Transposition table** — hash computation, probe/replace logic
5. **Move ordering** — sort comparator overhead

## Gotchas

- `noUnusedLocals` is on — remove dead code as you go, or `_`-prefix intentional no-ops.
- Profile **after** correctness: run `npm test` before/after any perf change.
- The Vite-built IIFE (`dist/vortex-engine.iife.js`) is minified by esbuild — profile the CLI path (`dist/cli.js`) via `npm start` instead, which is compiled separately by tsc without minification.
- Node.js `--prof` output is processor-model-specific. Use `node --prof-process` on the same machine.
- Single-threaded: no parallel search. All optimization is per-thread throughput.
