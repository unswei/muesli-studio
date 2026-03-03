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

- contract identifier present (`runtime-contract-v1.0.0` family)
- contract version present (`1.x` family)
- event schema version present (`mbt.evt.v1` family)

### required stable identifiers

- tick index
- node identifier and node name
- tree identifier when multiple trees are present
- async job identifier for lifecycle correlation

### required minimum event set

- `tick_begin` and `tick_end`
- node lifecycle events:
  - preferred: `node_enter`, `node_exit`
  - compatibility: `node_status` is accepted when present
- async lifecycle events:
  - `vla_submit`, `vla_poll`, `vla_cancel`, `vla_result`
  - cancellation lifecycle: `async_cancel_requested`, `async_cancel_acknowledged`
- planner lifecycle events:
  - `planner_call_start`, `planner_call_end`
  - `planner_v1` summary records (when emitted)
- timing diagnostics:
  - `budget_warning`
  - `deadline_exceeded`

### required ordering assumptions

- `tick_begin` appears before node/planner/async activity for a tick
- `tick_end` appears after node/planner/async activity for a tick
- per-job lifecycle is monotonic within a run (`submit -> poll/start -> terminal`)

## example

Compatible log metadata:

```json
{
  "contract_id": "runtime-contract-v1.0.0",
  "contract_version": "1.0.0",
  "schema": "mbt.evt.v1"
}
```

Compatible event ordering fragment:

```json
{"type":"tick_begin","tick":12}
{"type":"node_enter","tick":12,"data":{"node_id":3}}
{"type":"planner_call_start","tick":12,"data":{"node_id":3,"planner":"mcts","budget_ms":12}}
{"type":"planner_call_end","tick":12,"data":{"node_id":3,"planner":"mcts","status":"ok","time_used_ms":2.0}}
{"type":"node_exit","tick":12,"data":{"node_id":3,"status":"running","dur_ms":2.2}}
{"type":"tick_end","tick":12}
```

## gotchas

- `mbt.evt.v1` is a schema family; unknown major versions must be rejected.
- contract identifier/version must be present on bundle metadata and event stream (`contract_id`, `contract_version`).
- newer minor versions can be accepted with warnings only if backward compatible.
- fixture bundles must include explicit contract/schema metadata so gating does not rely on implicit inference.
- studio should tolerate known compatibility variants (`node_status`) while preferring strict lifecycle pairs (`node_enter`/`node_exit`).

## see also

- `contracts/muesli-studio-integration.md`
- `schema/mbt.evt.v1.schema.json`
- `packages/replay/src/version-gate.ts`
- `packages/replay/src/summarise-run.ts`
