# contracts

## what this is

This directory contains the local copy of the canonical `muesli-bt` integration contract used by studio and inspector.

## when to use it

Use this copy for quick local reference when updating runtime integration behaviour and CI checks.

## how it works

The contract source of truth comes from the resolved `muesli-bt` dependency used by inspector configure.

Sync after configuring inspector:

```bash
tools/sync_contract.sh
```

## api / syntax

Contract file:

- `contracts/muesli-studio-integration.md`

## example

```bash
pnpm inspector:configure
tools/sync_contract.sh
git diff -- contracts/muesli-studio-integration.md
```

## gotchas

Do not edit `contracts/muesli-studio-integration.md` manually. Sync it from `muesli-bt`.

## see also

- [`schema/mbt.evt.v1.schema.json`](../schema/mbt.evt.v1.schema.json)
- [`apps/inspector/README.md`](../apps/inspector/README.md)
