# fixture bundles and studio inspect

## what this is

This page describes how `muesli-studio` consumes fixture bundles and validates them before regression checks.

## when to use it

Use this flow when you:

- import fixture cases from `muesli-bt`
- verify contract/schema compatibility in CI
- generate deterministic `run_summary.json` outputs

## how it works

1. `studio inspect` loads a bundle directory.
2. Bundle metadata (`manifest.json`) is version-gated.
3. `events.jsonl` is validated via `tools/validate_log.py` (with AJV fallback).
4. A deterministic run summary is generated, including a stable digest.
5. Optional summary output is written to disk.

Browser UI replay remains JSONL-based; bundle loading and subprocess validation run via the Node entrypoint `@muesli/replay/node`.

## api / syntax

Required bundle files:

- `manifest.json`
- `events.jsonl`

Optional bundle files:

- `config.json`
- `seed.json`
- `expected_metrics.json`
- `expected_summary.json` (used for regression tests)

CLI:

```bash
pnpm studio inspect <bundle_dir> [--schema <schema_path>] [--validator <validator_path>] [--out <summary_path>]
```

If `<bundle_dir>` is under `tests/fixtures/<name>`, `studio inspect` automatically uses `tests/fixtures/schema/mbt.evt.v1.schema.json` when `--schema` is not supplied.

## example

```bash
pnpm studio inspect tests/fixtures/determinism_replay \
  --schema tests/fixtures/schema/mbt.evt.v1.schema.json \
  --out /tmp/run_summary.json
```

Large deterministic fixture refresh:

```bash
pnpm fixtures:large
pnpm studio inspect tests/fixtures/large_replay --out /tmp/large_run_summary.json
```

## gotchas

- unknown major contract/schema versions fail fast.
- `tools/validate_log.py` may require Python dependencies (`jsonschema`) in some environments.
- fallback validation protects CI determinism, but subprocess validation remains the preferred path.
- `tests/fixtures/large_replay/events.jsonl` is intentionally large to support sidecar/index performance work.

## see also

- `docs/studio/contract-consumption.md`
- `tests/fixtures/`
- `packages/replay/src/bundle/load-bundle.ts`
- `tools/validate_log.py`
