import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { buildTickSidecarIndex, parseJsonlEvents, ReplayStore } from '@muesli/replay';

import { isReplayBundleFile, readReplayBundle } from './App';
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

  it('golden: tick scrub preserves canonical tree rendering', () => {
    const raw = readFileSync(path.join(rootDir, 'tools', 'fixtures', 'minimal_run.jsonl'), 'utf8');
    const parsed = parseJsonlEvents(raw);
    expect(parsed.errors).toHaveLength(0);

    const replay = new ReplayStore();
    replay.appendMany(parsed.events);

    const tick0Markup = renderToStaticMarkup(
      <TreeView replay={replay} selectedTick={1} selectedNodeId="1" onSelectNode={() => {}} />,
    );

    const tick1Markup = renderToStaticMarkup(
      <TreeView replay={replay} selectedTick={2} selectedNodeId="1" onSelectNode={() => {}} />,
    );

    expect(tick0Markup).toContain('root');
    expect(tick0Markup).toContain('always-true');
    expect(tick1Markup).toContain('always-success');
    expect(tick1Markup).toContain('class="tree-node-kind">seq');
    expect(tick1Markup).toContain('class="tree-node-kind">act');
    expect(tick1Markup).toContain('class="tree-node-status">unknown');
  });

  it('opens replay bundle archives with events and optional sidecar index', async () => {
    const raw = readFileSync(path.join(rootDir, 'tools', 'fixtures', 'minimal_run.jsonl'), 'utf8');
    const sidecar = JSON.stringify(buildTickSidecarIndex(raw, 'events.jsonl'));
    const zip = new JSZip();
    zip.file('events.jsonl', raw);
    zip.file('events.sidecar.tick-index.v1.json', sidecar);

    const archive = await zip.generateAsync({ type: 'arraybuffer' });
    const file = new File([archive], 'minimal-run-live-capture-bundle.zip', { type: 'application/zip' });
    const bundle = await readReplayBundle(file);

    expect(isReplayBundleFile(file)).toBe(true);
    expect(bundle.eventsText).toContain('"run_id":"fixture-minimal"');
    expect(bundle.sidecarText).toContain('"events.jsonl"');
  });
});
