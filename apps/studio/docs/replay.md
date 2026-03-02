# replay mode (P0)

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

## api / syntax

Input: `.jsonl` where each line matches `mbt.evt.v1`.

## example

Load [`tools/fixtures/minimal_run.jsonl`](../../../tools/fixtures/minimal_run.jsonl), then scrub ticks `1..2`.

## gotchas

- invalid lines are skipped and surfaced as parse warnings
- replay mode does not connect to live WebSocket streams (P1)

## see also

- [`schema/mbt.evt.v1.schema.json`](../../../schema/mbt.evt.v1.schema.json)
- [`packages/replay`](../../../packages/replay)
- [`live monitoring`](./live.md)
