# muesli-studio roadmap

## purpose

This document sets a roadmap for `muesli-studio` from the shipped `v0.2.0` baseline onward.

The goal is not to turn `muesli-studio` into a generic robotics IDE. The goal is to make it the best possible inspector and controlled authoring surface for `muesli-bt` runs.

## where we are now

As of the `v0.2.0` line, `muesli-studio` already has a serious base:

- replay-first inspection with tree rendering and a tick scrubber
- blackboard diffs and node inspection
- live monitoring over WebSocket
- one canonical replay model across file and live transport
- deterministic fixtures, sidecar-backed large-log support, and regression coverage
- a first DSL editing loop with `apply`, `revert`, and `save`
- presentation mode and export paths for figures and publication bundles

## strategic thesis

`muesli-studio` should become:

- the default way to inspect `muesli-bt` runs
- the fastest way to understand what happened in a run
- the cleanest bridge between live behaviour and replayed analysis
- a careful editing surface for behaviour trees, not an unbounded general-purpose IDE

## roadmap principles

### 1. inspection comes before broad authoring

The app wins first by being the best place to inspect, debug, and explain runs. Editing matters, but editing without excellent inspection will produce a confused product.

### 2. live and replay must converge

A live session and a recorded run should feel like the same product, not two adjacent products.

### 3. editing must remain disciplined

We will improve BT editing, but we will not rush into a sprawling visual programming environment. Editing should stay grounded in the `muesli-bt` contract, deterministic fixtures, and replay-backed validation.

### 4. publication and communication are not side concerns

`muesli-studio` is part of a research stack. Good exports, figures, summaries, and reproducible bundles are first-class features.

### 5. every release should sharpen identity

Each release should make the app more obviously itself. The app is not a generic observability dashboard. It is the inspector for `muesli-bt`.

## non-goals

This roadmap deliberately does not aim for the following in the `v0.x` line:

- a broad drag-and-drop robotics IDE
- general-purpose graph editing for arbitrary non-BT workflows
- many backend-specific UI branches that fragment the experience
- enterprise workflow complexity such as multi-user roles, cloud tenancy, or team administration
- replacing the `muesli-bt` runtime or host tooling

## release cadence philosophy

The `v0.x` series should move in clear `0.1` steps. Each step should have one dominant theme and a small number of sharp acceptance criteria.

The right question for each release is not “what can we add?” but “what single step makes the app meaningfully more useful without diluting it?”

---

## v0.2 - polished inspection release (shipped)

Status: shipped on 2026-03-21.

### theme

Make the current app feel finished enough that people trust it immediately.

### why this comes first

The app already does enough to justify a stronger public face. Before adding major new behaviour, we should remove rough edges, tighten product feel, and make the current feature set obviously dependable.

### primary outcomes

- stronger overall visual consistency across the app shell, panels, timeline, and empty states
- polished first-run experience for repo checkout, packaged bundle launch, and demo fixture loading
- clearer release and compatibility story for users following the `muesli-bt` pin
- cleaner README, landing page, screenshots, and documentation alignment
- release hygiene improvements including artefact trust and simpler launch paths

### feature focus

- finish the first serious design pass across the core inspection surfaces
- tighten panel naming, visual hierarchy, loading states, and diagnostics copy
- make the canonical demo path and screenshots excellent
- improve release packaging and trust signals
- keep the product claim consistent across GitHub, docs, and website

### editing scope in this release

Minimal. Editing remains present, but this release is not about broadening editing. It is about making the existing app feel coherent.

### acceptance criteria

- a new user can run the demo and understand the main inspection flow without reading internal docs first
- screenshots and exported figures are good enough for papers, talks, and homepage use
- release bundles are straightforward to launch and verify
- the app feels like a deliberate tool, not an internal UI shell

---

## v0.3 - debugging and navigation release

### theme

Make the app fast to debug with, not just pleasant to look at.

### why this matters

A serious inspector is judged by how quickly it gets a user to the interesting moment in a run. Replay without strong navigation is still too passive.

### primary outcomes

- powerful run navigation and filtering
- faster movement from high-level summary to exact event or tick
- better support for long and noisy runs
- a stronger answer to “where did this go wrong?”

### feature focus

- searchable timeline and event filtering
- jump-to controls for first failure, timeout, cancellation, planner activity, VLA activity, or blackboard change
- URL-stable deep links to a run, tick, node, or view state
- compact run summary cards that surface warnings and unusual event families immediately
- better handling of large logs and lazy hydration in the UI

### editing scope in this release

