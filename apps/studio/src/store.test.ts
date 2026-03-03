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
    treeRevision: 0,
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
    useStudioStore.getState().loadJsonl(jsonl, JSON.stringify(sidecar), 10 * 1024 * 1024);

    const state = useStudioStore.getState();
    expect(state.replayIndexed).toBe(true);
    expect(state.replayLoadWarning).toBeNull();
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
