# muesli-studio

A replay-first monorepo for `muesli-studio` (web UI) and supporting shared packages around the canonical event stream `mbt.evt.v1`.

## current scope (P0)

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

Deferred to later milestones:

- live WebSocket monitoring
- inspector runtime bridge (`mbt_inspector`)
- BT DSL editing

## quick start

```bash
pnpm install
pnpm gen:types
pnpm check:fixtures
pnpm test
pnpm --filter @muesli/studio dev
```

Then open the studio and load `tools/fixtures/minimal_run.jsonl`.

## repository layout

```text
schema/              # canonical event schema + schema docs
apps/studio/         # replay-first React + Vite UI
packages/protocol/   # generated types, zod validation, protocol helpers
packages/replay/     # parser/index/query for append-only event ingestion
packages/ui/         # shared UI bits
tools/gen_types/     # schema->types generation scripts
tools/fixtures/      # canonical fixture logs
```
