# replay mode (P0/P1)

## what this is

Replay mode ingests canonical `mbt.evt.v1` JSONL logs and renders a static BT layout with tick-based state repaint.

## when to use it

Use replay mode when you need deterministic post-run inspection, debugging, or report screenshots.

## how it works

- file load parses JSONL line-by-line via `@muesli/replay`
- parsed events are appended to a `ReplayStore`
- tree layout is computed once from `bt_def.nodes/edges` (supports `from/to` and `parent/child` edge variants)
- tick scrubbing recolours nodes using indexed `node_status` events
- blackboard diff panel shows `bb_write`/`bb_delete` for selected tick
- fixture bundle support is validated by `studio inspect` using `@muesli/replay/node`, then the same `events.jsonl` can be opened in replay UI

## api / syntax

Input: `.jsonl` where each line matches `mbt.evt.v1`.

Bundle validation input (CLI): directory containing at least `manifest.json` + `events.jsonl`.

## example

1. Validate a fixture bundle:

```bash
pnpm studio inspect tests/fixtures/determinism_replay --schema tests/fixtures/schema/mbt.evt.v1.schema.json
```

2. Open [`tests/fixtures/determinism_replay/events.jsonl`](../../../tests/fixtures/determinism_replay/events.jsonl) in studio and scrub ticks `1..2`.

## gotchas

- invalid lines are skipped and surfaced as parse warnings
- replay UI consumes JSONL; bundle-level validation happens in Node tooling (`studio inspect`)
- newer runtime event variants are retained in the stream even when UI panels do not yet render dedicated widgets

## see also

- [`schema/mbt.evt.v1.schema.json`](../../../schema/mbt.evt.v1.schema.json)
- [`packages/replay`](../../../packages/replay)
- [`docs/studio/contract-consumption.md`](../../../docs/studio/contract-consumption.md)
- [`live monitoring`](./live.md)
