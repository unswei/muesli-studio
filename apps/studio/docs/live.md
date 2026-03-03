# live monitoring

## what this is

Live monitoring connects studio to a running inspector WebSocket stream and appends incoming canonical events into the same replay engine used for file replay.

## when to use it

Use this mode when you need real-time visibility while preserving replay compatibility.

## how it works

- studio opens a WebSocket connection (default `ws://localhost:8765/events`)
- incoming messages are parsed as canonical event payloads (single-line or JSONL batches)
- validated events are appended to the in-memory replay store
- when auto-follow is enabled, studio keeps the selected tick pinned to the newest tick
- if a connection drops unexpectedly, studio retries with exponential backoff (when auto-reconnect is enabled)
- live controls include a connection history panel to inspect retries and errors
- live ingest and replay mode share the same store path, so tick navigation behaviour stays consistent between modes

## api / syntax

Input protocol: `mbt.evt.v1` JSON events over WebSocket text frames.

## example

1. Start inspector:

```bash
apps/inspector/build/mbt_inspector --attach mock --ws :8765 --run-loop '{"max_ticks":100}' --tick-hz 20 --log /tmp/live.jsonl
```

2. Start studio and click connect to `ws://localhost:8765/events`.

## gotchas

- malformed live payloads are skipped and surfaced in ingest warnings
- moving the tick scrubber disables auto-follow until re-enabled
- disabling auto-reconnect prevents automatic retry after unexpected closes
- runtime may emit event variants that are not yet rendered in dedicated UI widgets; those events are still retained for replay integrity

## see also

- [replay mode](./replay.md)
- [inspector bridge](../../inspector/README.md)
