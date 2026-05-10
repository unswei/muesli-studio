import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseJsonlEvents, ReplayStore, summariseRun } from '@muesli/replay';

import {
  buildEditEvidenceArtifact,
  buildLiveCaptureManifest,
  buildLiveCaptureReadme,
  buildEvidenceManifest,
  buildEvidenceReadme,
  captureFileName,
  evidenceBundleName,
  liveCaptureBundleName,
  serialiseReplayEvents,
} from './evidence';
import { compileBtDsl } from './dsl-compiler';
import { buildBtStructureDiff, compiledToPreviewTreeDefinition, toPreviewTreeDefinition } from './dsl-preview';

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

describe('evidence helpers', () => {
  it('builds a deterministic manifest and readme for the current replay selection', () => {
    const replay = loadStudioDemoReplay();
    const summary = summariseRun(replay.getAllEvents(), {
      contractVersion:
        typeof replay.runStart?.data.contract_version === 'string' ? replay.runStart.data.contract_version : 'unknown',
      schemaVersion: replay.runStart?.schema ?? 'mbt.evt.v1',
    });

    const manifest = buildEvidenceManifest(replay, summary, 3, '4', '2026-03-14T00:00:00.000Z');
    expect(manifest.evidence_schema_version).toBe('muesli-studio.evidence.v1');
    expect(manifest.fixture_name).toBe('fixture-studio-demo-evidence-bundle');
    expect(manifest.backend).toBe('webots');
    expect(manifest.tree_hash).toBe('fnv1a64:dddddddddddddddd');
    expect(manifest.edit_artifact_paths).toEqual([]);
    expect(manifest.redaction).toEqual({ policy: 'none', notes: [] });

    const readme = buildEvidenceReadme(replay, summary, 3, '4', [
      'screenshots/studio-overview.png',
      'screenshots/run-summary.png',
      'screenshots/compare-ticks-2-to-3.png',
    ]);
    expect(readme).toContain('fixture-studio-demo');
    expect(readme).toContain('events.sidecar.tick-index.v1.json');
    expect(readme).toContain('selected tick: 3');
    expect(readme).toContain('screenshots/run-summary.png');
    expect(readme).toContain('screenshots/compare-ticks-2-to-3.png');
    expect(readme).toContain('edit artefact: none');
  });

  it('adds edit artefact paths and readme context when a preview is available', () => {
    const replay = loadStudioDemoReplay();
    const summary = summariseRun(replay.getAllEvents(), {
      contractVersion:
        typeof replay.runStart?.data.contract_version === 'string' ? replay.runStart.data.contract_version : 'unknown',
      schemaVersion: replay.runStart?.schema ?? 'mbt.evt.v1',
    });
    const currentDefinition = toPreviewTreeDefinition({
      dsl: replay.btDef?.data.dsl,
      nodes: replay.btDef?.data.nodes,
      edges: replay.btDef?.data.edges,
    });
    expect(currentDefinition).not.toBeNull();
    const compiled = compileBtDsl('(bt (seq (cond localisation-ready)))');
    const diff = buildBtStructureDiff(currentDefinition!, compiledToPreviewTreeDefinition(compiled));
    const artifact = buildEditEvidenceArtifact({
      compiled,
      diff,
      diagnostics: [],
      capabilityContext: {
        requiredCapabilities: [],
        availableCapabilities: ['cap.motion.v1'],
        missingCapabilities: [],
      },
      appliedPreview: true,
    });

    const manifest = buildEvidenceManifest(replay, summary, 3, '4', '2026-03-14T00:00:00.000Z', artifact);
    expect(manifest.edit_artifact_paths).toEqual(['edit/tree-edit.json', 'edit/bt_def.dsl']);

    const readme = buildEvidenceReadme(replay, summary, 3, '4', [], artifact);
    expect(readme).toContain('edit/tree-edit.json');
    expect(readme).toContain('edit/bt_def.dsl');
    expect(readme).toContain('edit artefact: applied preview');
    expect(artifact).toMatchObject({
      schema: 'muesli-studio.edit-evidence.v1',
      draft_source: '(bt (seq (cond localisation-ready)))',
      applied_preview: true,
      compiled_tree: {
        node_count: 2,
        edge_count: 1,
      },
      capability_context: {
        availableCapabilities: ['cap.motion.v1'],
      },
      diagnostic_counts: {},
    });
  });

  it('serialises replay events and bundle filenames consistently', () => {
    const replay = loadStudioDemoReplay();

    expect(serialiseReplayEvents(replay)).toContain('"run_id":"fixture-studio-demo"');
    expect(evidenceBundleName(replay)).toBe('fixture-studio-demo-evidence-bundle.zip');
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
