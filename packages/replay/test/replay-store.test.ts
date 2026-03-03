import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseEvent } from '@muesli/protocol';

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
  it('indexes canonical fixture ticks and blackboard writes', async () => {
    const text = await loadFixture('minimal_run.jsonl');
    const { events, errors } = parseJsonlEvents(text);
    expect(errors).toHaveLength(0);

    const store = new ReplayStore();
    store.appendMany(events);

    expect(store.maxTick).toBe(2);
    expect(store.btDef?.data.nodes.length).toBe(3);
    expect(store.getFirstTreeNodeId()).toBe('1');

    const tick1Diff = store.getBlackboardDiff(1);
    expect(tick1Diff.writes.find((entry) => entry.key === 'state')?.digest).toBe('fnv1a64:1111111111111111');

    const tick2Diff = store.getBlackboardDiff(2);
    expect(tick2Diff.writes.find((entry) => entry.key === 'action')?.digest).toBe('fnv1a64:2222222222222222');

    const bbAt1 = store.getBlackboardAt(1);
    expect(bbAt1.get('state')?.digest).toBe('fnv1a64:1111111111111111');

    const seek = store.seek(2);
    expect(seek.tick).toBe(2);
    expect(seek.events.length).toBeGreaterThan(0);
  });

  it('normalises numeric node ids for node_status lookup', () => {
    const store = new ReplayStore();

    store.append(
      parseEvent({
        schema: 'mbt.evt.v1',
        type: 'node_status',
        run_id: 'run-live',
        unix_ms: 1,
        seq: 1,
        tick: 0,
        data: { node_id: 1, status: 'running' },
      }),
    );

    store.append(
      parseEvent({
        schema: 'mbt.evt.v1',
        type: 'node_status',
        run_id: 'run-live',
        unix_ms: 2,
        seq: 2,
        tick: 1,
        data: { node_id: 1, status: 'success' },
      }),
    );

    expect(store.getNodeStatusAt('1', 0)?.status).toBe('running');
    expect(store.getNodeStatusAt('1', 1)?.status).toBe('success');
  });

  it('supports bt_def override apply/reset without mutating source events', () => {
    const store = new ReplayStore();

    store.append(
      parseEvent({
        schema: 'mbt.evt.v1',
        type: 'bt_def',
        run_id: 'run-edit',
        unix_ms: 1,
        seq: 1,
        data: {
          dsl: '(bt (seq (act original)))',
          nodes: [
            { id: 1, kind: 'seq', name: 'seq' },
            { id: 2, kind: 'act', name: 'original' },
          ],
          edges: [{ parent: 1, child: 2, index: 0 }],
        },
      }),
    );

    expect(store.btDef?.data.dsl).toBe('(bt (seq (act original)))');
    expect(store.getTreeNodeIds()).toEqual(['1', '2']);
    expect(store.hasBtDefOverride).toBe(false);

    store.setBtDefOverride({
      dsl: '(bt (sel (act fallback) (act recover)))',
      nodes: [
        { id: 1, kind: 'sel', name: 'sel' },
        { id: 2, kind: 'act', name: 'fallback' },
        { id: 3, kind: 'act', name: 'recover' },
      ],
      edges: [
        { parent: 1, child: 2, index: 0 },
        { parent: 1, child: 3, index: 1 },
      ],
    });

    expect(store.hasBtDefOverride).toBe(true);
    expect(store.btDef?.data.dsl).toBe('(bt (sel (act fallback) (act recover)))');
    expect(store.getTreeNodeIds()).toEqual(['1', '2', '3']);

    store.clearBtDefOverride();
    expect(store.hasBtDefOverride).toBe(false);
    expect(store.btDef?.data.dsl).toBe('(bt (seq (act original)))');
    expect(store.getTreeNodeIds()).toEqual(['1', '2']);
  });
});