Small but useful improvements are allowed here if they directly support debugging. Good examples:

- clearer editor diagnostics
- better error surfaces when an edit invalidates a tree
- previewing the edited tree before apply

Broad authoring work stays out.

### acceptance criteria

- a user can locate the first interesting event in a complex run quickly
- deep links can reopen the same inspection state reliably
- long runs remain workable without the UI feeling sluggish or opaque
- the app is now clearly a debugging tool, not just a replay viewer

---

## v0.4 - unified live and replay release

### theme

Make live monitoring and replay feel like one workflow.

### why this is important

This is one of the strongest ideas already latent in the stack. `muesli-bt` exposes canonical serialisation and the studio already consumes the same event model for replay and live monitoring. The product should make that architectural strength visible.

### primary outcomes

- seamless movement between live following and replay-style inspection
- the same mental model for both transports
- captured live sessions that can be reopened later as ordinary runs

### feature focus

- freeze or pin a live session at a selected moment for deeper inspection
- save captured live streams as replayable bundles
- reopen captured sessions with the same panels and navigation model used for files
- clearer connection status, buffering, dropped-event warnings, and reconnect history
- better “follow live” versus “inspect at this moment” controls

### editing scope in this release

Still narrow. Editing may interact with live sessions only in safe, explicit ways. No implicit hot-editing of running systems.

### acceptance criteria

- a live session and a replayed run feel like the same product viewed in two modes
- captured live data can be saved, reopened, and shared cleanly
- connection and buffering behaviour are visible and understandable
- the app now has a distinctive identity beyond static replay inspection

---

## v0.5 - disciplined BT editing release

### theme

Turn editing from an early convenience into a serious, bounded authoring loop.

### why this release exists

By this point inspection and navigation should be strong enough that editing can build on them rather than compete with them. This is the release where BT editing becomes a first-class part of the roadmap.

### primary outcomes

- a much stronger DSL editing experience
- safer and clearer edit-apply-validate workflows
- replay-backed confidence when changing a tree
- visible structure-aware diffs for BT changes

### feature focus

- improved DSL editor UX, including better diagnostics and validation output
- structured tree diff before and after a change
- explicit staging model such as draft, preview, apply to replay, export patch, save
- fixture-backed validation for edited trees where feasible
- better handling of mismatches between current run data and an edited definition

### what we will do

- invest in textual or structure-aware BT authoring grounded in the current DSL and tree model
- use replay as a validation and explanation surface for edits
- make the editor feel deliberate and trustworthy

### what we will not do yet

- broad drag-and-drop visual BT programming as the main editing model
- multi-project workspace complexity
- general scripting IDE features that are not tied to BT work

### acceptance criteria

- editing a BT feels like a serious workflow, not an experimental side panel
- users can understand what changed structurally before committing to it
- editor errors and validation failures are clear and actionable
- edited trees can be tested or previewed against known runs in a disciplined way

---

## v0.6 - comparison and regression release

### theme

Make it easy to compare runs, compare trees, and reason about regressions.

### why this matters

Once the tool supports replay, live capture, and stronger editing, the next step is comparison. Research users and maintainers need to answer: did this change improve behaviour, alter timing, reduce warnings, or introduce a new failure mode?

### primary outcomes

- first-class run-to-run comparison
- useful support for regression analysis
- stronger publication and review workflows

### feature focus

- compare two runs side by side at summary level and selected tick ranges
- compare tree structure across versions or edited definitions
- diff warnings, event-family counts, timing distributions, and selected blackboard keys
- better publication bundle support for before-and-after analyses
- regression-oriented fixture views and saved comparison reports

### editing scope in this release

Editing benefits indirectly. The key win is that edited trees can now be compared properly against previous runs or previous definitions.

### acceptance criteria

- the app can support a credible “before and after” workflow for tree changes or runtime changes
- regressions are visible in a form useful for development and papers
- comparison does not require awkward external tooling for ordinary cases

---

## v0.7 - simulator and integration workflows release

### theme

Make the app feel native to the broader `muesli-bt` integration story.

### why this release matters

`muesli-bt` already defines an integration contract that includes simulator and transport visibility, optional backend targets, and canonical event requirements. `muesli-studio` should start to expose that world more clearly, without becoming backend-fragmented.

### primary outcomes

- clearer backend-aware inspection where useful
- stronger simulator-backed demo and analysis paths
- better grounding in real end-to-end workflows

### feature focus

