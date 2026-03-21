import { describe, expect, it } from 'vitest';

import { buildCanonicalDemoSearch, canonicalDemoFixture, parseDemoFixtureQuery } from './demo-fixture';

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
      selectedTick: null,
      selectedNodeId: null,
      captureMode: null,
    });
  });

  it('trims whitespace from demo query parameters', () => {
    const parsed = parseDemoFixtureQuery('?demo_fixture=%20%20/demo/events.jsonl%20%20&demo_sidecar=%20%20%20');
    expect(parsed).toEqual({
      jsonlPath: '/demo/events.jsonl',
      sidecarPath: null,
      selectedTick: null,
      selectedNodeId: null,
      captureMode: null,
    });
  });

  it('parses deterministic capture state selectors', () => {
    const parsed = parseDemoFixtureQuery('?demo_fixture=/demo/events.jsonl&demo_tick=3&demo_node=5&demo_capture=node');
    expect(parsed).toEqual({
      jsonlPath: '/demo/events.jsonl',
      sidecarPath: null,
      selectedTick: 3,
      selectedNodeId: '5',
      captureMode: 'node',
    });
  });

  it('accepts the dedicated hero capture mode', () => {
    const parsed = parseDemoFixtureQuery('?demo_fixture=/demo/events.jsonl&demo_capture=hero');
    expect(parsed).toEqual({
      jsonlPath: '/demo/events.jsonl',
      sidecarPath: null,
      selectedTick: null,
      selectedNodeId: null,
      captureMode: 'hero',
    });
  });

  it('ignores invalid capture-state query parameters', () => {
    const parsed = parseDemoFixtureQuery('?demo_fixture=/demo/events.jsonl&demo_tick=-1&demo_node=%20&demo_capture=tree');
    expect(parsed).toEqual({
      jsonlPath: '/demo/events.jsonl',
      sidecarPath: null,
      selectedTick: null,
      selectedNodeId: null,
      captureMode: null,
    });
  });

  it('builds the canonical demo search with the curated first-run selection', () => {
    expect(buildCanonicalDemoSearch()).toBe(
      `?demo_fixture=${encodeURIComponent(canonicalDemoFixture.jsonlPath)}&demo_sidecar=${encodeURIComponent(
        canonicalDemoFixture.sidecarPath,
      )}&demo_tick=${canonicalDemoFixture.selectedTick}&demo_node=${canonicalDemoFixture.selectedNodeId}`,
    );
  });

  it('can override the canonical demo search for deterministic capture states', () => {
    expect(buildCanonicalDemoSearch({ selectedTick: null, selectedNodeId: null, captureMode: 'summary' })).toBe(
      `?demo_fixture=${encodeURIComponent(canonicalDemoFixture.jsonlPath)}&demo_sidecar=${encodeURIComponent(
        canonicalDemoFixture.sidecarPath,
      )}&demo_capture=summary`,
    );
  });
});
