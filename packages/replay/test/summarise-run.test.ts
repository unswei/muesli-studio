import { describe, expect, it } from 'vitest';

import { parseEvent } from '@muesli/protocol';

import { summariseRun } from '../src/summarise-run';

function fixtureEvents() {
  return [
    parseEvent({
      schema: 'mbt.evt.v1',
      type: 'run_start',
      run_id: 'fixture',
      unix_ms: 1,
      seq: 1,
      data: {
        git_sha: 'fixture',
        host: {
          name: 'fixture',
          version: '1',
          platform: 'test',
        },
        tick_hz: 20,
        tree_hash: 'tree',
      },
    }),
    parseEvent({
      schema: 'mbt.evt.v1',
      type: 'tick_end',
      run_id: 'fixture',
      unix_ms: 2,
      seq: 2,
      tick: 1,
      data: {
        status: 'running',
        budget: {
          tick_budget_ms: 5,
          tick_time_ms: 7,
        },
      },
    }),
    parseEvent({
      schema: 'mbt.evt.v1',
      type: 'node_status',
      run_id: 'fixture',
      unix_ms: 3,
      seq: 3,
      tick: 1,
      data: {
        node_id: 1,
        status: 'failure',
      },
    }),
    parseEvent({
      schema: 'mbt.evt.v1',
      type: 'sched_submit',
      run_id: 'fixture',
      unix_ms: 4,
      seq: 4,
      tick: 1,
      data: {
        job_id: 'job-1',
      },
    }),
    parseEvent({
      schema: 'mbt.evt.v1',
      type: 'sched_finish',
      run_id: 'fixture',
      unix_ms: 5,
      seq: 5,
      tick: 1,
      data: {
        job_id: 'job-1',
        status: 'ok',
      },
    }),
    parseEvent({
      schema: 'mbt.evt.v1',
      type: 'vla_result',
      run_id: 'fixture',
      unix_ms: 6,
      seq: 6,
      tick: 1,
      data: {
        job_id: 'vla-1',
        status: 'done',
      },
    }),
    parseEvent({
      schema: 'mbt.evt.v1',
      type: 'error',
      run_id: 'fixture',
      unix_ms: 7,
      seq: 7,
      data: {
        severity: 'warning',
        message: 'deadline exceeded while waiting for planner',
      },
    }),
  ];
}

describe('summariseRun', () => {
  it('creates deterministic summary fields and aggregate counts', () => {
    const summary = summariseRun(fixtureEvents(), {
      contractVersion: 'runtime-contract-v1',
      schemaVersion: 'mbt.evt.v1',
    });

    expect(summary.contract_version).toBe('runtime-contract-v1');
    expect(summary.schema_version).toBe('mbt.evt.v1');
    expect(summary.event_counts.tick_end).toBe(1);
    expect(summary.node_status_counts.failure).toBe(1);
    expect(summary.async_jobs.sched.finish).toBe(1);
    expect(summary.async_jobs.sched.terminal_states.ok).toBe(1);
    expect(summary.async_jobs.vla.result).toBe(1);
    expect(summary.async_jobs.vla.terminal_states.done).toBe(1);
    expect(summary.ticks.count).toBe(1);
    expect(summary.ticks.min_duration_ms).toBe(7);
    expect(summary.warnings.budget_warning_count).toBe(1);
    expect(summary.warnings.deadline_exceeded_count).toBe(1);
    expect(summary.digest.startsWith('fnv1a64:')).toBe(true);
  });

  it('returns stable digest for the same event stream', () => {
    const summaryA = summariseRun(fixtureEvents());
    const summaryB = summariseRun(fixtureEvents());

    expect(summaryA.digest).toBe(summaryB.digest);
  });

  it('changes digest when the event stream changes', () => {
    const baseline = summariseRun(fixtureEvents());
    const changed = summariseRun([
      ...fixtureEvents(),
      parseEvent({
        schema: 'mbt.evt.v1',
        type: 'bb_write',
        run_id: 'fixture',
        unix_ms: 8,
        seq: 8,
        tick: 1,
        data: {
          key: 'x',
          value_digest: 'fnv1a64:1234',
        },
      }),
    ]);

    expect(baseline.digest).not.toBe(changed.digest);
  });
});

