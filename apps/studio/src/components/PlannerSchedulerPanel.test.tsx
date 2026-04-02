import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parseJsonlEvents, ReplayStore } from '@muesli/replay';

import { buildPlannerSchedulerOverview, PlannerSchedulerPanel } from './PlannerSchedulerPanel';

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

describe('PlannerSchedulerPanel', () => {
  it('summarises planner and scheduler activity from the canonical demo', () => {
    const replay = loadStudioDemoReplay();
    const overview = buildPlannerSchedulerOverview(replay, 3);

    expect(overview.plannerCallCount).toBe(2);
    expect(overview.schedulerJobCount).toBe(2);
    expect(overview.activeTickCount).toBe(4);
    expect(overview.topPlanner).toBe('rrt_star');
    expect(overview.topWorker).toBe('controller-pool-0');
    expect(overview.selectedTickActivity?.plannerEvents).toBeGreaterThan(0);
  });

  it('renders a compact planner and scheduler surface with the shared activity strip', () => {
    const replay = loadStudioDemoReplay();
    const markup = renderToStaticMarkup(<PlannerSchedulerPanel replay={replay} selectedTick={3} />);

    expect(markup).toContain('planner and scheduler');
    expect(markup).toContain('tick activity');
    expect(markup).toContain('rrt_star');
    expect(markup).toContain('controller-pool-0');
    expect(markup).toContain('5.60 ms used');
    expect(markup).toContain('4.20 ms run');
  });
});
