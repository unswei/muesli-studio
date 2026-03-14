# changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### changed

- prepared the `v0.1.1` patch release metadata and docs for the `muesli-bt v0.3.1` compatibility pin update.
- synced the vendored `muesli-bt` schema, contract, and generated protocol types to the current pinned upstream contract.
- replaced the minimal `studio_demo` fixture with a richer deterministic Webots-flavoured navigation run and synced the local protocol validator plus bundle summaries for current warning and async-cancel event variants.
- advanced the inspector fallback pin from the `v0.2.0` release line to commit `050c5e8793052d2a1a5d307897960d8b78e2afbc` (tagged `v0.3.1`) after verifying the inspector still configures, builds, and runs without source changes.
- reframed the top-level README around tool-first positioning, a demo-first flow, and screenshot-led product presentation.
- extended large sidecar-backed replay loading so URL auto-loads can bootstrap and scrub lazily via HTTP byte ranges instead of eagerly fetching the whole log.
- added a single `./start-studio.sh` launcher for repo demo starts and packaged release-bundle launches.
- applied the first v0.2 design pass across the studio shell, tree timeline, side panels, empty states, and refreshed README screenshots.
- promoted run summary into a first-class Studio panel and expanded deterministic screenshot refresh to capture overview plus individual summary, node, diff, and DSL panels from the canonical demo bundle.
- replaced the generic lead README screenshot with a dedicated hero capture built from the same canonical demo fixture and deterministic capture-state pipeline.

## [0.1.0] - 2026-03-04

### added

- first public `muesli-studio` release.
- monorepo workspace for studio UI, replay/protocol packages, inspector bridge, fixtures, and tooling.
- canonical schema/contract sync from resolved `muesli-bt`, plus generated TypeScript protocol and zod validation helpers.
- replay engine with JSONL ingest, query API, bundle loading, version gating, deterministic summaries, and sidecar tick-index support.
- replay-first studio UI with tree rendering, tick scrubber, node status colours, blackboard diff, and DSL editor (`apply`, `revert`, `save`).
- studio live monitoring over WebSocket with auto-follow, auto-reconnect, connection history, and last-event status.
- runtime-backed `mbt_inspector` bridge with canonical WS/JSONL parity through one serialisation path.
- fixture bundle workflow and `studio inspect` CLI, including imported golden fixtures and deterministic `large_replay` stress fixture.
- regression test coverage for replay/store/editor/live paths, rendering snapshots, and live monitor state snapshots.
- one-command demo path (`pnpm demo`) and README screenshots generated from deterministic fixtures.
- release workflow for tag pushes (`v*`) that publishes source plus prebuilt `linux-intel` and `macos-arm` bundles with `.sha256` checksums.

### changed

- large sidecar-backed browser file loads now use file-slice lazy hydration to reduce memory pressure.
- demo/replay docs and release target docs now describe sidecar lazy loading and released binary artefacts.

### fixed

- inspector shutdown now closes WebSocket clients with normal code `1000` to avoid spurious client-side `1006` errors.
- protocol/schema sync includes additional runtime variants (`node_enter`, `node_exit`, `planner_call_start`, `planner_call_end`) to avoid fixture ingest warnings.
