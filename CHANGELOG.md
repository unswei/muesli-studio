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
- pinned `muesli-bt` revision updated to include exported integration-target packaging fixes for Webots
- Webots-enabled CI lane on macOS now installs Webots SDK and exercises `--attach webots` with WS/JSONL equivalence checks
- inspector WS/JSONL equivalence harness now supports runtime arguments (`--attach`, tick controls, timeout) for backend-specific CI coverage
- studio contract-consumption checklist published at `docs/studio/contract-consumption.md`
- replay package now includes contract/schema version gating (`version-gate`) and deterministic `run_summary` generation with stable digest
- replay bundle loader now supports fixture bundle directories (`manifest.json`, `events.jsonl`, optional config/seed/expected metrics)
- log validation integration added via `tools/validate_log.py` subprocess with deterministic AJV fallback
- imported P1 fixture bundles (`budget_warning`, `deadline_cancel`, `determinism_replay`) from `muesli-bt` main with checked-in `expected_summary.json` regression baselines
- minimal `studio inspect <bundle_dir>` CLI added for bundle validation and summary emission
- studio now shows `bt_def.dsl` in a dedicated editor panel for replay/live inspection
- deterministic large fixture bundle `tests/fixtures/large_replay` (30,002 events) and generator script `pnpm fixtures:large` for sidecar/index strategy testing
- replay fixture-summary regression suite now includes `large_replay`
- `studio inspect` now auto-selects `tests/fixtures/schema/mbt.evt.v1.schema.json` for fixture bundles when `--schema` is omitted
- inspector now closes WebSocket clients with normal close code `1000` on shutdown to avoid spurious client-side `1006` errors
- protocol/schema sync now includes `node_enter`, `node_exit`, `planner_call_start`, and `planner_call_end` so large fixture replay no longer drops those events as ingest warnings
