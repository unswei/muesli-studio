import { describe, expect, it } from 'vitest';

import { parseEvent } from '@muesli/protocol';

import { useStudioStore } from './store';

function resetStore(): void {
  useStudioStore.setState({
    replay: null,
    eventCount: 0,
    selectedTick: 0,
    selectedNodeId: null,
    parseErrors: [],
    mode: 'replay',
    liveUrl: 'ws://localhost:8765/events',
    liveStatus: 'disconnected',
    liveAutoFollow: true,
    liveLastError: null,
  });
}

describe('studio live store behaviour', () => {
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
});
