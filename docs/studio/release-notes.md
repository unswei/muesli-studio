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
- release artefact signatures are not yet detached-signed.

## see also

- `CHANGELOG.md`
- `docs/studio/release-targets.md`
- `.github/workflows/release.yml`
