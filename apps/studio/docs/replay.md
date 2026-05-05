# replay mode

## what this is

Replay mode ingests canonical `mbt.evt.v1` JSONL logs and renders a static BT layout with tick-based state repaint.

## when to use it

Use replay mode when you need deterministic post-run inspection, debugging, or report screenshots.

## how it works

- file load parses JSONL line-by-line via `@muesli/replay`
- replay bundle load reads `events.jsonl` from a `.zip` archive and uses `events.sidecar.tick-index.v1.json` when present
- optional sidecar tick index (`events.sidecar.tick-index.v1.json`) can be loaded with the JSONL file
- parsed events are appended to a `ReplayStore`
- tree layout is computed once from `bt_def.nodes/edges` (supports `from/to` and `parent/child` edge variants)
- tick scrubbing recolours nodes using indexed `node_status` events
- blackboard diff panel shows `bb_write`/`bb_delete` for selected tick
- run summary panel shows run identity, versions, timings, planner/scheduler counts, deterministic event digest, and a top-level attention strip for warnings and unusual event families before you scrub
- `bt_def.dsl` is editable in a dedicated panel:
  - `preview` compiles the draft DSL without mutating the replay and shows a structure-aware BT diff
  - the diff summarises added, removed, renamed, reordered, and changed nodes first, with row-level details on demand
  - diagnostics distinguish syntax errors, unsupported DSL forms, unstable sibling identities, and replay mismatch warnings
  - mismatch warnings are non-blocking and appear when a removed or structurally changed draft node has runtime history in the loaded run
  - `apply preview` applies the last successful preview to the rendered tree
  - `revert` restores the runtime definition from log events
  - `save` writes the draft via browser save picker, or downloads if picker API is unavailable
- fixture bundle support is validated by `studio inspect` using `@muesli/replay/node`, then the same `events.jsonl` can be opened in replay UI
- replay UI now shows load progress, indexed/unindexed status, and explicit fallback warning for large unindexed logs
- for large indexed logs, replay starts in lazy sidecar mode (bootstrap + first tick), then parses additional tick ranges on scrub demand
- large sidecar-backed URL loads now use HTTP byte ranges for the same lazy bootstrap and scrub hydration path
- the replay diagnostics panel shows large-log mode, seek timing, lazy coverage, explicit hydration controls, and a rough footprint estimate
- the right rail includes a dedicated planner and scheduler panel with shared per-tick activity strips and selected-tick execution summaries
- the timeline surface includes an event explorer with text search, family filters, and jump-to-tick actions across replay and live sessions
- the same event explorer includes one-click jump controls for first failure, timeout, cancellation, planner activity, VLA activity, and blackboard change
- keyboard-first inspection supports tick scrubbing, panel switching, and search/jump flows without leaving the main canvas
- the right rail also includes compare mode for aligned baseline-versus-selected tick review, with node divergence, blackboard deltas, and planner/scheduler deltas in one surface
- demo bootstrapping can auto-load replay files via URL query (`demo_fixture`, optional `demo_sidecar`)
- demo bootstrapping also supports deterministic capture-state queries (`demo_tick`, `demo_node`, `demo_capture`)
- URL-backed replays and demo runs keep `tick`, `node`, and `view` in the browser query so the current inspection state can be reopened or shared
- the right rail includes a presentation panel for clean overview, summary, node, diff, compare, and DSL capture layouts plus publication bundle export
- the canonical `studio_demo` bundle is a deterministic Webots-flavoured navigation/control trace with planner calls, scheduler events, node history, blackboard writes and deletes, and a warning event

## api / syntax

Input: `.jsonl` where each line matches `mbt.evt.v1`, or a `.zip` replay bundle containing `events.jsonl`.

Bundle validation input (CLI): directory containing at least `manifest.json` + `events.jsonl`.

Demo query parameters:

- `demo_fixture=/demo/<fixture>/events.jsonl`
- `demo_sidecar=/demo/<fixture>/events.sidecar.tick-index.v1.json`
- `demo_tick=<n>`
- `demo_node=<id>`
- `demo_capture=hero|summary|node|diff|compare|dsl`

Replay deep-link parameters:

- `replay_url=<url-to-events.jsonl>`
- optional `replay_sidecar=<url-to-events.sidecar.tick-index.v1.json>`
- `tick=<n>`
- optional `node=<id>`
- `view=overview|hero|summary|node|diff|compare|dsl`

Event explorer filters:

- text search matches event type, node id, planner name, blackboard key, status, and message fields
- family filters: `node`, `planner`, `scheduler`, `blackboard`, `warnings`, `async`, `run/tick`
- jump controls target the first loaded occurrence of `failure`, `deadline_exceeded`, cancellation lifecycle, planner activity, VLA activity, and blackboard change

Keyboard shortcuts:

