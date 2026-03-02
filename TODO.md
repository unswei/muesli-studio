# todo

## P1 live monitoring

- [ ] scaffold `apps/inspector` with CMake target `mbt_inspector`
- [ ] add WebSocket event bridge endpoint and JSONL sink wiring in inspector
- [ ] add studio live mode (`ws://host:port/events`) feeding the same replay engine
- [ ] add auto-follow toggle for newest tick in live mode

## P2 editing

- [ ] show `bt_def.dsl` in a text editor panel
- [ ] keep visual tree synchronised by reloading runtime-compiled definitions
- [ ] save edited DSL text back to file for runtime use

## engineering follow-up

- [ ] add CI workflow (`lint`, `test`, `gen:types` drift check)
- [ ] add sidecar index strategy for very large logs
- [ ] add snapshot tests for studio view states