- polished canonical demo packs for at least BT-only, planner-heavy, and simulator-backed runs
- backend-aware labels or views where they help interpretation, without breaking overall UI consistency
- stronger inspection around planner, scheduler, VLA, and cancellation event families
- better support for environment metadata and run provenance

### editing scope in this release

Limited. Editing should consume integration metadata only where it improves validation or explanation.

### acceptance criteria

- canonical demos make the stack understandable without long explanation
- simulator-backed and backend-rich runs feel first-class in the app
- the app is visibly grounded in real `muesli-bt` workflows, not synthetic examples only

---

## v0.8 - presentation and publication release

### theme

Make `muesli-studio` excellent for papers, talks, reviews, and reproducible evidence.

### why this matters

This is a research tool. It should help produce not just insight, but communication. Publication support already exists in early form. This release turns that into a polished strength.

### primary outcomes

- excellent exports
- reproducible presentation bundles
- cleaner paths from interesting run to figure or appendix artefact

### feature focus

- stronger figure export control and layout presets
- export themes that remain clean and publication-ready
- improved publication bundle contents and reproduction notes
- saved views for talks, papers, and review appendices
- easier generation of overview plus supporting-detail figure sets from one run

### editing scope in this release

Secondary. The main focus is on representing results clearly, including edited-tree comparisons where relevant.

### acceptance criteria

- exported figures are consistently good enough for paper drafts and slides
- publication bundles support a credible reproducibility story
- presentation mode feels intentional, not bolted on

---

## v0.9 - release candidate for stable tool identity

### theme

Stabilise the product surface and remove the last major rough edges before `v1.0`.

### why this release exists

By `v0.9`, the main question should not be what the product is, but whether it is stable and coherent enough to call mature.

### primary outcomes

- stable product identity
- compatibility and migration confidence
- hardening across the main workflows

### feature focus

- remove or redesign features that still feel accidental
- tighten compatibility expectations against tagged `muesli-bt` releases
- improve migration and fixture drift handling
- complete missing rough-edge work across replay, live, editing, comparison, and export
- ensure docs, packaging, screenshots, demos, and app behaviour all tell the same story

### editing scope in this release

Hardening, not broadening. By now the editing loop should be good enough. The work here is to make it reliable.

### acceptance criteria

- the core workflows feel coherent from first run to export
- compatibility and release expectations are clear
- there are no major workflow gaps in inspection, live use, editing, comparison, or presentation

---

## v1.0 - the inspector and disciplined authoring tool for muesli-bt

### theme

Declare the product complete enough in identity, workflow, and trust to be treated as the stable companion to `muesli-bt`.

### what `v1.0` should mean

`v1.0` should not mean “everything imaginable is present”. It should mean:

- replay inspection is strong and trustworthy
- live monitoring is genuinely integrated with replay
- BT editing is useful, bounded, and reliable
- comparison and publication workflows are good enough to support serious use
- the app has a clear and stable identity within the `muesli-bt` ecosystem

### v1.0 statement

At `v1.0`, `muesli-studio` should be the default way to inspect, understand, compare, and carefully edit `muesli-bt` behaviour tree runs.

---

## cross-cutting work that should happen throughout

These themes do not belong to one release only. They should continue throughout the roadmap.

### compatibility discipline

The contract between `muesli-bt` and `muesli-studio` should remain explicit and release-aware. Contract, schema, fixtures, generated types, changelog entries, and compatibility notes must move together.

### deterministic fixtures

Every major workflow should remain testable and demonstrable through deterministic fixtures and canonical demo bundles.

### performance and large-log behaviour

Large logs should remain a first-class case, not an afterthought. The app should continue to work well when replay data becomes realistically heavy.

### product clarity

The README, landing page, release notes, screenshots, docs, and app should all describe the same product in the same voice.

## roadmap summary

If compressed into a single sentence per release, the roadmap is:

- `v0.2`: polish the inspector
- `v0.3`: accelerate debugging and navigation
- `v0.4`: unify live and replay
- `v0.5`: make BT editing serious and disciplined
- `v0.6`: add comparison and regression workflows
- `v0.7`: deepen simulator and integration workflows
- `v0.8`: make publication and presentation excellent
- `v0.9`: harden the whole product surface
- `v1.0`: declare a stable identity as the inspector and disciplined authoring tool for `muesli-bt`

## final note

The opinionated part of this roadmap is simple:

`muesli-studio` should resist the temptation to become everything.

Its strength is that it sits close to the runtime, understands the event model, and can connect inspection, replay, live behaviour, controlled editing, and publication in one coherent tool.

If we keep that discipline, the app will become much more than a viewer without turning into a bloated IDE.
