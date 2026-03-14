import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parseJsonlEvents, ReplayStore, summariseRun } from '@muesli/replay';

import { RunSummaryPanel } from './RunSummaryPanel';

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

describe('RunSummaryPanel', () => {
  it('renders the richer canonical demo summary', () => {
    const replay = loadStudioDemoReplay();
    const summary = summariseRun(replay.getAllEvents(), {
      contractVersion:
        typeof replay.runStart?.data.contract_version === 'string' ? replay.runStart.data.contract_version : 'unknown',
      schemaVersion: replay.runStart?.schema ?? 'mbt.evt.v1',
    });

    const markup = renderToStaticMarkup(
      <RunSummaryPanel replay={replay} summary={summary} eventCount={replay.getAllEvents().length} />,
    );

    expect(markup).toContain('fixture-studio-demo');
    expect(markup).toContain('webots');
    expect(markup).toContain('fnv1a64:dddddddddddddddd');
    expect(markup).toContain('planner calls');
    expect(markup).toContain('budget warnings');
    expect(markup).toContain('node status');
  });
});
