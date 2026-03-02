# muesli-studio

A monorepo for `muesli-studio` (web UI) and `mbt_inspector` (runtime bridge) around the canonical event stream `mbt.evt.v1`.

## current scope (P1)

Implemented in this milestone:

- monorepo layout (`apps`, `packages`, `schema`, `contracts`, `tools`)
- canonical schema/contract sourcing from the same resolved `muesli-bt` dependency used by inspector
- generated TypeScript protocol types + zod validation helpers
- replay engine package with JSONL ingest, indices, and query API
- replay-first studio app:
  - open `.jsonl`
  - tree rendering from `bt_def`
  - tick scrubber
  - node status colouring
  - blackboard diffs at selected tick
- studio live monitoring:
  - connect to WebSocket endpoint (`ws://host:port/events`)
  - append live events to the same replay engine
  - auto-follow newest tick toggle
  - pause/resume via auto-follow toggle
  - connection status + last event time
  - auto-reconnect with exponential backoff
  - connection history controls for unstable links
- runtime-backed inspector (`apps/inspector`):
  - CMake target `mbt_inspector`
  - links `muesli_bt::runtime`
  - links `muesli_bt::integration_pybullet` when available
  - drives `bt::runtime_host` tick loop
  - forwards canonical runtime event lines to WebSocket and JSONL through one serialisation path
  - integration test proving WS/JSONL payload equivalence in deterministic mode
- CI checks for schema/contract drift against the resolved `muesli-bt` source

Deferred to later milestones:

- BT DSL editing
- Webots-enabled CI coverage for backend attach path

## muesli-bt pinning

Inspector pin metadata lives in [`apps/inspector/cmake/MuesliBtVersion.cmake`](./apps/inspector/cmake/MuesliBtVersion.cmake).

- default CI and local fallback builds use that pinned URL/tag
- scheduled CI builds inspector against `muesli-bt` `main` (advisory)
- canonical contract reference: [muesli-bt studio integration contract](https://github.com/unswei/muesli-bt/blob/main/docs/contracts/muesli-studio-integration.md)

## quick start

```bash
pnpm install
pnpm inspector:configure
pnpm sync:schema
pnpm sync:contract
pnpm gen:types
pnpm check:fixtures
pnpm test
pnpm --filter @muesli/studio dev
```

### replay mode

Load `tools/fixtures/minimal_run.jsonl` in studio.

### live mode

```bash
cmake --preset default -S apps/inspector
cmake --build apps/inspector/build --config Release
apps/inspector/build/mbt_inspector --attach mock --ws :8765 --run-loop '{"max_ticks":200}' --tick-hz 20 --log /tmp/live.jsonl
pnpm inspector:test
```

Then connect studio to `ws://localhost:8765/events`.

## local install vs fetchcontent

Inspector resolution order:

1. `find_package(muesli_bt CONFIG QUIET)`
2. if not found, `FetchContent` using the pinned URL/tag

No manual include/library path overrides are needed.

## repository layout

```text
schema/              # canonical event schema copy used by studio tooling
contracts/           # canonical integration contract copy
apps/studio/         # replay-first React + Vite UI
apps/inspector/      # C++ runtime bridge (muesli-bt + ixwebsocket)
packages/protocol/   # generated types, zod validation, protocol helpers
packages/replay/     # parser/index/query for append-only event ingestion
packages/ui/         # shared UI bits
tools/gen_types/     # schema->types generation scripts
tools/fixtures/      # canonical fixture logs
tools/sync_schema.sh # sync schema from resolved muesli-bt source
tools/sync_contract.sh # sync contract from resolved muesli-bt source
```
