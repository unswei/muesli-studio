# behaviour tree editing

## what this is

Behaviour tree editing is the controlled `bt_def.dsl` workflow in Studio replay mode.

It lets you draft tree source changes, preview the compiled structure, inspect warnings, and then explicitly apply the preview to the rendered replay tree.

## when to use it

Use this workflow when you want to test a small tree-source edit against a loaded run without replacing the replay definition immediately.

Do not use it as a general behaviour tree integrated development environment. Studio does not provide visual drag-and-drop authoring, host capability calls, or live robot-control actions in this release.

## how it works

1. Edit the DSL draft in the tree source panel.
2. Click `preview`.
3. Studio compiles the draft without mutating the replay.
4. Studio shows diagnostics and a structure-aware diff.
5. Expand diff rows when you need detail.
6. Click `apply preview` to apply exactly that compiled preview.
7. Use `revert` to restore the runtime definition from the loaded replay.
8. Use `save` to export the current draft text.

Preview diagnostics use product-level categories:

- `syntax` for incomplete or malformed source
- `unsupported form` for DSL heads outside the Studio preview subset
- `unstable identity` for duplicate sibling signatures that can make diff matching less precise
- `run mismatch` for non-blocking warnings when removed or structurally changed nodes already have loaded runtime history
- `capability` for the future validation path when a draft requires host capability metadata that is not present

Capability diagnostics are a validation hook only. Studio does not show a capability-control UI, call host capabilities, or require capability-aware fixtures in this release.

Leaf forms can declare capability requirements as extra arguments with `cap.*` names. Studio treats these as validation context for preview only:

```lisp
(bt
  (seq
    (act drive-to-goal cap.motion.v1)
    (cond scene-ready :cap cap.perception.scene.v1)))
```

If the loaded run metadata does not expose the required capability, preview shows a non-blocking `capability` diagnostic. If the metadata exposes the capability, the diagnostic is cleared.

The deterministic `tools/fixtures/capability_run.jsonl` fixture covers this validation path.

When a preview exists, evidence bundle export includes:

- `edit/tree-edit.json` with the draft source, compiled tree summary, structural diff, diagnostics, and whether the preview was applied
- `edit/bt_def.dsl` with the draft tree source

Studio does not export plain unpreviewed text changes as repair evidence.

## api / syntax

Studio preview supports:

- wrappers: `bt`, `defbt`
- composites: `seq`, `sel`
- leaves: `act`, `cond`, `dec`

The structural diff classifies:

- added nodes
- removed nodes
- renamed nodes
- reordered child lists
- changed node kind or structure

Replay mismatch warnings use loaded `node_status`, `node_enter`, and `node_exit` events. Lazy event ranges that have not been hydrated cannot contribute to those warnings yet.

## example

Source before editing:

```lisp
(bt
  (seq
    (cond localisation-ready)
    (seq
      (act plan-global-path)
      (act dispatch-controller-job))
    (cond goal-reached)))
```

Draft source:

```lisp
(bt
  (seq
    (cond localisation-ready)
    (cond goal-reached)
    (seq
      (act plan-global-path)
      (act dispatch-controller-job))))
```

Expected preview result:

- a summary first, such as `preview: 6 node(s), 5 edge(s); 1 change(s)`
- a `reordered` row for the root child order
- no replay mismatch warning for a pure reorder
- `apply preview` enabled only while the draft still matches the compiled preview

## gotchas

- Editing text alone never mutates the rendered replay tree.
- `save` writes the current draft, even if the draft has not previewed successfully.
- Syntax and unsupported-form diagnostics block preview.
- Unstable identity and run mismatch diagnostics do not block apply.
- Applying a preview changes Studio's rendered tree override, not the original replay event log.
- Capability metadata is deferred to validation context. It must not become a general host-control surface.
- Evidence bundles include edit artefacts only for current or applied previews.

## see also

- [`replay mode`](../../apps/studio/docs/replay.md)
- [`roadmap to 1.0`](../roadmap-to-1.0.md)
