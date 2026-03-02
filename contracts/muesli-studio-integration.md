# muesli-studio integration contract

## what this is

This page is the canonical integration contract between `muesli-bt` and `muesli-studio`.

`muesli-studio` must treat this page, together with the event schema at `schema/mbt.evt.v1.schema.json`, as the source of truth for compatible integration behaviour.

This contract is a public interface. Any breaking change must be deliberate, documented, and released with matching changelog/schema/fixture/test updates.

## when to use it

Use this contract when you:

- embed `muesli-bt` in an inspector, debugger, or IDE flow
- implement or update the Studio-side runtime adapter
- review compatibility impact of runtime, observability, or host API changes
- prepare a release that `muesli-studio` will consume

## how it works

### requirement 1: cmake package export

`muesli-bt` must install an exported CMake package with stable consumer entry points.

Required:

- `find_package(muesli_bt CONFIG REQUIRED)` works against installed artefacts
- imported target `muesli_bt::runtime` is exported and linkable
- `muesli_btConfig.cmake` is installed
- `muesli_btConfig.cmake` defines `muesli_bt_SHARE_DIR` to `${prefix}/share/muesli_bt`
- public headers are installed under a stable include root
- optional integration targets are exported when enabled and available:
  - `muesli_bt::integration_pybullet`
  - `muesli_bt::integration_webots`
- installed share assets include:
  - `${prefix}/share/muesli_bt/contracts/muesli-studio-integration.md`
  - `${prefix}/share/muesli_bt/schema/mbt.evt.v1.schema.json`

### requirement 2: inspector-facing host api

`muesli-bt` must expose a stable C++ host API surface suitable for inspector integration.

Required capabilities include:

- creating/loading/instantiating BT definitions (`bt_def` lifecycle)
- ticking/resetting instances through host/runtime entry points
- reading event stream lines in-order
- reading blackboard snapshots/entries needed for inspection
- stable C++ integration attach flow through public headers only:
  - `muslisp::runtime_config::register_extension(...)`
  - `muslisp::create_global_env(runtime_config)`
  - integration adapter attach entry points (for example `bt::set_racecar_sim_adapter(...)` for PyBullet)
  - Webots attach entry points (`muslisp::integrations::webots::make_extension(...)` and `bt::integrations::webots::install_callbacks(...)`)

### requirement 3: event callback contract

Studio integration must be able to consume canonical `mbt.evt.v1` events as newline-delimited JSON objects.

Required:

- stable envelope fields (`schema`, `type`, `run_id`, `unix_ms`, `seq`, optional `tick`, `data`)
- monotonic ordering by `seq` per run
- parser-safe payloads (one JSON object per line)

### requirement 4: bt_def event availability

A `bt_def` event must be available for each runtime definition load/store lifecycle so Studio can render the tree structure.

Required payload semantics:

- stable tree identity (`tree_hash`)
- node list with ids/kinds/names
- edge list with parent/child/index

### requirement 5: ordering guarantees

Event ordering is authoritative by `seq` within a `run_id`.

Required:

- `seq` strictly increases for each emitted event in a run
- consumers must not infer ordering from timestamps alone
- `tick` is contextual and may be absent on non-tick events

### requirement 6: metadata envelope

Run metadata and host metadata must remain stable enough for Studio run labelling and filtering.

Required:

- `run_start` event is emitted with host metadata and runtime metadata
- stable `run_id` semantics within a run
- schema version string `mbt.evt.v1` in every envelope

### requirement 7: blackboard helpers

Studio integration requires blackboard inspection helpers through events and runtime APIs.

Required:

- `bb_write` / `bb_delete` events for incremental inspection
- optional `bb_snapshot` support for state resynchronisation
- stable key/value metadata fields needed for UI presentation

### requirement 8: planner/scheduler/vla hooks

Studio depends on planner/scheduler/VLA visibility for debugging and timeline views.

Required event families:

- planner: `planner_v1`
- scheduler: `sched_submit`, `sched_start`, `sched_finish`, `sched_cancel`
- VLA: `vla_submit`, `vla_poll`, `vla_cancel`, `vla_result`

### requirement 9: deterministic mode for fixtures

`muesli-bt` must provide deterministic fixture generation for compatibility checks.

Required:

- checked-in fixtures under `tests/fixtures/mbt.evt.v1/`
- deterministic generator in-repo
- CI drift check fails if regenerated fixtures differ from checked-in fixtures
- host/runtime deterministic mode support with fixed seed and stable event ordering

### requirement 10: failure semantics

Integration failure behaviour must be explicit and non-ambiguous.

Required:

- unknown schema versions fail validation in CI tooling
- malformed JSONL lines fail validation in CI tooling
- contract file updates require explicit changelog acknowledgement in CI

### requirement 11: canonical serialisation for inspector transport

`muesli-bt` must provide canonical event serialisation so Studio can preserve exact parity between websocket and JSONL transport without duplicating JSON formatting logic.

Required:

- canonical pre-serialised JSON event lines are available from runtime event APIs
- serialised envelope layout matches `mbt.evt.v1` exactly
- one canonical serialisation path is used for file output and callback output

### requirement 12: compatibility policy

Runtime API and schema-affecting changes must follow explicit compatibility rules.

Required:

- `muesli-studio` consumes tagged `muesli-bt` releases; optional scheduled CI may test `main`
- breaking inspector-facing C++ API changes require explicit changelog entries
- event schema-affecting changes require schema/version update plus fixture and validator updates in the same change
- contract changes must be acknowledged by changelog update (enforced in CI)

## api / syntax

### package consumption

```cmake
find_package(muesli_bt CONFIG REQUIRED)

add_executable(mbt_inspector ...)
target_link_libraries(mbt_inspector PRIVATE muesli_bt::runtime)
```

Optional PyBullet integration target (when built and installed with `MUESLI_BT_BUILD_INTEGRATION_PYBULLET=ON`):

```cmake
find_package(muesli_bt CONFIG REQUIRED)

add_executable(mbt_inspector ...)
target_link_libraries(mbt_inspector PRIVATE muesli_bt::runtime muesli_bt::integration_pybullet)
```

Optional Webots integration target (when built and installed with `MUESLI_BT_BUILD_INTEGRATION_WEBOTS=ON` and Webots SDK is available):

```cmake
find_package(muesli_bt CONFIG REQUIRED)

add_executable(mbt_inspector ...)
target_link_libraries(mbt_inspector PRIVATE muesli_bt::runtime muesli_bt::integration_webots)
```

Optional-target probe pattern for downstream consumers:

```cmake
if(TARGET muesli_bt::integration_webots)
  target_link_libraries(mbt_inspector PRIVATE muesli_bt::integration_webots)
endif()
```

### c++ integration attach flow

```cpp
muslisp::runtime_config cfg;
cfg.register_extension(muslisp::integrations::pybullet::make_extension());
muslisp::env_ptr env = muslisp::create_global_env(std::move(cfg));

bt::set_racecar_sim_adapter(adapter);
muslisp::eval_source("(env.attach \"pybullet\")", env);
```

Webots attach flow:

```cpp
muslisp::runtime_config cfg;
cfg.register_extension(muslisp::integrations::webots::make_extension(robot_ptr));
muslisp::env_ptr env = muslisp::create_global_env(std::move(cfg));

bt::integrations::webots::install_callbacks(bt::default_runtime_host());
muslisp::eval_source("(env.attach \"webots\")", env);
```

### event envelope

```json
{
  "schema": "mbt.evt.v1",
  "type": "tick_begin",
  "run_id": "run-0001",
  "unix_ms": 1735689600123,
  "seq": 42,
  "tick": 7,
  "data": {}
}
```

### schema authority

Authoritative schema path:

- `schema/mbt.evt.v1.schema.json`

## example

A Studio integration compatibility check should:

1. install `muesli-bt` and build a tiny consumer linking `muesli_bt::runtime`
2. validate fixture logs with `tools/validate_event_log.py`
3. regenerate fixture logs using `tools/gen_fixtures_event_log.cpp`
4. fail if fixture drift is detected

## gotchas

- Changing this contract without updating `CHANGELOG.md` is blocked by CI.
- Changing event schema without updating fixtures and validator expectations will fail CI.
- `seq` is the only ordering key with a strict guarantee.

## see also

- [contracts index](README.md)
- [canonical event schema](https://github.com/unswei/muesli-bt/blob/main/schema/mbt.evt.v1.schema.json)
- [canonical event log docs](../observability/event-log.md)
- [writing a backend](../integration/writing-a-backend.md)
