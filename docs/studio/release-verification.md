# release verification

## what this is

This page records the repeatable verification path for packaged `muesli-studio` release bundles.

## when to use it

Use this page when you need to:

- verify a freshly built binary bundle before publishing it
- smoke-test the packaged launcher on the host-supported target
- confirm that checksum and `RELEASE.md` metadata match the archive

## how it works

1. Build the Studio app and inspector for the target host.
2. Package the binary archive with `pnpm release:package`.
3. Run `pnpm release:verify-bundle` on the generated archive.
4. The verifier checks:
   - the adjacent `.sha256` file matches the archive
   - the unpacked bundle contains the expected files
   - `RELEASE.md` repeats target, version, compatibility, launch, and verification notes
   - the packaged launcher serves the Studio UI when the bundle target matches the local host
5. In GitHub Actions, the release workflow runs the same verifier after packaging each binary target.

## api / syntax

Package and verify a local macOS Apple Silicon archive:

```bash
pnpm build
pnpm inspector:build
pnpm release:package -- --target macos-arm --version v0.2.0-rc1
pnpm release:verify-bundle -- dist/release/muesli-studio-v0.2.0-rc1-macos-arm.tar.gz
```

Verify an existing archive with a custom smoke port:

```bash
pnpm release:verify-bundle -- \
  --archive dist/release/muesli-studio-v0.2.0-macos-arm.tar.gz \
  --port 4417
```

## example

On a macOS Apple Silicon host:

```bash
pnpm release:package -- --target macos-arm --version v0.2.0-local
pnpm release:verify-bundle -- dist/release/muesli-studio-v0.2.0-local-macos-arm.tar.gz
```

Expected output includes:

- checksum verification success
- bundle metadata verification success
- launcher smoke verification on `http://127.0.0.1:<port>/`

## gotchas

- launcher smoke only runs when the archive target matches the local host target.
- on a non-matching host, the verifier still checks checksum, archive contents, and `RELEASE.md`, then reports the launch smoke as skipped.
- `release:package` does not cross-compile. Build and package each target on the correct runner or host.

## see also

- [release targets](./release-targets.md)
- [release notes](./release-notes.md)
- [README](../../README.md)
- [verify-bundle.mjs](../../tools/release/verify-bundle.mjs)
