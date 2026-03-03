# sidecar tick index

## what this is

The sidecar tick index is an optional JSON file stored next to an event log.  
It records tick-to-byte ranges for `events.jsonl` so tooling can resolve tick slices without scanning the whole file each time.

Schema identifier: `mbt.sidecar.tick-index.v1`.

## when to use it

Use a sidecar index when:

- replay logs are large (for example `tests/fixtures/large_replay/events.jsonl`)
- repeated tick seeks are required
- you want deterministic parity checks between indexed and non-indexed load paths

## how it works

1. A generator scans `events.jsonl`.
2. It records the byte range where each tick starts and ends.
3. Studio and replay tooling may use the sidecar path when present.
4. If sidecar parsing fails, tooling falls back to normal full-scan JSONL parsing and emits a warning.

## api / syntax

Minimal shape:

```json
{
  "schema": "mbt.sidecar.tick-index.v1",
  "source": "events.jsonl",
  "event_count": 30002,
  "max_tick": 5000,
  "events_sha256": "…",
  "tick_entries": [
    {
      "tick": 1,
      "byte_start": 1024,
      "byte_end": 2048,
      "line_start": 3,
      "first_seq": 3
    }
  ]
}
```

## example

```bash
pnpm fixtures:large
pnpm studio inspect tests/fixtures/large_replay --out /tmp/large_run_summary.json
pnpm bench:sidecar
pnpm bench:sidecar -- --check
```

The generator writes `tests/fixtures/large_replay/events.sidecar.tick-index.v1.json`.

## gotchas

- byte offsets are UTF-8 byte offsets, not character offsets.
- sidecar files are optional. Missing or invalid sidecars should not block replay.
- sidecar and `events.jsonl` must stay in sync. Regenerate both together when fixtures change.

## see also

- `tools/fixtures/generate-large-bundle.ts`
- `packages/replay/src/sidecar/tick-index.ts`
- `tests/benchmarks/sidecar-large_replay.json`
- `docs/studio/fixture-bundles.md`
