export interface DemoFixtureQuery {
  jsonlPath: string;
  sidecarPath: string | null;
  selectedTick: number | null;
  selectedNodeId: string | null;
  captureMode: DemoCaptureMode | null;
}

export type DemoCaptureMode = 'overview' | 'hero' | 'summary' | 'node' | 'diff' | 'dsl';

export const canonicalDemoFixture = Object.freeze({
  fixtureName: 'studio_demo',
  runId: 'fixture-studio-demo',
  jsonlPath: '/demo/studio_demo/events.jsonl',
  sidecarPath: '/demo/studio_demo/events.sidecar.tick-index.v1.json',
  selectedTick: 3,
  selectedNodeId: '4',
});

interface CanonicalDemoSearchOptions {
  selectedTick?: number | null;
  selectedNodeId?: string | null;
  captureMode?: DemoCaptureMode | null;
}

function sanitisePath(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

function sanitiseTick(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function sanitiseNodeId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

function sanitiseCaptureMode(value: string | null): DemoCaptureMode | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (
    trimmed === 'overview' ||
    trimmed === 'hero' ||
    trimmed === 'summary' ||
    trimmed === 'node' ||
    trimmed === 'diff' ||
    trimmed === 'dsl'
  ) {
    return trimmed;
  }

  return null;
}

export function buildCanonicalDemoSearch(options: CanonicalDemoSearchOptions = {}): string {
  const params = new URLSearchParams();
  params.set('demo_fixture', canonicalDemoFixture.jsonlPath);
  params.set('demo_sidecar', canonicalDemoFixture.sidecarPath);

  const selectedTick =
    options.selectedTick === undefined ? canonicalDemoFixture.selectedTick : options.selectedTick;
  const selectedNodeId =
    options.selectedNodeId === undefined ? canonicalDemoFixture.selectedNodeId : options.selectedNodeId;
  const captureMode = options.captureMode ?? null;

  if (selectedTick !== null) {
    params.set('demo_tick', String(selectedTick));
  }

  if (selectedNodeId !== null) {
    params.set('demo_node', selectedNodeId);
  }

  if (captureMode !== null) {
    params.set('demo_capture', captureMode);
  }

  return `?${params.toString()}`;
}

export function parseDemoFixtureQuery(search: string): DemoFixtureQuery | null {
  const query = new URLSearchParams(search);
  const jsonlPath = sanitisePath(query.get('demo_fixture'));
  if (!jsonlPath) {
    return null;
  }

  return {
    jsonlPath,
    sidecarPath: sanitisePath(query.get('demo_sidecar')),
    selectedTick: sanitiseTick(query.get('demo_tick')),
    selectedNodeId: sanitiseNodeId(query.get('demo_node')),
    captureMode: sanitiseCaptureMode(query.get('demo_capture')),
  };
}
