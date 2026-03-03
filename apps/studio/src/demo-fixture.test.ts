import { describe, expect, it } from 'vitest';

import { parseDemoFixtureQuery } from './demo-fixture';

describe('parseDemoFixtureQuery', () => {
  it('returns null when no demo fixture query is provided', () => {
    expect(parseDemoFixtureQuery('')).toBeNull();
    expect(parseDemoFixtureQuery('?a=b')).toBeNull();
  });

  it('parses jsonl and optional sidecar paths', () => {
    const parsed = parseDemoFixtureQuery('?demo_fixture=/demo/run/events.jsonl&demo_sidecar=/demo/run/events.sidecar.tick-index.v1.json');
    expect(parsed).toEqual({
      jsonlPath: '/demo/run/events.jsonl',
      sidecarPath: '/demo/run/events.sidecar.tick-index.v1.json',
    });
  });

  it('trims whitespace from demo query parameters', () => {
    const parsed = parseDemoFixtureQuery('?demo_fixture=%20%20/demo/events.jsonl%20%20&demo_sidecar=%20%20%20');
    expect(parsed).toEqual({
      jsonlPath: '/demo/events.jsonl',
      sidecarPath: null,
    });
  });
});
