# release notes

## what this is

This page records human-readable release notes for `muesli-studio` tags.

## when to use it

Use this page when you need:

- a concise summary of what shipped in a release
- the exact artefacts published for that release
- pointers to release workflow details

## how it works

1. Release notes are grouped by release tag.
2. Each release entry includes summary scope, shipped artefacts, and important compatibility notes.
3. Detailed build/publish mechanics remain in `docs/studio/release-targets.md`.

## api / syntax

Release entry template:

```text
## <tag> - <date>

### highlights
- ...

### shipped artefacts
- ...

### notes
- ...
```

## example

## v0.3.0 - 2026-04-03

### highlights

- debugging and navigation release that turns replay into a faster inspection tool rather than a passive viewer
- deep links, event search and jump flows, keyboard-first navigation, compare mode, and stronger run-summary surfacing all land in the same release line
- release artefact trust is stronger through detached signatures, signature-aware verification, and refreshed release and publication documentation

### shipped artefacts

- `muesli-studio-v0.3.0-source.tar.gz`
- `muesli-studio-v0.3.0-source.zip`
- `muesli-studio-v0.3.0-linux-intel.tar.gz` (prebuilt inspector + studio static assets)
- `muesli-studio-v0.3.0-macos-arm.tar.gz` (prebuilt inspector + studio static assets)
- `.sha256` files for all archives
- detached `.asc` signatures for all archives

### notes

- release binaries are built on `ubuntu-latest` (Intel) and `macos-14` (Apple Silicon) GitHub runners
- inspector fallback pin remains on `muesli-bt v0.4.0`
- this release line includes the compare capture in publication bundles and refreshed README screenshots from the canonical demo fixture

## v0.2.0 - 2026-03-21

### highlights

- first feature release after `v0.1.x`, with the Studio shell, presentation mode, and run summary panels brought to a stable demo and screenshot baseline
- richer deterministic replay fixtures, validator/schema sync, and warning-aware summaries so the canonical demo bundle better reflects real planner and scheduler activity
- large-log replay improvements now include lazy URL hydration, an in-app diagnostics panel, and a cleaner local launch story through `start-studio.sh`

### shipped artefacts

- `muesli-studio-v0.2.0-source.tar.gz`
- `muesli-studio-v0.2.0-source.zip`
- `muesli-studio-v0.2.0-linux-intel.tar.gz` (prebuilt inspector + studio static assets)
- `muesli-studio-v0.2.0-macos-arm.tar.gz` (prebuilt inspector + studio static assets)
- `.sha256` files for all archives
- detached `.asc` signatures were added after this release line

### notes

- release binaries are built on `ubuntu-latest` (Intel) and `macos-14` (Apple Silicon) GitHub runners
- inspector fallback pin now tracks `muesli-bt v0.4.0`
- detached signatures are still a post-`v0.2.0` follow-up item

## v0.1.1 - 2026-03-14

### highlights

- patch release that refreshes the inspector fallback pin to `muesli-bt v0.3.1`
- verified inspector configure, build, smoke, and WS/JSONL parity against the new upstream pin
- no Studio-side feature or contract changes; this release stays on the `0.1.x` line

### shipped artefacts

- `muesli-studio-v0.1.1-source.tar.gz`
- `muesli-studio-v0.1.1-source.zip`
- `muesli-studio-v0.1.1-linux-intel.tar.gz` (prebuilt inspector + studio static assets)
- `muesli-studio-v0.1.1-macos-arm.tar.gz` (prebuilt inspector + studio static assets)
- `.sha256` files for all archives

### notes

- release binaries are built on `ubuntu-latest` (Intel) and `macos-14` (Apple Silicon) GitHub runners
- inspector fallback pin now tracks `muesli-bt v0.3.1`

## v0.1.0 - 2026-03-04

### highlights

- first public `muesli-studio` release
- replay-first studio UI with live monitoring, DSL editing, and sidecar-assisted large replay loading
- inspector/runtime bridge with canonical event forwarding to WebSocket and JSONL

### shipped artefacts

- `muesli-studio-v0.1.0-source.tar.gz`
- `muesli-studio-v0.1.0-source.zip`
- `muesli-studio-v0.1.0-linux-intel.tar.gz` (prebuilt inspector + studio static assets)
- `muesli-studio-v0.1.0-macos-arm.tar.gz` (prebuilt inspector + studio static assets)
- `.sha256` files for all archives

### notes

- release binaries are built on `ubuntu-latest` (Intel) and `macos-14` (Apple Silicon) GitHub runners
- inspector fallback pin now tracks `muesli-bt` tag `v0.2.0`

## gotchas

- release notes describe what shipped; they do not replace changelog-level engineering history.
- current tagged releases are intended to publish detached `.asc` signatures alongside `.sha256` checksums, but older tags may predate that addition.

## see also

- `CHANGELOG.md`
- `docs/studio/release-targets.md`
- `.github/workflows/release.yml`
