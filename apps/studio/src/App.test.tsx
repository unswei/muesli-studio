import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parseJsonlEvents, ReplayStore } from '@muesli/replay';

import { TreeView } from './components/TreeView';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

describe('studio replay fixtures', () => {
  it('can parse the minimal replay fixture used by the file loader', () => {
    const raw = readFileSync(path.join(rootDir, 'tools', 'fixtures', 'minimal_run.jsonl'), 'utf8');
    const parsed = parseJsonlEvents(raw);

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.events.length).toBeGreaterThan(5);
  });

  it('golden: tick scrub changes tree node statuses', () => {
    const raw = readFileSync(path.join(rootDir, 'tools', 'fixtures', 'minimal_run.jsonl'), 'utf8');
    const parsed = parseJsonlEvents(raw);
    expect(parsed.errors).toHaveLength(0);

    const replay = new ReplayStore();
    replay.appendMany(parsed.events);

    const tick0Markup = renderToStaticMarkup(
      <TreeView replay={replay} selectedTick={0} selectedNodeId="root" onSelectNode={() => {}} />,
    );

    const tick1Markup = renderToStaticMarkup(
      <TreeView replay={replay} selectedTick={1} selectedNodeId="root" onSelectNode={() => {}} />,
    );

    expect(tick0Markup).toContain('Root');
    expect(tick0Markup).toContain('Sequence · success');
    expect(tick1Markup).toContain('Sequence · running');
    expect(tick1Markup).toContain('PickUp');
    expect(tick1Markup).toContain('Action · failure');
  });
});
