# release targets

## what this is

This page describes the release artefacts published by the tag-driven GitHub Actions release workflow.

## when to use it

Use this workflow when you want a tagged release that includes:

- source archives
- Linux Intel binary bundle
- macOS Apple Silicon binary bundle
- a `start-studio.sh` launcher inside each binary bundle

First published release using this target set: `v0.1.0`.

## how it works

1. Push a tag that matches `v*`.
2. The `release` workflow packages source archives from `HEAD`.
3. The workflow builds inspector and studio on each target runner.
4. The workflow packages target bundles and checksum files.
5. The workflow publishes all assets to the GitHub release for that tag.

## api / syntax

Workflow trigger:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Binary packaging script (used by CI and available locally):

```bash
pnpm release:package -- --target linux-intel --version v0.2.0
pnpm release:package -- --target macos-arm --version v0.2.0
```

Published asset names:

- `muesli-studio-<version>-source.tar.gz`
- `muesli-studio-<version>-source.zip`
- `muesli-studio-<version>-linux-intel.tar.gz`
- `muesli-studio-<version>-macos-arm.tar.gz`
- matching `.sha256` files for each archive

Binary bundle contents:

- `start-studio.sh`
- `bin/mbt_inspector`
- `studio/dist`
- schema and contract copies

## example

```bash
git tag v0.2.0
git push origin v0.2.0
```

Then open the release page for `v0.2.0` and download the required artefact.

After unpacking a binary bundle:

```bash
./start-studio.sh
```

## gotchas

- the binary bundles include `start-studio.sh`, `bin/mbt_inspector`, and `studio/dist`.
- `start-studio.sh` serves the bundled app through the local system Python HTTP server.
- release binaries are built on GitHub runners (`ubuntu-latest`, `macos-14`).
- checksum files are provided, but detached signatures are not yet published.
- release binaries contain prebuilt `mbt_inspector` for `linux-intel` and `macos-arm`; no other binary targets are published in this workflow.

## see also

- `.github/workflows/release.yml`
- `tools/release/package-binary.ts`
- `apps/inspector/README.md`
