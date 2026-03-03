# replay mode

## what this is

Replay mode ingests canonical `mbt.evt.v1` JSONL logs and renders a static BT layout with tick-based state repaint.

## when to use it

Use replay mode when you need deterministic post-run inspection, debugging, or report screenshots.

## how it works

- file load parses JSONL line-by-line via `@muesli/replay`
- optional sidecar tick index (`events.sidecar.tick-index.v1.json`) can be loaded with the JSONL file
- parsed events are appended to a `ReplayStore`
- tree layout is computed once from `bt_def.nodes/edges` (supports `from/to` and `parent/child` edge variants)
- tick scrubbing recolours nodes using indexed `node_status` events
- blackboard diff panel shows `bb_write`/`bb_delete` for selected tick
- `bt_def.dsl` is editable in a dedicated panel:
  - `apply` compiles the draft DSL and refreshes the rendered tree immediately
  - `revert` restores the runtime definition from log events
  - `save` writes the draft via browser save picker, or downloads if picker API is unavailable
- fixture bundle support is validated by `studio inspect` using `@muesli/replay/node`, then the same `events.jsonl` can be opened in replay UI
- replay UI now shows load progress, indexed/unindexed status, and explicit fallback warning for large unindexed logs
- for large indexed logs, replay starts in lazy sidecar mode (bootstrap + first tick), then parses additional tick ranges on scrub demand
- demo bootstrapping can auto-load replay files via URL query (`demo_fixture`, optional `demo_sidecar`)

## api / syntax

Input: `.jsonl` where each line matches `mbt.evt.v1`.

Bundle validation input (CLI): directory containing at least `manifest.json` + `events.jsonl`.

## example

1. Validate a fixture bundle:

```bash
pnpm studio inspect tests/fixtures/determinism_replay --schema tests/fixtures/schema/mbt.evt.v1.schema.json
```

2. Open [`tests/fixtures/determinism_replay/events.jsonl`](../../../tests/fixtures/determinism_replay/events.jsonl) in studio and scrub ticks `1..2`.

3. Edit `bt_def.dsl`, click `apply`, and confirm the tree panel updates.

4. For large logs, also open [`tests/fixtures/large_replay/events.sidecar.tick-index.v1.json`](../../../tests/fixtures/large_replay/events.sidecar.tick-index.v1.json) before opening `events.jsonl`.

Quick demo launcher:

```bash
pnpm demo
```

## gotchas

- invalid lines are skipped and surfaced as parse warnings
- replay UI consumes JSONL; bundle-level validation happens in Node tooling (`studio inspect`)
- current lazy mode still keeps the full JSONL text in browser memory; follow-up work can switch to `File.slice` ranges
- newer runtime event variants are retained in the stream even when UI panels do not yet render dedicated widgets
- DSL compile errors are shown inline and do not mutate the currently rendered tree

## see also

- [`schema/mbt.evt.v1.schema.json`](../../../schema/mbt.evt.v1.schema.json)
- [`packages/replay`](../../../packages/replay)
- [`docs/studio/contract-consumption.md`](../../../docs/studio/contract-consumption.md)
- [`live monitoring`](./live.md)
