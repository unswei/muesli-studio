import { describe, expect, it } from 'vitest';

import { buildShareableSearch, parseInspectionStateQuery, parseReplayLinkQuery } from './deep-link';

describe('studio deep links', () => {
  it('parses replay URL sources and inspection state from query parameters', () => {
    const replay = parseReplayLinkQuery('?replay_url=%2Fruns%2Fdemo.jsonl&replay_sidecar=%2Fruns%2Fdemo.sidecar.json');
    const state = parseInspectionStateQuery('?tick=7&node=planner&view=compare');

    expect(replay).toEqual({
      jsonlUrl: '/runs/demo.jsonl',
      sidecarUrl: '/runs/demo.sidecar.json',
    });
    expect(state).toEqual({
      selectedTick: 7,
      selectedNodeId: 'planner',
      view: 'compare',
    });
  });

  it('builds a clean sharable search for URL-backed replay state', () => {
    const search = buildShareableSearch('?foo=bar&demo_fixture=%2Fdemo%2Fold.jsonl&demo_tick=2', {
      kind: 'url',
      jsonlUrl: '/runs/demo.jsonl',
      sidecarUrl: '/runs/demo.sidecar.json',
    }, {
      selectedTick: 11,
      selectedNodeId: '4',
      view: 'compare',
    });

    expect(search).toBe(
      '?foo=bar&replay_url=%2Fruns%2Fdemo.jsonl&replay_sidecar=%2Fruns%2Fdemo.sidecar.json&tick=11&node=4&view=compare',
    );
  });

  it('clears studio deep-link state for non-sharable replay sources', () => {
    const search = buildShareableSearch('?replay_url=%2Fruns%2Fdemo.jsonl&tick=3&node=4&view=node&foo=bar', {
      kind: 'none',
    }, {
      selectedTick: 0,
      selectedNodeId: null,
      view: 'overview',
    });

    expect(search).toBe('?foo=bar');
  });
});