- `/` focuses event search
- `Enter` jumps to the first visible match from the event search field
- `Esc` clears event search, then blurs on a second press
- `Left` / `Right` scrub one tick backward or forward
- `Shift+Left` / `Shift+Right` scrub ten ticks backward or forward
- `Home` / `End` jump to the first or last loaded tick
- `1` timeline panel, `2` event explorer, `3` tree, `4` run summary, `5` node inspector, `6` blackboard diff, `7` DSL editor, `8` live connection panel

## example

1. Validate a fixture bundle:

```bash
pnpm studio inspect tests/fixtures/determinism_replay --schema tests/fixtures/schema/mbt.evt.v1.schema.json
```

2. Open [`tests/fixtures/determinism_replay/events.jsonl`](../../../tests/fixtures/determinism_replay/events.jsonl) in studio and scrub ticks `1..2`.

3. Edit `bt_def.dsl`, click `preview`, inspect diagnostics and the structure-aware diff summary, expand any changed row that needs detail, then click `apply preview` and confirm the tree panel updates.

4. For large logs, also open [`tests/fixtures/large_replay/events.sidecar.tick-index.v1.json`](../../../tests/fixtures/large_replay/events.sidecar.tick-index.v1.json) before opening `events.jsonl`.

5. For sharable replay links, open:

```text
?replay_url=/runs/demo/events.jsonl&replay_sidecar=/runs/demo/events.sidecar.tick-index.v1.json&tick=3&node=4&view=diff
```

Then copy the browser URL after scrubbing or changing the focused node to keep the same inspection state.

6. Use the event explorer under the scrubber to search for terms such as `rrt_star`, `nav.replan_reason`, or `Mission complete`, then jump directly to the matching tick.

7. Use the `jump to` controls for quick movement to the first failure, timeout, cancellation, planner, VLA, or blackboard event without typing a search query.

8. Use the keyboard shortcuts to scrub ticks, focus the event explorer, and switch directly between major panels while inspecting a run.

9. Open compare mode in the right rail, keep the selected tick as the current frame of reference, and move the baseline tick slider to emphasise when planner output, scheduler activity, or blackboard keys diverged.

Quick demo launcher:

```bash
./start-studio.sh
```

Interactive presentation export:

- open the `presentation` panel in the right rail
- choose `overview`, `summary`, `node`, `diff`, `compare`, or `dsl`
- export `PNG`, `SVG`, or `bundle`

Live capture replay:

- save a live capture bundle from the live connection panel
- open the saved `.zip` through `open replay`
- inspect it with the same timeline, summary, diff, planner, compare, and presentation panels used for recorded runs

## gotchas

- invalid lines are skipped and surfaced as parse warnings
- replay UI consumes JSONL and Studio-created `.zip` replay bundles; directory bundle validation happens in Node tooling (`studio inspect`)
- lazy mode for local file input now uses `File.slice` ranges to avoid retaining full JSONL text in memory
- lazy URL mode depends on HTTP byte-range support from the host serving `events.jsonl`; unsupported hosts fall back to a normal fetch
- the capture-state query parameters are for deterministic demos and screenshot automation; the right-rail presentation panel is the normal user-facing export path
- in lazy indexed mode, event search covers the currently hydrated event ranges only
- the jump controls use the same loaded event ranges as search, so very large lazy indexed replays may need additional hydration before later matches become reachable
- global shortcuts are suppressed while focus is inside an input, textarea, select, or content-editable field so typing in forms stays predictable
- deep links are reopenable only for demo or URL-backed replays; local file selections are intentionally not encoded into the browser URL
- newer runtime event variants are retained in the stream even when UI panels do not yet render dedicated widgets
- DSL diagnostics are shown inline during preview and do not mutate the currently rendered tree
- syntax and unsupported-form diagnostics block preview until the draft is fixed
- unstable sibling identities are warnings; duplicate sibling signatures such as two `(act plan)` children under the same parent can make diff matching less precise
- replay mismatch warnings are non-blocking; applying is still allowed when the warning appears
- runtime history for mismatch warnings is counted from loaded `node_status`, `node_enter`, and `node_exit` events only
- structure-aware BT diffs are based on the loaded tree definition and the compiled draft; lazy event ranges that have not been hydrated cannot contribute to mismatch warnings yet

## see also

- [`schema/mbt.evt.v1.schema.json`](../../../schema/mbt.evt.v1.schema.json)
- [`packages/replay`](../../../packages/replay)
- [`docs/studio/contract-consumption.md`](../../../docs/studio/contract-consumption.md)
- [`docs/studio/bt-editing.md`](../../../docs/studio/bt-editing.md)
- [`docs/studio/publication-workflow.md`](../../../docs/studio/publication-workflow.md)
- [`docs/studio/large-logs.md`](../../../docs/studio/large-logs.md)
- [`live monitoring`](./live.md)
