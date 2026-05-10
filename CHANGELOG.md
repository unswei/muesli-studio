# changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### added

- added the `docs/studio/v1.0-product-plan.md` source-of-truth plan for the Studio path to `v1.0`.
- added `docs/studio/evidence-bundles.md` to document the product-facing replay export workflow.
- added evidence-bundle edit artefacts for current or applied DSL previews, including draft source, structural diff, diagnostics, compiled tree summary, applied-preview state, capability validation context, and diagnostic counts.
- added capability-aware DSL preview diagnostics from `cap.*` leaf arguments and normalised loaded run capability metadata.
- added right-rail panel minimise and restore controls, with secondary replay tools starting minimised to keep the inspector balanced.
- added a staged DSL editing preview so tree source changes compile into a structural summary before they can be applied to the replay.
- added a compact structure-aware BT diff for DSL previews, with summary counts and expandable rows for added, removed, renamed, reordered, and changed nodes.
- added product-level DSL diagnostics and non-blocking replay mismatch warnings when draft previews remove or structurally change nodes with loaded runtime history.
- added the final disciplined BT editing acceptance path for v0.5.0, including an inert capability-validation hook for future missing-capability diagnostics.

### changed

- reframed the roadmap, README links, TODO, export docs, bundle names, bundle README text, and presentation UI around evidence bundles instead of publication-specific wording.
- extended evidence manifests with schema, redaction, and optional edit artefact path fields.
- advanced the inspector fallback pin to `muesli-bt v0.8.0` at commit `ff4dc9d7e160b2037ad66cac23e9536c48faaa5e` and synced the Studio schema, contract, generated protocol type, and parser coverage for the expanded `mbt.evt.v1` release surface.
- refreshed the roadmap and current compatibility documentation around the `muesli-bt v0.8.0` capability, model-service, and outcome-event baseline.
- surfaced `muesli-bt v0.8.0` model/capability lifecycle and outcome events in Event Explorer grouping, jump targets, and run summaries.
- documented the v0.5.0 editing workflow as a controlled replay validation loop rather than a general BT IDE.

## [0.4.0] - 2026-04-25

### added

- added pinned live inspection so Studio can freeze the current live moment, buffer incoming events, and then resume the stream into the same replay state when you are ready.
- added live capture bundle export so a current live session can be saved as a replayable archive with `events.jsonl`, sidecar index, manifest, and run summary.
- added replay-bundle loading from the main replay opener so captured live sessions reopen with the normal timeline, panels, and navigation model.

### changed

- clarified the live connection panel with explicit follow, inspect, buffer, dropped-payload, and reconnect status summaries.

## [0.3.0] - 2026-04-03

### added

- added URL-stable replay deep links for URL-backed runs and canonical demo sessions, preserving the selected tick, node, and presentation view in the browser query.
- added a timeline event explorer with text search, event-family filters, and jump-to-tick actions across replay and live sessions.
- added one-click jump controls for the first failure, timeout, cancellation, planner activity, VLA activity, and blackboard change in the timeline event explorer.
- added keyboard-first replay inspection shortcuts for tick navigation, panel switching, and event-search jump flows.
- tightened run-summary surfacing so warning signals and unusual event families are obvious before scrubbing.
- improved large-run lazy hydration with grouped range loads, scrub lookahead, and diagnostics-panel preload controls.
- refined planner and scheduler surfacing into a dedicated panel with one shared tick-activity chart language and compact selected-tick summaries.
- added aligned compare mode with baseline tick selection, divergence surfacing, and compare captures in presentation export.
- added detached release-artefact signatures plus signature-aware bundle verification for published archives.

### changed

- replay mode now clears stale sharable query state after local file loads so copied URLs only represent reopenable sessions.
- publication bundle export now includes the compare capture alongside overview, summary, and diff screenshots.
- removed contributor-facing wording from the Studio UI so loading, diagnostics, and editing copy now read as product-facing guidance rather than implementation detail.

## [0.2.0] - 2026-03-21

### added

- added a single `./start-studio.sh` launcher for repo demo starts and packaged release-bundle launches.
- added a first-class presentation mode in Studio with clean overview, summary, node, diff, and DSL layouts, PNG and SVG export, and publication bundle export that writes replay data, sidecar index, run summary, screenshots, and reproduction notes.
- added an in-app replay diagnostics panel for large-log mode, seek latency, pending range hydration, and rough replay footprint estimates.

### changed

- synced the vendored `muesli-bt` schema, contract, and generated protocol types to the current pinned upstream contract.
- replaced the minimal `studio_demo` fixture with a richer deterministic Webots-flavoured navigation run and synced the local protocol validator plus bundle summaries for current warning and async-cancel event variants.
- advanced the inspector fallback pin from the `v0.2.0` release line to commit `050c5e8793052d2a1a5d307897960d8b78e2afbc` (tagged `v0.3.1`) after verifying the inspector still configures, builds, and runs without source changes.
- reframed the top-level README around tool-first positioning, a demo-first flow, and screenshot-led product presentation.
- extended large sidecar-backed replay loading so URL auto-loads can bootstrap and scrub lazily via HTTP byte ranges instead of eagerly fetching the whole log.
- applied the first v0.2 design pass across the studio shell, tree timeline, side panels, empty states, and refreshed README screenshots.
- promoted run summary into a first-class Studio panel and expanded deterministic screenshot refresh to capture overview plus individual summary, node, diff, and DSL panels from the canonical demo bundle.
- replaced the generic lead README screenshot with a dedicated hero capture built from the same canonical demo fixture and deterministic capture-state pipeline.
- advanced the inspector fallback pin from the `v0.3.1` release line to commit `6100092ad2cb1ad54145a945518bd55e65abdff8` (tagged `v0.4.0`) and synced the vendored Studio contract/schema copies for the additive lifecycle events carried in the same `mbt.evt.v1` line.
- refined the canonical Studio demo path so repo launches now preload the indexed `studio_demo` bundle at the curated replanning tick and selected planner node.
- tightened first-run replay copy in the Studio shell so demo, file, and bundle loading states explain what is happening and why.
- expanded release trust material in the README, release-target docs, and packaged `RELEASE.md` so compatibility and checksum verification stay visible after download.
- refreshed the canonical README screenshots, tightened the capture recipe so the node, blackboard, and DSL exports frame the intended panel content more cleanly, and linked the broader roadmap from the README.
- added a repeatable release-bundle verifier and wired it into the release workflow so packaged archives now check checksum, bundle metadata, and host-matched launcher smoke before upload.

## [0.1.1] - 2026-03-14

### changed

- refreshed the release metadata and docs for the `muesli-bt v0.3.1` compatibility pin update.
- advanced the inspector fallback pin from the `v0.2.0` release line to commit `050c5e8793052d2a1a5d307897960d8b78e2afbc` (tagged `v0.3.1`) after verifying the inspector still configures, builds, and runs without source changes.

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
