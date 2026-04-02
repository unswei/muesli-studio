// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { useStudioStore } from './store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');
const studioDemoEvents = readFileSync(path.join(rootDir, 'tests', 'fixtures', 'studio_demo', 'events.jsonl'), 'utf8');
const studioDemoSidecar = readFileSync(
  path.join(rootDir, 'tests', 'fixtures', 'studio_demo', 'events.sidecar.tick-index.v1.json'),
  'utf8',
);

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

async function waitForExpectation(assertion: () => void, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now();

  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw error;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
    }
  }
}

describe('App replay deep links', () => {
  let rendered: Array<{ root: Root; container: HTMLDivElement }> = [];

  beforeEach(() => {
    resetStoreState();
    rendered = [];
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState({}, '', '/');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url === '/runs/studio_demo/events.jsonl') {
          return new Response(studioDemoEvents, {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' },
          });
        }

        if (url === '/runs/studio_demo/events.sidecar.tick-index.v1.json') {
          return new Response(studioDemoSidecar, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response('not found', { status: 404, statusText: 'Not Found' });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const view of rendered) {
      act(() => {
        view.root.unmount();
      });
      view.container.remove();
    }
    rendered = [];
  });

  async function renderApp(): Promise<HTMLDivElement> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    rendered.push({ root, container });

    await act(async () => {
      root.render(<App />);
    });

    return container;
  }

  it('loads a URL-backed replay and restores tick, node, and view state', async () => {
    window.history.replaceState(
      {},
      '',
      '/?replay_url=%2Fruns%2Fstudio_demo%2Fevents.jsonl&replay_sidecar=%2Fruns%2Fstudio_demo%2Fevents.sidecar.tick-index.v1.json&tick=3&node=4&view=summary',
    );

    const container = await renderApp();

    await waitForExpectation(() => {
      expect(useStudioStore.getState().replay?.runStart?.run_id).toBe('fixture-studio-demo');
    });

    expect(useStudioStore.getState().selectedTick).toBe(3);
    expect(useStudioStore.getState().selectedNodeId).toBe('4');
    expect(container.querySelector('#run-summary-panel')).not.toBeNull();
  });

  it('keeps the browser URL in sync with sharable replay state', async () => {
    window.history.replaceState(
      {},
      '',
      '/?replay_url=%2Fruns%2Fstudio_demo%2Fevents.jsonl&replay_sidecar=%2Fruns%2Fstudio_demo%2Fevents.sidecar.tick-index.v1.json&tick=2&node=4&view=overview',
    );

    await renderApp();

    await waitForExpectation(() => {
      expect(useStudioStore.getState().replay?.runStart?.run_id).toBe('fixture-studio-demo');
    });

    act(() => {
      useStudioStore.getState().setSelectedTick(4);
      useStudioStore.getState().setSelectedNodeId('5');
    });

    await waitForExpectation(() => {
      expect(window.location.search).toContain('tick=4');
    });

    expect(window.location.search).toContain('node=5');
    expect(window.location.search).toContain('view=overview');
    expect(window.location.search).toContain('replay_url=%2Fruns%2Fstudio_demo%2Fevents.jsonl');
  });
});
