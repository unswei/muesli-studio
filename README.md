# muesli-studio

A monorepo for `muesli-studio` (web UI) and `mbt_inspector` runtime bridge around the canonical event stream `mbt.evt.v1`.

## current scope (P1)

Implemented in this milestone:

- monorepo layout (`apps`, `packages`, `schema`, `tools`)
- canonical JSON schema for `mbt.evt.v1`
- generated TypeScript event types + zod validation helpers
- replay engine package with JSONL ingest + indices + query API
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
- inspector scaffold (`apps/inspector`):
  - CMake target `mbt_inspector`
  - demo canonical event emitter
  - WebSocket broadcast + JSONL sink of identical payloads

Deferred to later milestones:

- BT DSL editing
- direct runtime integration with muesli-bt internals (current inspector emits deterministic demo events)

## quick start

```bash
pnpm install
pnpm gen:types
pnpm check:fixtures
pnpm test
pnpm --filter @muesli/studio dev
```

### replay mode

Load `tools/fixtures/minimal_run.jsonl` in studio.

### live mode

```bash
cmake --preset default -S /Users/z3550628/Code/2026/muesli-studio/apps/inspector
cmake --build --preset default -S /Users/z3550628/Code/2026/muesli-studio/apps/inspector
/Users/z3550628/Code/2026/muesli-studio/apps/inspector/build/mbt_inspector --ws :8765 --log /tmp/live.jsonl --demo-ticks 200
```

Then connect from studio to `ws://localhost:8765/events`.

## repository layout

```text
schema/              # canonical event schema + schema docs
apps/studio/         # replay-first React + Vite UI
apps/inspector/      # C++ WebSocket + JSONL bridge scaffold
packages/protocol/   # generated types, zod validation, protocol helpers
packages/replay/     # parser/index/query for append-only event ingestion
packages/ui/         # shared UI bits
tools/gen_types/     # schema->types generation scripts
tools/fixtures/      # canonical fixture logs
```
