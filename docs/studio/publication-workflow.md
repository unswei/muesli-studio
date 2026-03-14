# publication workflow

## what this is

This page describes the screenshot and bundle export path in `muesli-studio`.

The workflow turns an inspected run into clean figures and a small replay bundle that another person can open directly.

## when to use it

Use this workflow when you need:

- screenshots for GitHub, talks, or papers
- a compact supplementary bundle for review or internal sharing
- deterministic exports from the canonical demo fixture

## how it works

1. Load a replay in Studio.
2. Open the `presentation` panel in the right rail.
3. Choose a clean layout:
   - `overview`
   - `summary`
   - `node`
   - `diff`
   - `dsl`
4. Studio switches into a low-chrome presentation surface.
5. Export:
   - `PNG` for slides and raster figures
   - `SVG` for vector-friendly surfaces
   - `bundle` for a zipped supplement with replay data and screenshots

Bundle export writes:

- `events.jsonl`
- `events.sidecar.tick-index.v1.json`
- `manifest.json`
- `run_summary.json`
- `README.md`
- `screenshots/`

If the replay is still in lazy indexed mode, Studio hydrates the remaining ticks before writing the bundle so `events.jsonl` is complete.

## api / syntax

Interactive export path:

- load a replay
- open `presentation`
- choose a layout
- use `export PNG`, `export SVG`, or `export bundle`

Deterministic demo capture query parameters:

- `demo_fixture=/demo/<fixture>/events.jsonl`
- `demo_sidecar=/demo/<fixture>/events.sidecar.tick-index.v1.json`
- `demo_tick=<n>`
- `demo_node=<id>`
- `demo_capture=hero|summary|node|diff|dsl`

## example

1. Start Studio with the canonical demo:

```bash
./start-studio.sh
```

2. In the browser, open the `presentation` panel.

3. Choose `overview` for the main figure, then export `PNG`.

4. Choose `summary` or `diff` for a supporting panel, then export again.

5. Use `export bundle` to write a zipped supplement for review.

## gotchas

- `SVG` export is best for panel-style surfaces. Very large graph captures may still be easier to use as `PNG`.
- bundle export may take longer on large indexed runs because Studio hydrates the full replay first.
- deterministic doc screenshots still use `demo_capture` query parameters; interactive presentation mode is the user-facing path.

## see also

- [studio replay mode](../../apps/studio/docs/replay.md)
- [fixture bundles and studio inspect](./fixture-bundles.md)
- [large log workflow](./large-logs.md)
- [sidecar tick index](./sidecar-index.md)
