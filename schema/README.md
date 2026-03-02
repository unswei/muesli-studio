# mbt.evt.v1 schema

## what this is

This directory contains the canonical event schema for muesli runtime telemetry: `mbt.evt.v1`.

## when to use it

Use this schema when:

- validating replay logs (`.jsonl`)
- validating events emitted over live monitoring transports
- generating TypeScript protocol types for studio packages

## how it works

Each line in a canonical log is a single JSON object matching one event variant in [`mbt.evt.v1.schema.json`](./mbt.evt.v1.schema.json).

The event envelope is fixed:

- `schema`: always `mbt.evt.v1`
- `type`: discriminant for payload shape
- `run_id`, `unix_ms`, `seq`: run identity and ordering
- `tick`: optional tick index
- `data`: event payload

## api / syntax

- schema: JSON Schema draft 2020-12
- event format: JSON object per line (JSONL)
- ordering authority: `seq`

## example

```json
{"schema":"mbt.evt.v1","type":"tick_begin","run_id":"run-001","unix_ms":1710000000000,"seq":2,"tick":0,"data":{}}
```

## gotchas

- use only canonical event `type` values from the schema
- do not emit alternate formats for replay or live streams
- keep payload previews bounded (blackboard writes should avoid full blobs)

## see also

- [`packages/protocol`](../packages/protocol)
- [`tools/fixtures`](../tools/fixtures)
