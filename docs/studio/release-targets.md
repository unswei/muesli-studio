# release targets

## what this is

This page describes the release artefacts published by the tag-driven GitHub Actions release workflow.

## when to use it

Use this workflow when you want a tagged release that includes:

- source archives
- Linux Intel binary bundle
- macOS Apple Silicon binary bundle
- a `start-studio.sh` launcher inside each binary bundle
- `.sha256` checksum files for every published archive

Current compatibility target: `muesli-bt v0.4.0`.

First published release using this target set: `v0.1.0`.

## how it works

1. Push a tag that matches `v*`.
2. The `release` workflow packages source archives from `HEAD`.
3. The workflow builds inspector and studio on each target runner.
4. The workflow packages target bundles and checksum files.
5. The workflow writes `RELEASE.md` into each binary bundle with target, version, compatibility, and launch notes.
6. The workflow publishes all assets to the GitHub release for that tag.

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

Bundle verification script:

```bash
pnpm release:verify-bundle -- dist/release/muesli-studio-v0.2.0-macos-arm.tar.gz
```

Published asset names:

- `muesli-studio-<version>-source.tar.gz`
- `muesli-studio-<version>-source.zip`
- `muesli-studio-<version>-linux-intel.tar.gz`
- `muesli-studio-<version>-macos-arm.tar.gz`
- matching `.sha256` files for each archive

Recommended downloads:

- Linux Intel users: `muesli-studio-<version>-linux-intel.tar.gz`
- macOS Apple Silicon users: `muesli-studio-<version>-macos-arm.tar.gz`
- source review or repackaging: `muesli-studio-<version>-source.tar.gz`

Binary bundle contents:

- `start-studio.sh`
- `bin/mbt_inspector`
- `studio/dist`
- schema and contract copies
- `RELEASE.md`

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

Verify an archive before unpacking it:

```bash
shasum -a 256 -c muesli-studio-v0.2.0-linux-intel.tar.gz.sha256
```

## gotchas

- the binary bundles include `start-studio.sh`, `bin/mbt_inspector`, and `studio/dist`.
- `start-studio.sh` serves the bundled app through the local system Python HTTP server.
- release binaries are built on GitHub runners (`ubuntu-latest`, `macos-14`).
- checksum files are provided, but detached signatures are not yet published.
- binary bundle `RELEASE.md` repeats the target, version, and `muesli-bt` compatibility line so the unpacked directory is self-describing.
- the release workflow now runs `pnpm release:verify-bundle` after packaging each binary archive.
- release binaries contain prebuilt `mbt_inspector` for `linux-intel` and `macos-arm`; no other binary targets are published in this workflow.

## see also

- `.github/workflows/release.yml`
- `tools/release/package-binary.ts`
- `tools/release/verify-bundle.mjs`
- `apps/inspector/README.md`
