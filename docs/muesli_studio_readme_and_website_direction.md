# muesli-studio README and website direction

## purpose of this document

This document gives clear, practical direction for two groups:

- the **muesli-studio maintainer**, who owns the top-level `README.md` and repository presentation
- the **web team**, who will create or refine a website or landing page for `muesli-studio`

It is intended to be self-contained. The goal is to make `muesli-studio` present as a real tool people can pick up and use, while keeping the technical credibility expected from a research-driven robotics project.

This is **not** a request to make `muesli-studio` look like a generic SaaS product. It should still feel technical, opinionated, and close to the work. But it should no longer lead with internal repo structure, milestone language, or implementation detail.

## core positioning

`muesli-studio` should be presented as:

> the inspector for muesli-bt

More concretely:

> `muesli-studio` lets users replay runs, inspect behaviour tree execution tick by tick, examine state changes, and monitor live systems.

That should be obvious within a few seconds of opening either the GitHub repository or the website.

## what impression we want

The first impression should be:

- this is a real tool
- it is sharp and usable
- it is technically serious
- it is connected to a deeper research runtime
- it already does something concrete now

The first impression should **not** be:

- this is a monorepo
- this is mainly a research prototype with some UI attached
- this is a future plan
- this is a protocol or schema exercise

## desired tone

The tone should be:

- direct
- bold
- sparse
- technical
- confident

The tone should not be:

- over-explained
- startup-hyped
- defensive
- full of caveats in the opening section
- buried under architecture language

## product character

`muesli-studio` is still a research tool, but it is the most obviously user-facing part of the stack.

Think of it as the console, inspector, or instrument panel for `muesli-bt`.

That means the presentation should be built around actions and experience:

- open a run
- scrub ticks
- inspect the tree
- examine state changes
- follow live events

Those verbs matter. Use them consistently.

---

# section 1: direction for the maintainer

## primary README goal

The top-level `README.md` should answer, very quickly:

1. what is `muesli-studio`?
2. what can I do with it now?
3. how do I try it in one step?
4. where do I go next?

## current problem to correct

The README should not open with internal framing such as:

- monorepo structure
- package layout
- milestone notes
- protocol or schema mechanics
- future plans

These details are useful, but they belong further down.

## README structure to implement

Use the following structure.

### 1. title and hero statement

Open with the project name and a short, clear claim.

Suggested pattern:

```md
# muesli-studio

**Replay and monitor behaviour trees.**

`muesli-studio` is the inspector for `muesli-bt`. Open a run, scrub ticks, inspect node state, diff the blackboard, or follow events live.
```

This opening should feel like a tool, not a repo inventory.

### 2. primary call to action

Immediately after the hero statement, provide links to the two most important actions.

Suggested links:

- try the demo
- download releases
- read the docs

Keep it tight. Do not add too many links in the opening block.

### 3. hero screenshot

Place one strong screenshot high in the README.

Requirements:

- use a clean screenshot of the actual product
- prefer the main tree view and scrubber
- crop tightly enough that the product is legible in the GitHub page layout
- avoid giant images that push everything else too far down

Optional:

- include a short caption below the screenshot
- keep the caption factual, one line only

### 4. one-command demo section

Place a very short “try it now” section near the top.

Example:

```md
## Try it now

```bash
pnpm install && pnpm demo
```

Starts the studio with a deterministic demo bundle preloaded.
```

Rules:

- this should appear before long feature or architecture sections
- the wording should make clear that the command gives a real first experience
- avoid lengthy setup discussion in this section

### 5. three capability blocks

Add a short section that explains the tool through three primary capabilities.

Recommended headings:

- **replay runs**
- **inspect state**
- **follow live**

Each block should be 2 to 4 lines max.

Example framing:

#### replay runs
Open a recorded run, scrub through ticks, and inspect node state over time.

#### inspect state
See what changed at the selected tick, including blackboard updates and status changes.

#### follow live
Connect to a running system and follow new events as they arrive.

This section should feel fast and usable.

### 6. relationship to muesli-bt

Add a short section explaining how `muesli-studio` relates to `muesli-bt`.

Keep it brief.

Example:

```md
## Built for muesli-bt

`muesli-studio` is the visual inspector for `muesli-bt`. It works with the same canonical event stream used for replay and live monitoring.
```

Do not let this section take over the page.

### 7. proof of seriousness

After the user-facing sections, add a compact section that signals technical credibility.

This may include:

- deterministic fixtures
- contract or schema validation
- release artefacts
- CI checks
- compatibility notes

Suggested heading:

```md
## Why this is reliable
```

The tone should be factual, not boastful.

### 8. screenshots or feature gallery

