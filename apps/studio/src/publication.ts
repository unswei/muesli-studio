import type { ReplayStore, RunSummary } from '@muesli/replay';

export const presentationLayouts = ['hero', 'summary', 'node', 'diff', 'dsl'] as const;

export type PresentationLayout = (typeof presentationLayouts)[number];

export interface PublicationManifest {
  contract_id: string;
  contract_version: string;
  fixture_name: string;
  schema: string;
  generator: string;
  provenance_model: string;
  exported_at_utc: string;
  run_id: string;
  backend: string;
  tree_hash: string;
  selected_tick: number;
  selected_node_id: string | null;
}

function stringFromUnknown(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function backendLabel(runStartData: Record<string, unknown> | undefined): string {
  const backend = stringFromUnknown(runStartData?.backend);
  if (backend) {
    return backend;
  }

  const host = runStartData?.host;
  if (host && typeof host === 'object') {
    const hostName = stringFromUnknown((host as Record<string, unknown>).name);
    if (hostName) {
      return hostName;
    }
  }

  return stringFromUnknown(host) ?? 'unknown';
}

export function buildPublicationManifest(
  replay: ReplayStore,
  summary: RunSummary,
  selectedTick: number,
  selectedNodeId: string | null,
  exportedAtUtc: string,
): PublicationManifest {
  const runStartData = replay.runStart?.data as Record<string, unknown> | undefined;
  const btDefData = replay.btDef?.data as Record<string, unknown> | undefined;
  const runId = replay.runStart?.run_id ?? 'unknown-run';

  return {
    contract_id: stringFromUnknown(runStartData?.contract_id) ?? 'runtime-contract-v1',
    contract_version: summary.contract_version,
    fixture_name: `${slugify(runId) || 'studio-run'}-publication-bundle`,
    schema: summary.schema_version,
    generator: 'muesli-studio publication export',
    provenance_model: 'exported-from-studio',
    exported_at_utc: exportedAtUtc,
    run_id: runId,
    backend: backendLabel(runStartData),
    tree_hash:
      stringFromUnknown(btDefData?.tree_hash) ??
      stringFromUnknown(runStartData?.tree_hash) ??
      'unavailable',
    selected_tick: selectedTick,
    selected_node_id: selectedNodeId,
  };
}

export function serialiseReplayEvents(replay: ReplayStore): string {
  return `${replay.getAllEvents().map((event) => JSON.stringify(event)).join('\n')}\n`;
}

export function publicationBundleName(replay: ReplayStore): string {
  const runId = replay.runStart?.run_id ?? 'studio-run';
  return `${slugify(runId) || 'studio-run'}-publication-bundle.zip`;
}

export function captureFileName(layout: PresentationLayout, selectedTick: number): string {
  if (layout === 'hero') {
    return 'screenshots/studio-overview.png';
  }

  if (layout === 'summary') {
    return 'screenshots/run-summary.png';
  }

  if (layout === 'node') {
    return `screenshots/node-inspector-tick-${selectedTick}.png`;
  }

  if (layout === 'diff') {
    return `screenshots/blackboard-diff-tick-${selectedTick}.png`;
  }

  return 'screenshots/dsl-editor.png';
}

export function buildPublicationReadme(
  replay: ReplayStore,
  summary: RunSummary,
  selectedTick: number,
  selectedNodeId: string | null,
  screenshotFiles: readonly string[],
): string {
  const runStartData = replay.runStart?.data as Record<string, unknown> | undefined;
  const btDefData = replay.btDef?.data as Record<string, unknown> | undefined;
  const treeName = stringFromUnknown(btDefData?.tree_name) ?? 'behaviour tree';
  const backend = backendLabel(runStartData);
  const runId = replay.runStart?.run_id ?? 'unknown-run';

  return [
    '# muesli-studio publication bundle',
    '',
    '## what this is',
    '',
    `This bundle was exported from muesli-studio for run \`${runId}\` on backend \`${backend}\`.`,
    '',
    '## contents',
    '',
    '- `events.jsonl`: canonical replay event stream',
    '- `events.sidecar.tick-index.v1.json`: deterministic sidecar index for faster replay seeks',
    '- `manifest.json`: bundle metadata and selection state',
    '- `run_summary.json`: deterministic run summary used by Studio',
    '- `README.md`: short reproduction notes',
    ...screenshotFiles.map((fileName) => `- \`${fileName}\`: exported presentation screenshot`),
    '',
    '## inspection context',
    '',
    `- tree: ${treeName}`,
    `- selected tick: ${selectedTick}`,
    `- selected node: ${selectedNodeId ?? 'none'}`,
    `- schema: ${summary.schema_version}`,
    `- contract: ${summary.contract_version}`,
    `- digest: ${summary.digest}`,
    '',
    '## how to use it',
    '',
    '1. Open `events.jsonl` in muesli-studio replay mode and add `events.sidecar.tick-index.v1.json` for indexed scrubbing.',
    '2. Use `run_summary.json` for the overall run shape before scrubbing.',
    '3. Use the screenshots under `screenshots/` directly in talks, slides, or supplementary material.',
    '',
  ].join('\n');
}
