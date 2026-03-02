import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseJsonlEvents } from '../src/jsonl';
import { ReplayStore } from '../src/replay-store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(rootDir, 'tools', 'fixtures', name), 'utf8');
}

describe('parseJsonlEvents', () => {
  it('parses canonical fixtures without errors', async () => {
    const text = await loadFixture('minimal_run.jsonl');
    const result = parseJsonlEvents(text);

    expect(result.errors).toHaveLength(0);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('reports line-aware errors', () => {
    const result = parseJsonlEvents('{"schema":"mbt.evt.v1"}\nnot-json');
    const [firstError] = result.errors;

    expect(result.errors.length).toBeGreaterThan(0);
    expect(firstError?.line).toBe(1);
  });
});

describe('ReplayStore', () => {
  it('indexes ticks, node timelines, and blackboard changes', async () => {
    const text = await loadFixture('minimal_run.jsonl');
    const { events, errors } = parseJsonlEvents(text);
    expect(errors).toHaveLength(0);

    const store = new ReplayStore();
    store.appendMany(events);

    expect(store.maxTick).toBe(1);
    expect(store.btDef?.data.nodes.length).toBeGreaterThan(0);

    const rootAtZero = store.getNodeStatusAt('root', 0);
    expect(rootAtZero?.status).toBe('success');

    const rootAtOne = store.getNodeStatusAt('root', 1);
    expect(rootAtOne?.status).toBe('running');

    const tick0Diff = store.getBlackboardDiff(0);
    expect(tick0Diff.writes.find((entry) => entry.key === 'target')).toBeTruthy();

    const tick1Diff = store.getBlackboardDiff(1);
    expect(tick1Diff.deletes).toContain('target');

    const bbAt0 = store.getBlackboardAt(0);
    expect(bbAt0.get('target')?.digest).toBe('sha256:abc123');

    const bbAt1 = store.getBlackboardAt(1);
    expect(bbAt1.has('target')).toBe(false);

    const seek = store.seek(1);
    expect(seek.tick).toBe(1);
    expect(seek.events.length).toBeGreaterThan(0);
  });
});