If there are multiple screenshots, place them below the first user-facing material.

Recommended screenshots:

- main tree view with timeline or scrubber
- blackboard diff or event detail view
- live monitoring mode if visually distinct

Do not overload the README with too many images.

Two or three strong images are enough.

### 9. installation, development, architecture

Only after the above should the README move into:

- installation detail
- development workflow
- package layout
- schema or contract sourcing
- contribution notes

These sections are still useful and should remain, but they should no longer dominate the first impression.

### 10. roadmap or current scope

Any “current status”, “planned work”, or milestone language should appear low on the page.

Use plain language. Example:

```md
## current scope

The current release focuses on replay-first inspection and live monitoring. Editing workflows and deeper authoring support may be added later.
```

This is much better than leading with incomplete-future framing.

## README writing rules

### do

- lead with what the tool lets the user do
- use action verbs
- show the product early
- keep sections visually short
- use tight, plain technical language
- make the demo path obvious

### do not

- open with “A monorepo for...”
- lead with internal package names
- explain protocols before showing the product
- overuse research caveats in the opening section
- front-load future work
- bury the demo below implementation detail

## preferred copy style

Preferred phrases:

- replay runs
- inspect every tick
- monitor live behaviour
- open a recorded run
- follow events as they arrive
- inspect node state
- examine what changed

Phrases to avoid near the top:

- monorepo
- canonical event schema
- package graph
- current milestone
- future work begins with
- architecture overview

These may still appear later.

## recommended opening copy

The maintainer may use or adapt the following.

```md
# muesli-studio

**Replay and monitor behaviour trees.**

`muesli-studio` is the inspector for `muesli-bt`. Open a recorded run, scrub ticks, inspect node state, examine state changes, or follow live events over WebSocket.

[Try the demo](#try-it-now) · [Download releases](#releases) · [Documentation](#documentation)
```

## recommended section order summary

1. title and hero
2. links to demo, releases, docs
3. screenshot
4. one-command demo
5. three capability blocks
6. built for muesli-bt
7. proof of seriousness
8. more screenshots or examples
9. installation and development
10. scope and roadmap

---

# section 2: direction for the web team

## website goal

The website or landing page should make `muesli-studio` feel like a product you can open and use today.

It should not feel like documentation first.

Documentation can sit behind the landing page. The landing page itself should create interest and immediate clarity.

## desired visual character

The reference point is not literal Apple imitation. The reference point is:

- bold clarity
- sparse presentation
- strong typography
- a lot of white space
- crisp product imagery
- confidence without clutter

Think “early Apple boldness and energy” in the sense of clarity and nerve, not in the sense of copying historical styling.

## visual principles

### typography

- use large headline sizes
- keep the main headline short
- use clean sans-serif typography
- make section headings decisive and compact
- do not use dense small text blocks at the top

### layout

- strong hero section
- big product screenshot above the fold or immediately below
- generous spacing between sections
- use a grid for feature cards
- keep text width controlled and readable

### colour

- mostly black, white, and neutral tones
- one accent colour only
- use the accent sparingly for actions, highlights, or diagrams
- do not use multiple competing highlight colours

### imagery

- use real product screenshots, not abstract graphics
- keep screenshots sharp and believable
- crop to the most legible part of the UI
- prefer one excellent screenshot over many weak ones

### motion

If the site includes motion:

- keep it restrained
- simple fade, reveal, or panel transition is enough
- avoid gimmicks

## what the website should say first

The hero should answer the same question as the README:

> what is this and why should I care?

Recommended hero pattern:

### headline

Use one of these patterns or something close in spirit:

- **See every tick.**
- **Replay and monitor behaviour trees.**
- **Inspect behaviour as it unfolds.**

### subheading

A short sentence, for example:

> `muesli-studio` is the inspector for `muesli-bt`, built for replay, state inspection, and live monitoring.

### hero actions

Use only two primary actions, possibly three.

Recommended:

- try the demo
- get the release
- view docs or GitHub

Do not overload the hero with many destinations.

## website structure to implement

### hero section

Contents:

- short bold headline
- one-sentence explanation
- 2 or 3 buttons max
- one strong screenshot or composed product visual

Hero layout suggestion:

- left: headline, sentence, actions
- right: screenshot of tree view and scrubber

### capability section

A three-card row directly below the hero.

Cards:

#### replay
Open recorded runs and scrub through them tick by tick.

#### inspect
See node states and state changes at any point in time.

#### live
Follow a running system over the same event stream.

Keep each card short.

### product detail section

Show a second screenshot or split layout.

Possible focus:

- blackboard diff
- node detail panel
- live connection flow

Each image should have a short caption.

### technical proof strip

