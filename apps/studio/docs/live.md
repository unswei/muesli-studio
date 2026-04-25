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
- when live inspection is pinned, studio freezes the current inspection moment and buffers later events until you resume live
- the live panel can save the current captured session as a replayable bundle, including buffered events that arrived while pinned
- the live panel summarises the current view mode, buffer size, dropped payloads, reconnect attempts, and latest retry state
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
3. When an interesting moment arrives, click `pin now` to freeze inspection at that point.
4. Continue scrubbing and inspecting. New events stay buffered until you click `resume live`.
5. Use `save capture bundle` to write the current captured run to a replayable archive.
6. Reopen the capture from `open replay`. Studio reads the archive and restores the run as a normal replay with the sidecar index.

## gotchas

- malformed live payloads are skipped and surfaced in ingest warnings
- moving the tick scrubber disables auto-follow until re-enabled
- pinning live inspection buffers new events in memory until you resume live
- `save capture bundle` writes the currently captured run, plus any buffered pinned events, into a replayable archive
- malformed live payloads count as dropped payloads in the live panel; the raw warning remains available in ingest warnings
- disabling auto-reconnect prevents automatic retry after unexpected closes
- replay bundle loading expects `events.jsonl` inside the archive, with `events.sidecar.tick-index.v1.json` used when present
- runtime may emit event variants that are not yet rendered in dedicated UI widgets; those events are still retained for replay integrity

## see also

- [replay mode](./replay.md)
- [inspector bridge](../../inspector/README.md)
