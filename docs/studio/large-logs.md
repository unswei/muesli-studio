# large log workflow

## what this is

This page describes the practical replay workflow for large `events.jsonl` logs in `muesli-studio`.

## when to use it

Use this workflow when:

- the replay file is a few megabytes or larger
- you need repeated scrubbing across many ticks
- the log is served over HTTP and you want fast seeks

## how it works

1. Open `events.jsonl`.
2. Also open `events.sidecar.tick-index.v1.json` when it exists.
3. Studio marks the replay as `indexed`.
4. Large indexed replays bootstrap lazily:
   - metadata and early events load first
   - later tick ranges hydrate on scrub demand
5. Local files use `File.slice` for range reads.
6. URL-backed replays use HTTP byte ranges when the host supports them.

Without a sidecar, Studio falls back to a full scan and shows a warning for large logs.

## api / syntax

Expected file names:

- `events.jsonl`
- optional `events.sidecar.tick-index.v1.json`

Demo query parameters:

- `demo_fixture=/demo/<fixture>/events.jsonl`
- `demo_sidecar=/demo/<fixture>/events.sidecar.tick-index.v1.json`

## example

```bash
pnpm fixtures:large
pnpm studio inspect tests/fixtures/large_replay --out /tmp/large_run_summary.json
pnpm bench:sidecar
```

Then open:

- `tests/fixtures/large_replay/events.jsonl`
- `tests/fixtures/large_replay/events.sidecar.tick-index.v1.json`

The Studio replay header should show `indexed replay` rather than `full scan`.

## gotchas

- lazy URL replay needs HTTP byte-range support from the host serving `events.jsonl`
- invalid or stale sidecars fall back to normal parsing
- bundle export hydrates the remaining ticks first so the exported `events.jsonl` stays complete

## see also

- [sidecar tick index](./sidecar-index.md)
- [fixture bundles and studio inspect](./fixture-bundles.md)
- [studio replay mode](../../apps/studio/docs/replay.md)
