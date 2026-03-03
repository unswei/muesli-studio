# studio contract consumption

## what this is

This page defines the minimum runtime contract expectations that `muesli-studio` requires from `muesli-bt`.

This document is a consumer checklist. It does not replace the canonical runtime contract.

## when to use it

Use this checklist when:

- reviewing contract/schema updates from `muesli-bt`
- adding or changing fixture bundles
- triaging compatibility regressions in studio CI

## how it works

Studio gates runtime logs and fixture bundles on version compatibility, then validates event payload shape and ordering assumptions needed by replay/summaries.

If hard requirements are missing, studio fails fast with actionable diagnostics.

## api / syntax

### required version metadata

- contract version present (`runtime-contract-v1` family)
- event schema version present (`mbt.evt.v1` family)

### required stable identifiers

- tick index
- node identifier and node name
- tree identifier when multiple trees are present
- async job identifier for lifecycle correlation

### required minimum event set

- `tick_begin` and `tick_end`
- `node_status` lifecycle events
- async lifecycle events:
  - `sched_submit`, `sched_start`, `sched_cancel`, `sched_finish`
  - `vla_submit`, `vla_poll`, `vla_cancel`, `vla_result`
- planner lifecycle event: `planner_v1`
- warning/error diagnostics for budget/deadline conditions (`error` event type with explicit reason fields)

### required ordering assumptions

- `tick_begin` appears before node activity for a tick
- `tick_end` appears after node activity for a tick
- per-job lifecycle is monotonic within a run (`submit -> start -> terminal`)

## example

Compatible log metadata:

```json
{
  "contract_version": "runtime-contract-v1",
  "schema_version": "mbt.evt.v1"
}
```

Compatible event ordering fragment:

```json
{"type":"tick_begin","tick":12}
{"type":"node_status","tick":12,"data":{"node_id":"3","status":"running"}}
{"type":"tick_end","tick":12}
```

## gotchas

- `mbt.evt.v1` is a schema family; unknown major versions must be rejected.
- newer minor versions can be accepted with warnings only if backward compatible.
- fixture bundles must include explicit contract/schema metadata so gating does not rely on implicit inference.

## see also

- `contracts/muesli-studio-integration.md`
- `schema/mbt.evt.v1.schema.json`
- `packages/replay/src/version-gate.ts`
