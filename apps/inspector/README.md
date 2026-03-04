# mbt_inspector

## what this is

`mbt_inspector` is the runtime bridge binary for studio. It runs a real `muesli-bt` host loop and forwards canonical `mbt.evt.v1` event lines to both WebSocket clients and an optional JSONL log sink.

## when to use it

Use it when you want one canonical runtime event stream for:

- live studio monitoring (`ws://host:port/events`)
- log capture for replay and CI validation

## how it works

- resolves `muesli-bt` via `find_package(muesli_bt CONFIG QUIET)` first, then pinned `FetchContent`
- links `muesli_bt::runtime`
- instantiates `bt::runtime_host`
- attaches an inspector backend profile (`--attach`)
- compiles a BT definition from the run-loop DSL
- ticks the instance and consumes runtime event lines from `event_log` line callbacks
- writes the exact same bytes to:
  - WebSocket payloads
  - JSONL output (`--log`)

## api / syntax

```bash
mbt_inspector --attach mock --ws :8765 --run-loop '{"max_ticks":200}' --tick-hz 20 --seed 7 --log /tmp/run.jsonl
```

Key options:

- `--attach <backend>`: backend profile name (`mock`, `demo`, `pybullet`, `webots`)
- `--ws <host:port|:port>`: WebSocket bind address
- `--log <path>`: JSONL output file path
- `--tick-hz <n>`: tick frequency in hertz
- `--run-loop <cfg-json-or-file>`: run-loop config source (inline JSON or file path)
- `--seed <n>`: deterministic runtime mode seed
- `--startup-delay-ms <n>`: startup delay before ticking (mainly for integration tests)
- `--quiet`: suppress stdout event echo

Run-loop config keys currently supported:

- `max_ticks` (or `maxTicks`)
- `tick_hz` (or `tickHz`)
- `tree_dsl` (or `dsl`)

## muesli-bt version pin

Pinned defaults are defined in [`cmake/MuesliBtVersion.cmake`](./cmake/MuesliBtVersion.cmake):

- `MUESLI_BT_GIT_URL`
- `MUESLI_BT_GIT_TAG`

Current default tag: `v0.2.0`.

## build instructions

### option 1: local installed muesli-bt

```bash
cmake --preset default -S apps/inspector -DCMAKE_PREFIX_PATH=/path/to/muesli-bt/install
cmake --build apps/inspector/build --config Release
```

### option 2: pinned fetchcontent fallback

```bash
cmake --preset default -S apps/inspector
cmake --build apps/inspector/build --config Release
```

After configure, inspector writes `apps/inspector/build/muesli_bt_paths.cmake` for schema/contract sync tooling.

## example

```bash
cmake --preset default -S apps/inspector
cmake --build apps/inspector/build --config Release
tools/sync_schema.sh
tools/sync_contract.sh
apps/inspector/build/mbt_inspector --attach mock --ws :8765 --run-loop '{"max_ticks":50}' --tick-hz 20 --log /tmp/live-run.jsonl
```

Connect studio to `ws://localhost:8765/events`.

## gotchas

- `/events` path is accepted but not required by the server
- `pybullet` uses real `muesli_bt::integration_pybullet` callbacks when that integration target is available
- `webots` uses real `muesli_bt::integration_webots` callbacks when that integration target is available (requires Webots SDK in the `muesli-bt` build environment)
- attach failures emit canonical `error` events and return non-zero
- inspector serialisation parity depends on a single runtime callback path; do not add a second JSON serialiser path

## see also

- [studio replay docs](../studio/docs/replay.md)
- [studio live docs](../studio/docs/live.md)
- [schema copy](../../schema/mbt.evt.v1.schema.json)
- [contract copy](../../contracts/muesli-studio-integration.md)
- [canonical contract (muesli-bt)](https://github.com/unswei/muesli-bt/blob/main/docs/contracts/muesli-studio-integration.md)

## testing

After building inspector, run:

```bash
pnpm inspector:test
```

This integration check asserts exact WS/JSONL byte equality and validates emitted events against `schema/mbt.evt.v1.schema.json`.

To run backend-specific checks explicitly:

```bash
pnpm inspector:test --attach webots --ticks 3 --tick-hz 100 --timeout-ms 8000
pnpm inspector:test --attach pybullet --ticks 3 --tick-hz 100 --timeout-ms 8000
```
