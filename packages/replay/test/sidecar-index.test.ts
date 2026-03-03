import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildTickSidecarIndex,
  extractTickEventsBySidecar,
  parseJsonlEvents,
  parseJsonlEventsWithOptionalSidecar,
  parseTickSidecarIndex,
  ReplayStore,
} from '../src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');
const largeFixtureDir = path.join(rootDir, 'tests', 'fixtures', 'large_replay');

function sampleTicks(maxTick: number, count: number): number[] {
  const out = new Set<number>();
  let state = 1337;

  while (out.size < count) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out.add((state % maxTick) + 1);
  }

  return Array.from(out.values()).sort((left, right) => left - right);
}

describe('tick sidecar index', () => {
  it('builds a deterministic index for large fixture logs', async () => {
    const eventsText = await readFile(path.join(largeFixtureDir, 'events.jsonl'), 'utf8');
    const index = buildTickSidecarIndex(eventsText);

    expect(index.schema).toBe('mbt.sidecar.tick-index.v1');
    expect(index.event_count).toBe(30002);
    expect(index.max_tick).toBe(5000);
    expect(index.tick_entries).toHaveLength(5000);
    expect(index.tick_entries[0]?.tick).toBe(1);
    expect(index.tick_entries[index.tick_entries.length - 1]?.tick).toBe(5000);
  });

  it('keeps indexed and non-indexed parse paths identical', async () => {
    const eventsText = await readFile(path.join(largeFixtureDir, 'events.jsonl'), 'utf8');
    const sidecarText = await readFile(path.join(largeFixtureDir, 'events.sidecar.tick-index.v1.json'), 'utf8');
    const withoutSidecar = parseJsonlEvents(eventsText);
    const withSidecar = parseJsonlEventsWithOptionalSidecar(eventsText, sidecarText);

    expect(withoutSidecar.errors).toHaveLength(0);
    expect(withSidecar.errors).toHaveLength(0);
    expect(withSidecar.sidecar.index_used).toBe(true);
    expect(withSidecar.events).toEqual(withoutSidecar.events);
  });

  it('returns deterministic tick slices from sidecar byte ranges', async () => {
    const eventsText = await readFile(path.join(largeFixtureDir, 'events.jsonl'), 'utf8');
    const sidecarText = await readFile(path.join(largeFixtureDir, 'events.sidecar.tick-index.v1.json'), 'utf8');
    const parsed = parseJsonlEvents(eventsText);
    expect(parsed.errors).toHaveLength(0);

    const replay = new ReplayStore();
    replay.appendMany(parsed.events);

    const index = parseTickSidecarIndex(sidecarText);
    const ticks = sampleTicks(index.max_tick, 32);
    for (const tick of ticks) {
      expect(extractTickEventsBySidecar(eventsText, index, tick)).toEqual(replay.getTick(tick));
    }
  });
});
