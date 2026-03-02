# changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- initial monorepo workspace scaffold with `pnpm-workspace.yaml`
- canonical `mbt.evt.v1` schema and schema documentation scaffold
- `@muesli/protocol` with generated TypeScript types and zod validation
- `@muesli/replay` replay engine with JSONL ingest/index/query API
- replay-first `@muesli/studio` UI (file load, tree view, scrubber, status colours, blackboard diffs)
- canonical fixture logs for replay tests and docs
- fixture schema-conformance script (`pnpm check:fixtures`) using `schema/mbt.evt.v1.schema.json`
- golden studio UI test for tick-to-status rendering in tree view
- GitHub Actions workflow for `P0` checks (`gen:types`, generated-diff check, fixture validation, `lint`, `test`, `build`)
- studio live monitoring path with WebSocket connect/disconnect, shared replay ingestion, and auto-follow toggle
- `apps/inspector` scaffold with CMake target `mbt_inspector` using ixwebsocket
- inspector demo bridge that emits canonical `mbt.evt.v1` events to both WebSocket clients and optional JSONL sink
- live-ingest parser helpers and tests for payload decoding, validation, and store auto-follow behaviour
- studio live reconnection controls with exponential backoff and connection history log
- inspector integration test validating WebSocket framing and JSONL sink equivalence
- CI inspector job now runs WS/JSONL equivalence integration test
- runtime-backed `mbt_inspector` integration with `muesli_bt::runtime` and host-driven event streaming
- pinned `muesli-bt` dependency metadata (`apps/inspector/cmake/MuesliBtVersion.cmake`) with `find_package` then `FetchContent` resolution
- generated `apps/inspector/build/muesli_bt_paths.cmake` for schema/contract tooling
- schema and contract sync scripts (`tools/sync_schema.sh`, `tools/sync_contract.sh`) with CI drift checks
- local `contracts/` copy of `muesli-studio` integration contract sourced from resolved `muesli-bt`
- scheduled advisory CI job that builds inspector against `muesli-bt` `main`
- studio live status now shows last event time while reusing the same replay ingestion path
- replay/protocol compatibility updates for canonical runtime payload variants (numeric node ids, `parent/child` edges, `value_digest`)
- fixture set refreshed from canonical `muesli-bt` fixture logs
- inspector now consumes exported `muesli_bt::integration_pybullet` when available and uses backend-specific default run-loop DSL for `--attach pybullet`
- inspector now consumes exported `muesli_bt::integration_webots` when available and falls back with explicit attach error when Webots SDK/integration target is absent
