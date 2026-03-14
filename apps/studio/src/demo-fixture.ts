export interface DemoFixtureQuery {
  jsonlPath: string;
  sidecarPath: string | null;
  selectedTick: number | null;
  selectedNodeId: string | null;
  captureMode: DemoCaptureMode | null;
}

export type DemoCaptureMode = 'overview' | 'hero' | 'summary' | 'node' | 'diff' | 'dsl';

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
