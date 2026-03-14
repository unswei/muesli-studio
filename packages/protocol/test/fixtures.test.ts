import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseEvent } from '../src/validate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readJsonlFixture(fileName: string): Promise<unknown[]> {
  const raw = await readFile(path.join(rootDir, 'tools', 'fixtures', fileName), 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe('protocol fixtures', () => {
  for (const fixture of ['minimal_run.jsonl', 'planner_run.jsonl', 'scheduler_run.jsonl']) {
    it(`validates ${fixture}`, async () => {
      const events = await readJsonlFixture(fixture);
      expect(events.length).toBeGreaterThan(0);

      for (const event of events) {
        expect(() => parseEvent(event)).not.toThrow();
      }
    });
  }

  it('accepts current runtime trace event variants', () => {
    const events: unknown[] = [
      {
        schema: 'mbt.evt.v1',
        type: 'node_enter',
        run_id: 'run-live',
        unix_ms: 1,
        seq: 1,
        tick: 1,
        data: { node_id: 1 },
      },
      {
        schema: 'mbt.evt.v1',
        type: 'planner_call_start',
        run_id: 'run-live',
        unix_ms: 2,
        seq: 2,
        tick: 1,
        data: { node_id: 2, planner: 'mcts', budget_ms: 12 },
      },
      {
        schema: 'mbt.evt.v1',
        type: 'planner_call_end',
        run_id: 'run-live',
        unix_ms: 3,
        seq: 3,
        tick: 1,
        data: { node_id: 2, planner: 'mcts', status: 'ok', time_used_ms: 2, work_done: 33 },
      },
      {
        schema: 'mbt.evt.v1',
        type: 'node_exit',
        run_id: 'run-live',
        unix_ms: 4,
        seq: 4,
        tick: 1,
        data: { node_id: 1, status: 'running', dur_ms: 2.07 },
      },
      {
        schema: 'mbt.evt.v1',
        type: 'budget_warning',
        run_id: 'run-live',
        unix_ms: 5,
        seq: 5,
        tick: 1,
        data: { decision_point: 'planner_call_start', remaining_ms: 0.6, threshold_ms: 1.0, node_id: 2 },
      },
      {
        schema: 'mbt.evt.v1',
        type: 'deadline_exceeded',
        run_id: 'run-live',
        unix_ms: 6,
        seq: 6,
        tick: 1,
        data: { source: 'tick_end', tick_budget_ms: 5, tick_elapsed_ms: 8.2 },
      },
      {
        schema: 'mbt.evt.v1',
        type: 'async_cancel_requested',
        run_id: 'run-live',
        unix_ms: 7,
        seq: 7,
        tick: 1,
        data: { job_id: 'job-7', node_id: 5, reason: 'tick_deadline_exceeded' },
      },
      {
        schema: 'mbt.evt.v1',
        type: 'async_cancel_acknowledged',
        run_id: 'run-live',
        unix_ms: 8,
        seq: 8,
        tick: 1,
        data: { job_id: 'job-7', node_id: 5, accepted: true, reason: 'tick_deadline_exceeded' },
      },
      {
        schema: 'mbt.evt.v1',
        type: 'async_completion_dropped',
        run_id: 'run-live',
        unix_ms: 9,
        seq: 9,
        tick: 1,
        data: { job_id: 'job-7', node_id: 5, reason: 'completion_after_cancel' },
      },
    ];

    for (const event of events) {
      expect(() => parseEvent(event)).not.toThrow();
    }
  });
});