This section is important. It tells the reader that this is not just a pretty UI.

Possible items:

- deterministic fixtures
- contract-compatible event stream
- replay and live views share the same model
- release builds available
- CI-backed validation

This should be visually lighter than the hero, but still prominent.

### built for muesli-bt section

A compact section linking the tool to the runtime.

This should explain:

- `muesli-studio` is not an isolated dashboard
- it is part of the broader `muesli-bt` workflow
- the tool is grounded in the same execution model and event stream

Do not turn this into a deep architecture essay on the landing page.

### final CTA section

End the page with a direct action section.

Suggested options:

- run the demo
- download a release
- read the docs
- visit GitHub

## homepage copy rules

### do

- speak in terms of actions and outcomes
- keep paragraphs short
- use declarative language
- show the UI early
- sound like a sharp tool, not a consultancy

### do not

- open with internal project organisation
- explain the repo before the product
- overdo “platform” or “solution” language
- use startup clichés
- make large claims about changing robotics forever

## recommended website section order summary

1. hero
2. three capabilities
3. product detail screenshot block
4. technical proof strip
5. built for muesli-bt
6. final CTA

---

# section 3: shared copy and brand direction

## brand personality

The project should feel:

- precise
- bold
- technical
- modern
- lean

It should not feel:

- cute
- generic enterprise
- over-designed
- corporate-safe to the point of blandness

## language rules

### use language like this

- inspect every tick
- replay real runs
- follow live behaviour
- examine state changes
- open a recorded run
- built for muesli-bt
- the inspector for behaviour execution

### avoid language like this

- next-generation observability platform
- seamless enterprise-grade solution
- empowering developers to unlock value
- future-proof robotics workflows
- robust end-to-end ecosystem

The project is strongest when it sounds concrete.

## relationship between README and website

The README and website should feel aligned, but not duplicated.

### README should emphasise

- quick understanding on GitHub
- one-command trial path
- real feature outline
- developer trust
- release and setup path

### website should emphasise

- visual clarity
- product feel
- immediate interest
- screenshots and action
- entry path to demo, docs, and GitHub

The website should not merely restyle the README.

---

# section 4: implementation priorities

## priority 1

Change the first screen of the README.

This gives the biggest return for the least work.

Required actions:

- replace the current opening with a user-facing hero
- move demo command near the top
- move architecture and package detail lower down

## priority 2

Prepare one polished hero screenshot.

This will improve both GitHub and website presence.

Required actions:

- choose the best current screen
- clean the example data if needed
- export a crisp image at sensible width

## priority 3

Create a simple landing page.

This can be a single page first.

Required actions:

- hero
- three capability cards
- one or two screenshots
- links to demo, docs, releases, GitHub

## priority 4

Align copy across surfaces.

Use the same core claim in README, website, release notes, and social posts.

Example shared line:

> `muesli-studio` is the inspector for `muesli-bt`, built for replay, inspection, and live monitoring.

---

# section 5: acceptance criteria

The work is successful if a technically literate reader can open the README or website and, within a few seconds, understand all of the following:

- `muesli-studio` is a tool, not just a codebase
- it is for replay, inspection, and live monitoring
- it belongs to the `muesli-bt` ecosystem
- it is already usable
- there is a clear path to try it

If the first impression is still “this looks like internal project scaffolding”, the work is not done.

---

# section 6: concrete deliverables

## for the maintainer

- revise top-level `README.md` using the structure in this document
- move one-command demo near the top
- add or improve one strong hero screenshot
- demote monorepo and package detail to later sections
- tighten the opening copy to a tool-first framing

## for the web team

- create a landing page with the structure defined above
- use a minimal bold visual style with strong typography and white space
- include real product screenshots early
- keep navigation simple and action-oriented
- link clearly to demo, docs, releases, and GitHub

---

# appendix: proposed copy blocks

## hero copy option 1

**Replay and monitor behaviour trees.**

`muesli-studio` is the inspector for `muesli-bt`. Open a recorded run, scrub ticks, inspect node state, and follow live events.

## hero copy option 2

**See every tick.**

Inspect behaviour execution in `muesli-bt` through replay, state diffs, and live monitoring.

## hero copy option 3

**Inspect behaviour as it unfolds.**

Use `muesli-studio` to replay runs, examine state changes, and connect to live systems.

## capability block copy

### replay
Open recorded runs and scrub through them tick by tick.

### inspect
See node states and state changes at any point in time.

### live
Follow a running system over the same event stream.

## final note

The main shift required here is simple:

- stop leading with project internals
- start leading with the experience of using the tool

That is the difference between a repository that looks like an internal prototype and one that looks like a serious early tool.

