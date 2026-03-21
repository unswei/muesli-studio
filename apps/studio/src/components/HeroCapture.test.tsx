import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parseJsonlEvents, ReplayStore, summariseRun } from '@muesli/replay';

import { HeroCapture } from './HeroCapture';

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

describe('HeroCapture', () => {
  it('renders the README hero around the selected node and tick story', () => {
    const replay = loadStudioDemoReplay();
    const summary = summariseRun(replay.getAllEvents(), {
      contractVersion:
        typeof replay.runStart?.data.contract_version === 'string' ? replay.runStart.data.contract_version : 'unknown',
      schemaVersion: replay.runStart?.schema ?? 'mbt.evt.v1',
    });

    const markup = renderToStaticMarkup(
      <HeroCapture
        replay={replay}
        summary={summary}
        selectedTick={3}
        selectedNodeId="4"
        maxTick={4}
        tickCount={5}
        replayIndexed={false}
        onSelectNode={() => {}}
        onSelectTick={() => {}}
      />,
    );

    expect(markup).toContain('canonical inspection view');
    expect(markup).toContain('webots-navigation-demo');
    expect(markup).toContain('Replanned around a moving obstacle');
    expect(markup).toContain('nav.replan_reason');
    expect(markup).toContain('budget warning');
  });
});
