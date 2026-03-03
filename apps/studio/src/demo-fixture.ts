export interface DemoFixtureQuery {
  jsonlPath: string;
  sidecarPath: string | null;
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

export function parseDemoFixtureQuery(search: string): DemoFixtureQuery | null {
  const query = new URLSearchParams(search);
  const jsonlPath = sanitisePath(query.get('demo_fixture'));
  if (!jsonlPath) {
    return null;
  }

  return {
    jsonlPath,
    sidecarPath: sanitisePath(query.get('demo_sidecar')),
  };
}
