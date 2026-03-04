import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseEvent } from '@muesli/protocol';
import { buildTickSidecarIndex, ReplayStore } from '@muesli/replay';

import { compileBtDsl } from './dsl-compiler';
import { useStudioStore } from './store';

function resetStore(): void {
  useStudioStore.setState({
    replay: null,
    eventCount: 0,
    selectedTick: 0,
    selectedNodeId: null,
    parseErrors: [],
    replayLoadProgress: null,
    replayIndexed: false,
    replayLoadWarning: null,
    replaySourceBytes: 0,
    replayMaxTick: 0,
    treeRevision: 0,
    lazySidecar: null,
    mode: 'replay',
    liveUrl: 'ws://localhost:8765/events',
    liveStatus: 'disconnected',
    liveAutoFollow: true,
    liveReconnectEnabled: true,
    liveLastError: null,
    liveLastEventUnixMs: null,
    liveHistory: [],
  });
}

describe('studio live store behaviour', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-follows newest tick while enabled', () => {
    resetStore();

    const tick0 = parseEvent({
      schema: 'mbt.evt.v1',
      type: 'tick_begin',
      run_id: 'run-live',
      unix_ms: 1,
      seq: 1,
      tick: 0,
      data: {},
    });

    const tick1 = parseEvent({
      schema: 'mbt.evt.v1',
      type: 'tick_begin',
      run_id: 'run-live',
      unix_ms: 2,
      seq: 2,
      tick: 1,
      data: {},
    });

    useStudioStore.getState().appendLiveEvents([tick0]);
    expect(useStudioStore.getState().selectedTick).toBe(0);

    useStudioStore.getState().appendLiveEvents([tick1]);
    expect(useStudioStore.getState().selectedTick).toBe(1);
    expect(useStudioStore.getState().mode).toBe('live');
    expect(useStudioStore.getState().liveLastEventUnixMs).toBe(2);
  });

  it('stops auto-following after manual override', () => {
    resetStore();

    const tick0 = parseEvent({
      schema: 'mbt.evt.v1',
      type: 'tick_begin',
      run_id: 'run-live',
      unix_ms: 1,
      seq: 1,
      tick: 0,
      data: {},
    });

    const tick1 = parseEvent({
      schema: 'mbt.evt.v1',
      type: 'tick_begin',
      run_id: 'run-live',
      unix_ms: 2,
      seq: 2,
      tick: 1,
      data: {},
    });

    useStudioStore.getState().appendLiveEvents([tick0, tick1]);
    useStudioStore.getState().setLiveAutoFollow(false);
    useStudioStore.getState().setSelectedTick(0);

    const tick2 = parseEvent({
      schema: 'mbt.evt.v1',
      type: 'tick_begin',
      run_id: 'run-live',
      unix_ms: 3,
      seq: 3,
      tick: 2,
      data: {},
    });

    useStudioStore.getState().appendLiveEvents([tick2]);
    expect(useStudioStore.getState().selectedTick).toBe(0);
    expect(useStudioStore.getState().replay?.maxTick).toBe(2);
  });

  it('tracks live reconnect settings and history entries', () => {
    resetStore();

    useStudioStore.getState().setLiveReconnectEnabled(false);
    useStudioStore.getState().addLiveHistory({ level: 'info', message: 'Connecting to ws://localhost:8765/events', atUnixMs: 123 });
    useStudioStore.getState().addLiveHistory({ level: 'warning', message: 'Retry 1 in 500ms', atUnixMs: 124 });

    const state = useStudioStore.getState();
    expect(state.liveReconnectEnabled).toBe(false);
    expect(state.liveHistory).toHaveLength(2);
    expect(state.liveHistory[0]?.message).toContain('Connecting');

    useStudioStore.getState().clearLiveHistory();
    expect(useStudioStore.getState().liveHistory).toHaveLength(0);
  });

  it('flags large replay fallback when sidecar is missing', () => {
    resetStore();

    const jsonl = [
      '{"schema":"mbt.evt.v1","type":"run_start","run_id":"run-1","unix_ms":1,"seq":1,"data":{"git_sha":"fixture","host":{"name":"studio","version":"0.1.0","platform":"test"},"tick_hz":20,"tree_hash":"fnv1a64:1","capabilities":{"reset":true}}}',
      '{"schema":"mbt.evt.v1","type":"tick_begin","run_id":"run-1","unix_ms":2,"seq":2,"tick":1,"data":{}}',
      '{"schema":"mbt.evt.v1","type":"tick_end","run_id":"run-1","unix_ms":3,"seq":3,"tick":1,"data":{"root_status":"success","tick_ms":1.1}}',
    ].join('\n');

    useStudioStore.getState().loadJsonl(jsonl, null, 10 * 1024 * 1024);
    const state = useStudioStore.getState();
    expect(state.replayIndexed).toBe(false);
    expect(state.replayLoadWarning).toContain('full-scan fallback');
  });

  it('uses sidecar metadata when a valid sidecar is provided', () => {
    resetStore();

    const jsonl = [
      '{"schema":"mbt.evt.v1","type":"run_start","run_id":"run-1","unix_ms":1,"seq":1,"data":{"git_sha":"fixture","host":{"name":"studio","version":"0.1.0","platform":"test"},"tick_hz":20,"tree_hash":"fnv1a64:1","capabilities":{"reset":true}}}',
      '{"schema":"mbt.evt.v1","type":"tick_begin","run_id":"run-1","unix_ms":2,"seq":2,"tick":1,"data":{}}',
      '{"schema":"mbt.evt.v1","type":"tick_end","run_id":"run-1","unix_ms":3,"seq":3,"tick":1,"data":{"root_status":"success","tick_ms":1.1}}',
    ].join('\n');

    const sidecar = buildTickSidecarIndex(jsonl, 'events.jsonl');
    useStudioStore.getState().loadJsonl(jsonl, JSON.stringify(sidecar), 1024);

    const state = useStudioStore.getState();
    expect(state.replayIndexed).toBe(true);
    expect(state.replayLoadWarning).toBeNull();
  });

  it('lazily loads sidecar ticks for very large replay logs', () => {
    resetStore();

    const jsonl = [
      '{"schema":"mbt.evt.v1","type":"run_start","run_id":"run-large","unix_ms":1,"seq":1,"data":{"git_sha":"fixture","host":{"name":"studio","version":"0.1.0","platform":"test"},"tick_hz":20,"tree_hash":"fnv1a64:1","capabilities":{"reset":true}}}',
      '{"schema":"mbt.evt.v1","type":"bt_def","run_id":"run-large","unix_ms":2,"seq":2,"data":{"dsl":"(bt (seq (act one) (act two) (act three)))","nodes":[{"id":1,"kind":"seq","name":"root"},{"id":2,"kind":"act","name":"one"},{"id":3,"kind":"act","name":"two"},{"id":4,"kind":"act","name":"three"}],"edges":[{"parent":1,"child":2,"index":0},{"parent":1,"child":3,"index":1},{"parent":1,"child":4,"index":2}]}}',
      '{"schema":"mbt.evt.v1","type":"tick_begin","run_id":"run-large","unix_ms":3,"seq":3,"tick":1,"data":{}}',
      '{"schema":"mbt.evt.v1","type":"tick_end","run_id":"run-large","unix_ms":4,"seq":4,"tick":1,"data":{"root_status":"running","tick_ms":1.1}}',
      '{"schema":"mbt.evt.v1","type":"tick_begin","run_id":"run-large","unix_ms":5,"seq":5,"tick":2,"data":{}}',
      '{"schema":"mbt.evt.v1","type":"tick_end","run_id":"run-large","unix_ms":6,"seq":6,"tick":2,"data":{"root_status":"running","tick_ms":1.2}}',
      '{"schema":"mbt.evt.v1","type":"tick_begin","run_id":"run-large","unix_ms":7,"seq":7,"tick":3,"data":{}}',
      '{"schema":"mbt.evt.v1","type":"tick_end","run_id":"run-large","unix_ms":8,"seq":8,"tick":3,"data":{"root_status":"success","tick_ms":1.3}}',
    ].join('\n');

    const sidecar = buildTickSidecarIndex(jsonl, 'events.jsonl');
    useStudioStore.getState().loadJsonl(jsonl, JSON.stringify(sidecar), 10 * 1024 * 1024);

    const initial = useStudioStore.getState();
    expect(initial.replayIndexed).toBe(true);
    expect(initial.replayMaxTick).toBe(3);
    expect(initial.replayLoadWarning).toContain('lazy loading');
    expect(initial.selectedTick).toBe(1);
    expect(initial.eventCount).toBe(4);

    useStudioStore.getState().setSelectedTick(3);
    const afterSelect = useStudioStore.getState();
    expect(afterSelect.selectedTick).toBe(3);
    expect(afterSelect.replay?.getTick(3).length).toBeGreaterThan(0);
    expect(afterSelect.replay?.getTick(2).length).toBeGreaterThan(0);
    expect(afterSelect.eventCount).toBe(8);
  });

  it('uses file-slice lazy loading for large sidecar-backed file input', async () => {
    resetStore();

    const jsonl = [
      '{"schema":"mbt.evt.v1","type":"run_start","run_id":"run-file","unix_ms":1,"seq":1,"data":{"git_sha":"fixture","host":{"name":"studio","version":"0.1.0","platform":"test"},"tick_hz":20,"tree_hash":"fnv1a64:1","capabilities":{"reset":true}}}',
      '{"schema":"mbt.evt.v1","type":"bt_def","run_id":"run-file","unix_ms":2,"seq":2,"data":{"dsl":"(bt (seq (act one) (act two) (act three)))","nodes":[{"id":1,"kind":"seq","name":"root"},{"id":2,"kind":"act","name":"one"},{"id":3,"kind":"act","name":"two"},{"id":4,"kind":"act","name":"three"}],"edges":[{"parent":1,"child":2,"index":0},{"parent":1,"child":3,"index":1},{"parent":1,"child":4,"index":2}]}}',
      '{"schema":"mbt.evt.v1","type":"tick_begin","run_id":"run-file","unix_ms":3,"seq":3,"tick":1,"data":{}}',
      '{"schema":"mbt.evt.v1","type":"tick_end","run_id":"run-file","unix_ms":4,"seq":4,"tick":1,"data":{"root_status":"running","tick_ms":1.1}}',
      '{"schema":"mbt.evt.v1","type":"tick_begin","run_id":"run-file","unix_ms":5,"seq":5,"tick":2,"data":{}}',
      '{"schema":"mbt.evt.v1","type":"tick_end","run_id":"run-file","unix_ms":6,"seq":6,"tick":2,"data":{"root_status":"running","tick_ms":1.2}}',
      '{"schema":"mbt.evt.v1","type":"tick_begin","run_id":"run-file","unix_ms":7,"seq":7,"tick":3,"data":{}}',
      '{"schema":"mbt.evt.v1","type":"tick_end","run_id":"run-file","unix_ms":8,"seq":8,"tick":3,"data":{"root_status":"success","tick_ms":1.3}}',
    ].join('\n');
    const sidecar = buildTickSidecarIndex(jsonl, 'events.jsonl');

    const paddedJsonl = `${jsonl}\n${' \n'.repeat(1_100_000)}`;
    const jsonlFile = new File([paddedJsonl], 'events.jsonl', { type: 'application/x-ndjson' });
    const sidecarFile = new File([JSON.stringify(sidecar)], 'events.sidecar.tick-index.v1.json', {
      type: 'application/json',
    });
    const streamSpy = vi.spyOn(jsonlFile, 'stream');

    await useStudioStore.getState().loadJsonlFromFiles(jsonlFile, sidecarFile);
    const initial = useStudioStore.getState();
    expect(initial.replayLoadWarning).toContain('lazy loading');
    expect(initial.eventCount).toBe(4);
    expect(initial.replayMaxTick).toBe(3);
    expect(streamSpy).not.toHaveBeenCalled();

    useStudioStore.getState().setSelectedTick(3);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if ((useStudioStore.getState().replay?.getTick(3).length ?? 0) > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const afterHydration = useStudioStore.getState();
    expect(afterHydration.replay?.getTick(2).length).toBeGreaterThan(0);
    expect(afterHydration.replay?.getTick(3).length).toBeGreaterThan(0);
    expect(afterHydration.eventCount).toBe(8);
  });

  it('loads replay JSONL from URL sources for demo mode', async () => {
    resetStore();

    const jsonl = [
      '{"schema":"mbt.evt.v1","type":"run_start","run_id":"run-demo","unix_ms":1,"seq":1,"data":{"git_sha":"fixture","host":{"name":"studio","version":"0.1.0","platform":"test"},"tick_hz":20,"tree_hash":"fnv1a64:1","capabilities":{"reset":true}}}',
      '{"schema":"mbt.evt.v1","type":"bt_def","run_id":"run-demo","unix_ms":2,"seq":2,"data":{"dsl":"(bt (seq (act a)))","nodes":[{"id":1,"kind":"seq","name":"seq"},{"id":2,"kind":"act","name":"a"}],"edges":[{"parent":1,"child":2,"index":0}]}}',
      '{"schema":"mbt.evt.v1","type":"tick_begin","run_id":"run-demo","unix_ms":3,"seq":3,"tick":0,"data":{}}',
      '{"schema":"mbt.evt.v1","type":"tick_end","run_id":"run-demo","unix_ms":4,"seq":4,"tick":0,"data":{"root_status":"success","tick_ms":1.2}}',
    ].join('\n');
    const sidecar = buildTickSidecarIndex(jsonl, 'events.jsonl');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(jsonl, {
          status: 200,
          headers: {
            'content-length': String(new TextEncoder().encode(jsonl).byteLength),
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(sidecar), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await useStudioStore.getState().loadJsonlFromUrl('/demo/determinism/events.jsonl', '/demo/determinism/events.sidecar.tick-index.v1.json');

    const state = useStudioStore.getState();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state.eventCount).toBe(4);
    expect(state.replayIndexed).toBe(true);
    expect(state.replayLoadWarning).toBeNull();
    expect(state.replay?.runStart?.run_id).toBe('run-demo');
  });

  it('clears replay loading progress when demo URL load fails', async () => {
    resetStore();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not found', {
          status: 404,
          statusText: 'Not Found',
        }),
      ),
    );

    await expect(useStudioStore.getState().loadJsonlFromUrl('/demo/missing/events.jsonl')).rejects.toThrow(
      'failed to fetch replay log: 404 Not Found',
    );
    expect(useStudioStore.getState().replayLoadProgress).toBeNull();
  });

  it('applies and resets compiled bt overrides for tree sync', () => {
    resetStore();

    const replay = new ReplayStore();
    replay.append(
      parseEvent({
        schema: 'mbt.evt.v1',
        type: 'run_start',
        run_id: 'run-edit',
        unix_ms: 1,
        seq: 1,
        data: {
          git_sha: 'fixture',
          host: { name: 'studio', version: '0.1.0', platform: 'test' },
          tick_hz: 20,
          tree_hash: 'fnv1a64:1',
          capabilities: { reset: true },
        },
      }),
    );

    replay.append(
      parseEvent({
        schema: 'mbt.evt.v1',
        type: 'bt_def',
        run_id: 'run-edit',
        unix_ms: 2,
        seq: 2,
        data: {
          dsl: '(bt (seq (act original)))',
          nodes: [
            { id: 1, kind: 'seq', name: 'seq' },
            { id: 2, kind: 'act', name: 'original' },
          ],
          edges: [{ parent: 1, child: 2, index: 0 }],
        },
      }),
    );

    useStudioStore.setState({
      replay,
      selectedNodeId: replay.getFirstTreeNodeId(),
      treeRevision: 0,
    });

    const compiled = compileBtDsl('(bt (sel (act fallback) (act recover)))');
    useStudioStore.getState().applyCompiledTree(compiled);

    const appliedState = useStudioStore.getState();
    expect(appliedState.replay?.hasBtDefOverride).toBe(true);
    expect(appliedState.replay?.btDef?.data.dsl).toBe('(bt (sel (act fallback) (act recover)))');
    expect(appliedState.replay?.btDef?.data.nodes).toHaveLength(3);
    expect(appliedState.selectedNodeId).toBe('1');
    expect(appliedState.treeRevision).toBe(1);

    useStudioStore.getState().resetCompiledTree();

    const resetState = useStudioStore.getState();
    expect(resetState.replay?.hasBtDefOverride).toBe(false);
    expect(resetState.replay?.btDef?.data.dsl).toBe('(bt (seq (act original)))');
    expect(resetState.treeRevision).toBe(2);
  });
});
