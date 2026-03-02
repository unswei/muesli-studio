# mbt_inspector

## what this is

`mbt_inspector` is the P1 runtime bridge binary. It emits canonical `mbt.evt.v1` events, streams them over WebSocket, and optionally writes the same payloads to JSONL.

## when to use it

Use it when validating studio live monitoring (`ws://host:port/events`) and when recording reproducible logs from the same event stream.

## how it works

- starts a WebSocket server (`--ws`)
- emits canonical events (`run_start`, `bt_def`, tick events)
- broadcasts each event to connected clients
- writes the exact same event string to `--log` when enabled

The current implementation uses a deterministic demo emitter. Runtime integration with muesli-bt is tracked as follow-up work.

## api / syntax

```bash
mbt_inspector --connect mock --ws :8765 --log /tmp/run.jsonl --demo-ticks 20 --tick-ms 200
```

Key options:

- `--connect <backend>`: backend label included in `run_start`
- `--ws <host:port|:port>`: WebSocket bind address
- `--log <path>`: JSONL output file
- `--run-loop <cfg>`: reserved for runtime loop config
- `--demo-ticks <n>`: number of demo ticks (`0` means run until interrupted)
- `--tick-ms <n>`: interval per tick in milliseconds
- `--startup-delay-ms <n>`: delay before first emitted event (useful for integration tests and client bootstrap)

## example

```bash
cmake --preset default -S apps/inspector
cmake --build apps/inspector/build --config Release
apps/inspector/build/mbt_inspector --ws :8765 --log /tmp/live-run.jsonl --demo-ticks 50
```

## gotchas

- the server accepts `/events` path but does not require it
- newly connected clients receive cached `run_start` and `bt_def` envelopes for replay bootstrap
- this is a bootstrap bridge, not yet linked to muesli-bt runtime internals

## see also

- [studio replay docs](../studio/docs/replay.md)
- [schema contract](../../schema/mbt.evt.v1.schema.json)

## testing

After building inspector, run:

```bash
pnpm inspector:test
```

This integration check asserts WebSocket payloads and JSONL sink lines are identical.
