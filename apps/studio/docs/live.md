# live monitoring (P1)

## what this is

Live monitoring connects studio to a running inspector WebSocket stream and appends incoming canonical events into the same replay engine used for file replay.

## when to use it

Use this mode when you need real-time visibility while preserving replay compatibility.

## how it works

- studio opens a WebSocket connection (default `ws://localhost:8765/events`)
- incoming messages are parsed as canonical event payloads (single-line or JSONL batches)
- validated events are appended to the in-memory replay store
- when auto-follow is enabled, studio keeps the selected tick pinned to the newest tick

## api / syntax

Input protocol: `mbt.evt.v1` JSON events over WebSocket text frames.

## example

1. Start inspector:

```bash
/Users/z3550628/Code/2026/muesli-studio/apps/inspector/build/mbt_inspector --ws :8765 --log /tmp/live.jsonl --demo-ticks 100
```

2. Start studio and click connect to `ws://localhost:8765/events`.

## gotchas

- malformed live payloads are skipped and surfaced in ingest warnings
- moving the tick scrubber disables auto-follow until re-enabled

## see also

- [replay mode](/Users/z3550628/Code/2026/muesli-studio/apps/studio/docs/replay.md)
- [inspector bridge](/Users/z3550628/Code/2026/muesli-studio/apps/inspector/README.md)
