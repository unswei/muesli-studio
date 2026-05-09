# evidence bundle workflow

## what this is

This page describes the screenshot and bundle export path in `muesli-studio`.

The workflow turns an inspected run into clean figures and a replayable evidence bundle that another person can open directly.

## when to use it

Use this workflow when you need:

- screenshots for GitHub, talks, reviews, or papers
- a compact evidence bundle for review or internal sharing
- deterministic exports from the canonical demo fixture
- a replayable archive captured directly from a live session

## how it works

1. Load a replay in Studio.
2. Open the `presentation` panel in the right rail.
3. Choose a clean layout:
   - `overview`
   - `summary`
   - `node`
   - `diff`
   - `compare`
   - `dsl`
4. Studio switches into a low-chrome presentation surface.
5. Export:
   - `PNG` for slides and raster figures
   - `SVG` for vector-friendly surfaces
   - `bundle` for a zipped evidence bundle with replay data and screenshots
   - `save capture bundle` in the live connection panel for a replayable archive without screenshots

Evidence bundle export writes:

- `events.jsonl`
- `events.sidecar.tick-index.v1.json`
- `manifest.json`
- `run_summary.json`
- `README.md`
- `screenshots/`
- `edit/tree-edit.json` when a tree edit preview is active or applied
- `edit/bt_def.dsl` when a tree edit preview is active or applied

If the replay is still in lazy indexed mode, Studio hydrates the remaining ticks before writing the bundle so `events.jsonl` is complete.

Live capture export from the connection panel writes:

- `events.jsonl`
- `events.sidecar.tick-index.v1.json`
- `manifest.json`
- `run_summary.json`
- `README.md`

## api / syntax

Interactive export path:

- load a replay
- open `presentation`
- choose a layout
- use `export PNG`, `export SVG`, or `export bundle`

Live capture export path:

- connect a live session
- optionally pin the current moment
- use `save capture bundle` in the connection panel
- reopen the saved `.zip` through `open replay`

Deterministic demo capture query parameters:

- `demo_fixture=/demo/<fixture>/events.jsonl`
- `demo_sidecar=/demo/<fixture>/events.sidecar.tick-index.v1.json`
- `demo_tick=<n>`
- `demo_node=<id>`
- `demo_capture=hero|summary|node|diff|compare|dsl`

Canonical capture recipe:

```bash
pnpm docs:screenshots
```

This stages `tests/fixtures/studio_demo`, serves Studio locally, and captures the committed README images from the same indexed demo state used by `./start-studio.sh`.

## example

1. Start Studio with the canonical demo:

```bash
./start-studio.sh
```

2. In the browser, open the `presentation` panel.

3. Choose `overview` for the main figure, then export `PNG`.

4. Choose `summary`, `diff`, or `compare` for a supporting panel, then export again.

5. Use `export bundle` to write a zipped evidence bundle for review.

6. In live mode, use `save capture bundle` to write the currently captured run as a replayable archive.

7. Reopen that archive through `open replay` when you want normal timeline, summary, diff, planner, and presentation panels.

To recreate the committed README figures exactly:

```bash
pnpm docs:screenshots
```

## gotchas

- `SVG` export is best for panel-style surfaces. Very large graph captures may still be easier to use as `PNG`.
- bundle export may take longer on large indexed runs because Studio hydrates the full replay first.
- evidence bundle export currently carries overview, summary, diff, and compare screenshots by default so review artefacts keep the high-signal surfaces together.
- edit artefacts are included only when the tree editor has a current preview or an applied preview. Plain unsaved text changes are not exported as trusted repair evidence.
- `manifest.json` lists edit artefact paths, redaction notes, and the evidence schema version so downstream tooling can detect optional export contents.
- live capture bundle export does not include screenshots; it is intended to preserve the captured run for replay.
- live capture bundles reopen from the normal replay loader when the archive contains `events.jsonl`; the sidecar file is optional but keeps scrubbing fast.
- deterministic doc screenshots use the canonical `studio_demo` sidecar and `demo_capture` query parameters; interactive presentation mode remains the user-facing path.

## see also

- [studio replay mode](../../apps/studio/docs/replay.md)
- [fixture bundles and studio inspect](./fixture-bundles.md)
- [large log workflow](./large-logs.md)
- [sidecar tick index](./sidecar-index.md)
