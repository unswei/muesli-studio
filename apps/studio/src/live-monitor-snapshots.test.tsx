// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { App } from './App';
import { useStudioStore } from './store';

function resetStoreState(): void {
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
    replaySourceKind: 'text',
    replayLoadedBytesEstimate: 0,
    replaySeekStats: {
      count: 0,
      last_duration_ms: null,
      mean_duration_ms: null,
      max_duration_ms: null,
      last_tick: null,
      last_mode: null,
      last_hydrated_ticks: 0,
    },
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

describe('live monitor snapshots', () => {
  let rendered: Array<{ root: Root; container: HTMLDivElement }> = [];

  beforeEach(() => {
    resetStoreState();
    rendered = [];
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(Date.prototype, 'toLocaleTimeString').mockImplementation(function toLocaleTimeStringMock(this: Date) {
      return `t${this.getTime()}`;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const view of rendered) {
      act(() => {
        view.root.unmount();
      });
      view.container.remove();
    }
    rendered = [];
  });

  function renderAppMarkup(): string {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    rendered.push({ root, container });

    act(() => {
      root.render(<App />);
    });

    return container.innerHTML;
  }

  it('renders disconnected live monitor state with empty history', () => {
    const markup = renderAppMarkup();
    expect(markup).toMatchSnapshot();
  });

  it('renders error live monitor state with history entries and last event time', () => {
    useStudioStore.setState({
      liveStatus: 'error',
      liveLastError: 'connection closed: 1006',
      liveLastEventUnixMs: 1_710_000_000_000,
      liveHistory: [
        { atUnixMs: 1_700_000_000_000, level: 'warning', message: 'Retry 1 in 500ms' },
        { atUnixMs: 1_700_000_000_500, level: 'error', message: 'WebSocket error' },
      ],
    });

    const markup = renderAppMarkup();
    expect(markup).toMatchSnapshot();
  });
});
