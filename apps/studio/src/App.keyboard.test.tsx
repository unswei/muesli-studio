// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseJsonlEvents, ReplayStore } from '@muesli/replay';

import { App } from './App';
import { useStudioStore } from './store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

function loadStudioDemoReplay(): ReplayStore {
  const raw = readFileSync(path.join(rootDir, 'tests', 'fixtures', 'studio_demo', 'events.jsonl'), 'utf8');
  const parsed = parseJsonlEvents(raw);
  expect(parsed.errors).toHaveLength(0);

  const replay = new ReplayStore();
  replay.appendMany(parsed.events);
  return replay;
}

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
    replaySourceUrl: null,
    replaySidecarUrl: null,
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

describe('App keyboard controls', () => {
  let rendered: Array<{ root: Root; container: HTMLDivElement }> = [];

  beforeEach(() => {
    resetStoreState();
    rendered = [];
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    const replay = loadStudioDemoReplay();
    useStudioStore.setState({
      replay,
      eventCount: replay.getAllEvents().length,
      selectedTick: 2,
      selectedNodeId: '4',
      replayIndexed: true,
      replaySourceKind: 'text',
      replayMaxTick: replay.maxTick,
      mode: 'replay',
    });
  });

  afterEach(() => {
    for (const view of rendered) {
      act(() => {
        view.root.unmount();
      });
      view.container.remove();
    }
    rendered = [];
  });

  async function renderApp(): Promise<void> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    rendered.push({ root, container });

    await act(async () => {
      root.render(<App />);
    });
  }

  it('supports keyboard tick navigation, search focus, and panel switching', async () => {
    await renderApp();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(useStudioStore.getState().selectedTick).toBe(3);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
    });
    expect(useStudioStore.getState().selectedTick).toBe(0);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(useStudioStore.getState().selectedTick).toBe(4);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    });
    expect((document.activeElement as HTMLElement | null)?.id).toBe('event-search-input');

    act(() => {
      (document.activeElement as HTMLInputElement | null)?.blur();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }));
    });
    expect((document.activeElement as HTMLElement | null)?.id).toBe('run-summary-panel');
  });
});
