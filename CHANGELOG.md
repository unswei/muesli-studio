# changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### changed

- synced the vendored `muesli-bt` schema, contract, and generated protocol types to the current pinned upstream contract.
- hardened the inspector fallback pin by switching `MUESLI_BT_GIT_TAG` from the movable `v0.2.0` tag to commit `affa99d13995a7659bfddfeef08249a8365f4bc5`.
- reframed the top-level README around tool-first positioning, a demo-first flow, and screenshot-led product presentation.

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
