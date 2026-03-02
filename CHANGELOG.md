# changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- initial monorepo workspace scaffold with `pnpm-workspace.yaml`
- canonical `mbt.evt.v1` schema and schema documentation scaffold
- `@muesli/protocol` with generated TypeScript types and zod validation
- `@muesli/replay` replay engine with JSONL ingest/index/query API
- replay-first `@muesli/studio` UI (file load, tree view, scrubber, status colours, blackboard diffs)
- canonical fixture logs for replay tests and docs
- fixture schema-conformance script (`pnpm check:fixtures`) using `schema/mbt.evt.v1.schema.json`
- golden studio UI test for tick-to-status rendering in tree view
- GitHub Actions workflow for `P0` checks (`gen:types`, generated-diff check, fixture validation, `lint`, `test`, `build`)
