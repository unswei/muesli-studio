import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parseJsonlEvents, ReplayStore } from '@muesli/replay';

import { ComparePanel } from './ComparePanel';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..', '..');

function loadStudioDemoReplay(): ReplayStore {
  const raw = readFileSync(path.join(rootDir, 'tests', 'fixtures', 'studio_demo', 'events.jsonl'), 'utf8');
  const parsed = parseJsonlEvents(raw);
  expect(parsed.errors).toHaveLength(0);

  const replay = new ReplayStore();
  replay.appendMany(parsed.events);
  return replay;
}

describe('ComparePanel', () => {
  it('renders an aligned tick comparison with divergence-first summaries', () => {
    const replay = loadStudioDemoReplay();
    const markup = renderToStaticMarkup(<ComparePanel replay={replay} selectedTick={3} initialBaselineTick={2} />);

    expect(markup).toContain('compare mode');
    expect(markup).toContain('tick comparison');
    expect(markup).toContain('baseline 2');
    expect(markup).toContain('selected 3');
    expect(markup).toContain('nav.replan_reason');
    expect(markup).toContain('aligned node divergence');
  });
});
