import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseJsonlEvents, ReplayStore, summariseRun } from '@muesli/replay';

import {
  buildLiveCaptureManifest,
  buildLiveCaptureReadme,
  buildPublicationManifest,
  buildPublicationReadme,
  captureFileName,
  liveCaptureBundleName,
  publicationBundleName,
  serialiseReplayEvents,
} from './publication';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

function loadStudioDemoReplay(): ReplayStore {
  const raw = readFileSync(path.join(rootDir, 'tests', 'fixtures', 'studio_demo', 'events.jsonl'), 'utf8');
  const parsed = parseJsonlEvents(raw);
  expect(parsed.errors).toHaveLength(0);

  const replay = new ReplayStore();
  replay.appendMany(parsed.events);
  return replay;
}

describe('publication helpers', () => {
  it('builds a deterministic manifest and readme for the current replay selection', () => {
    const replay = loadStudioDemoReplay();
    const summary = summariseRun(replay.getAllEvents(), {
      contractVersion:
        typeof replay.runStart?.data.contract_version === 'string' ? replay.runStart.data.contract_version : 'unknown',
      schemaVersion: replay.runStart?.schema ?? 'mbt.evt.v1',
    });

    const manifest = buildPublicationManifest(replay, summary, 3, '4', '2026-03-14T00:00:00.000Z');
    expect(manifest.fixture_name).toBe('fixture-studio-demo-publication-bundle');
    expect(manifest.backend).toBe('webots');
    expect(manifest.tree_hash).toBe('fnv1a64:dddddddddddddddd');

    const readme = buildPublicationReadme(replay, summary, 3, '4', [
      'screenshots/studio-overview.png',
      'screenshots/run-summary.png',
      'screenshots/compare-ticks-2-to-3.png',
    ]);
    expect(readme).toContain('fixture-studio-demo');
    expect(readme).toContain('events.sidecar.tick-index.v1.json');
    expect(readme).toContain('selected tick: 3');
    expect(readme).toContain('screenshots/run-summary.png');
    expect(readme).toContain('screenshots/compare-ticks-2-to-3.png');
  });

  it('serialises replay events and bundle filenames consistently', () => {
    const replay = loadStudioDemoReplay();

    expect(serialiseReplayEvents(replay)).toContain('"run_id":"fixture-studio-demo"');
    expect(publicationBundleName(replay)).toBe('fixture-studio-demo-publication-bundle.zip');
    expect(liveCaptureBundleName(replay)).toBe('fixture-studio-demo-live-capture-bundle.zip');
    expect(captureFileName('hero', 3)).toBe('screenshots/studio-overview.png');
    expect(captureFileName('diff', 4)).toBe('screenshots/blackboard-diff-tick-4.png');
    expect(captureFileName('compare', 3)).toBe('screenshots/compare-ticks-2-to-3.png');
  });

  it('builds a live capture bundle manifest and readme without screenshot entries', () => {
    const replay = loadStudioDemoReplay();
    const summary = summariseRun(replay.getAllEvents(), {
      contractVersion:
        typeof replay.runStart?.data.contract_version === 'string' ? replay.runStart.data.contract_version : 'unknown',
      schemaVersion: replay.runStart?.schema ?? 'mbt.evt.v1',
    });

    const manifest = buildLiveCaptureManifest(replay, summary, 3, '4', '2026-04-06T00:00:00.000Z');
    expect(manifest.fixture_name).toBe('fixture-studio-demo-live-capture-bundle');
    expect(manifest.generator).toBe('muesli-studio live capture export');
    expect(manifest.provenance_model).toBe('captured-from-live-session');

    const readme = buildLiveCaptureReadme(replay, summary, 3, '4');
    expect(readme).toContain('live capture bundle');
    expect(readme).toContain('captured from a live Studio session');
    expect(readme).not.toContain('screenshots/studio-overview.png');
  });
});
