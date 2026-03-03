import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BlackboardDiff } from './components/BlackboardDiff';
import { decodeWebSocketData, parseLivePayload } from './live';
import { DslEditor } from './components/DslEditor';
import { NodeInspector } from './components/NodeInspector';
import { TreeView } from './components/TreeView';
import { parseDemoFixtureQuery } from './demo-fixture';
import { useStudioStore } from './store';

export function App() {
  const replay = useStudioStore((state) => state.replay);
  const eventCount = useStudioStore((state) => state.eventCount);
  const selectedTick = useStudioStore((state) => state.selectedTick);
  const selectedNodeId = useStudioStore((state) => state.selectedNodeId);
  const parseErrors = useStudioStore((state) => state.parseErrors);
  const replayLoadProgress = useStudioStore((state) => state.replayLoadProgress);
  const replayIndexed = useStudioStore((state) => state.replayIndexed);
  const replayLoadWarning = useStudioStore((state) => state.replayLoadWarning);
  const replaySourceBytes = useStudioStore((state) => state.replaySourceBytes);
  const replayMaxTick = useStudioStore((state) => state.replayMaxTick);
  const treeRevision = useStudioStore((state) => state.treeRevision);
  const mode = useStudioStore((state) => state.mode);
  const liveUrl = useStudioStore((state) => state.liveUrl);
  const liveStatus = useStudioStore((state) => state.liveStatus);
  const liveAutoFollow = useStudioStore((state) => state.liveAutoFollow);
  const liveReconnectEnabled = useStudioStore((state) => state.liveReconnectEnabled);
  const liveLastError = useStudioStore((state) => state.liveLastError);
  const liveLastEventUnixMs = useStudioStore((state) => state.liveLastEventUnixMs);
  const liveHistory = useStudioStore((state) => state.liveHistory);
  const loadJsonlFromFiles = useStudioStore((state) => state.loadJsonlFromFiles);
  const loadJsonlFromUrl = useStudioStore((state) => state.loadJsonlFromUrl);
  const appendLiveEvents = useStudioStore((state) => state.appendLiveEvents);
  const setSelectedTick = useStudioStore((state) => state.setSelectedTick);
  const setSelectedNodeId = useStudioStore((state) => state.setSelectedNodeId);
  const setLiveUrl = useStudioStore((state) => state.setLiveUrl);
  const setLiveStatus = useStudioStore((state) => state.setLiveStatus);
  const setLiveAutoFollow = useStudioStore((state) => state.setLiveAutoFollow);
  const setLiveReconnectEnabled = useStudioStore((state) => state.setLiveReconnectEnabled);
  const applyCompiledTree = useStudioStore((state) => state.applyCompiledTree);
  const resetCompiledTree = useStudioStore((state) => state.resetCompiledTree);
  const addLiveHistory = useStudioStore((state) => state.addLiveHistory);
  const clearLiveHistory = useStudioStore((state) => state.clearLiveHistory);
  const addParseError = useStudioStore((state) => state.addParseError);
  const [sidecarFile, setSidecarFile] = useState<File | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectEnabledRef = useRef(liveReconnectEnabled);
  const manualDisconnectRef = useRef(false);
  const demoLoadRef = useRef(false);

  const treeSummary = useMemo(() => {
    if (!replay?.btDef) {
      return null;
    }

    return {
      nodeCount: replay.btDef.data.nodes.length,
      edgeCount: replay.btDef.data.edges.length,
    };
  }, [replay, treeRevision]);

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await loadJsonlFromFiles(file, sidecarFile);
  };

  const onSidecarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSidecarFile(file);
  };

  useEffect(() => {
    reconnectEnabledRef.current = liveReconnectEnabled;
  }, [liveReconnectEnabled]);

  useEffect(() => {
    if (demoLoadRef.current || typeof window === 'undefined') {
      return;
    }

    demoLoadRef.current = true;
    const demoQuery = parseDemoFixtureQuery(window.location.search);
    if (!demoQuery) {
      return;
    }

    let cancelled = false;
    loadJsonlFromUrl(demoQuery.jsonlPath, demoQuery.sidecarPath).catch((error) => {
      if (cancelled) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      addParseError({
        line: 0,
        message: `demo load failed: ${message}`,
        raw: demoQuery.jsonlPath,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [addParseError, loadJsonlFromUrl]);

  const clearReconnectTimer = useCallback(() => {
    if (!reconnectTimerRef.current) {
      return;
    }

    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const disconnectLive = useCallback(() => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();

    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close(1000, 'manual disconnect');
      wsRef.current = null;
    }

    addLiveHistory({ level: 'info', message: 'Disconnected by user' });
    setLiveStatus('disconnected');
  }, [addLiveHistory, clearReconnectTimer, setLiveStatus]);

  const connectLive = useCallback((attempt = 0) => {
    if (!liveUrl.trim()) {
      setLiveStatus('error', 'WebSocket URL is empty');
      return;
    }

    if (attempt === 0) {
      manualDisconnectRef.current = false;
      clearReconnectTimer();
      addLiveHistory({ level: 'info', message: `Connecting to ${liveUrl.trim()}` });
    }

    const existing = wsRef.current;
    if (existing) {
      existing.onopen = null;
      existing.onmessage = null;
      existing.onerror = null;
      existing.onclose = null;
      existing.close(1000, 'reconnect');
      wsRef.current = null;
    }

    setLiveStatus('connecting');

    const ws = new WebSocket(liveUrl.trim());
    wsRef.current = ws;

    ws.onopen = () => {
      clearReconnectTimer();
      setLiveStatus('connected');
      addLiveHistory({ level: 'info', message: `Connected to ${liveUrl.trim()}` });
    };

    ws.onmessage = async (event) => {
      const payload = await decodeWebSocketData(event.data);
      const parsed = parseLivePayload(payload);

      if (parsed.events.length > 0) {
        appendLiveEvents(parsed.events);
      }

      for (const issue of parsed.issues) {
        addParseError({
          line: 0,
          message: `live payload: ${issue.message}`,
          raw: issue.raw,
        });
      }
    };

    ws.onerror = () => {
      setLiveStatus('error', 'WebSocket error');
      addLiveHistory({ level: 'error', message: 'WebSocket error' });
    };

    ws.onclose = (event) => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }

      if (event.code === 1000 || event.code === 1005) {
        setLiveStatus('disconnected');
        if (!manualDisconnectRef.current) {
          addLiveHistory({ level: 'warning', message: `Connection closed (${event.code})` });
        }
        return;
      }

      const reason = event.reason ? ` (${event.reason})` : '';
      const closeMessage = `connection closed: ${event.code}${reason}`;
      setLiveStatus('error', closeMessage);
      addLiveHistory({ level: 'warning', message: closeMessage });

      if (manualDisconnectRef.current || !reconnectEnabledRef.current) {
        return;
      }

      const nextAttempt = attempt + 1;
      const delayMs = Math.min(10_000, 500 * 2 ** Math.min(nextAttempt - 1, 6));
      addLiveHistory({ level: 'info', message: `Retry ${nextAttempt} in ${delayMs}ms` });

      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connectLive(nextAttempt);
      }, delayMs);
    };
  }, [addLiveHistory, addParseError, appendLiveEvents, clearReconnectTimer, liveUrl, setLiveStatus]);

  const connectLiveManual = useCallback(() => {
    connectLive(0);
  }, [connectLive]);

  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      if (ws) {
        ws.close(1000, 'component unmount');
        wsRef.current = null;
      }

      clearReconnectTimer();
    };
  }, [clearReconnectTimer]);

  return (
    <main className="app-shell">
      <header className="header">
        <div>
          <h1>muesli-studio</h1>
          <p className="muted">Replay + live monitoring over WebSocket, sharing one append-only replay engine.</p>
        </div>

        <div className="live-controls">
          <label className="file-input">
            <span>open JSONL</span>
            <input type="file" accept=".jsonl,application/json,text/plain" onChange={onFileChange} />
          </label>
          <label className="file-input">
            <span>open sidecar (optional)</span>
            <input type="file" accept=".json,application/json" onChange={onSidecarChange} />
          </label>
        </div>
      </header>

      {replayLoadProgress !== null ? (
        <section className="panel controls">
          <h2>replay loading</h2>
          <p className="muted">
            progress: <code>{replayLoadProgress}%</code>
          </p>
        </section>
      ) : null}

      {replayLoadWarning ? (
        <section className="panel error-panel">
          <h2>replay warning</h2>
          <p>{replayLoadWarning}</p>
        </section>
      ) : null}

      <section className="panel controls">
        <h2>live monitor</h2>
        <div className="live-controls">
          <label className="live-url">
            <span>endpoint</span>
            <input
              type="url"
              value={liveUrl}
              onChange={(event) => setLiveUrl(event.target.value)}
              placeholder="ws://localhost:8765/events"
            />
          </label>

          <button type="button" onClick={connectLiveManual} disabled={liveStatus === 'connecting' || liveStatus === 'connected'}>
            connect
          </button>
          <button type="button" onClick={disconnectLive} disabled={liveStatus === 'disconnected'}>
            disconnect
          </button>

          <label className="checkbox">
            <input type="checkbox" checked={liveAutoFollow} onChange={(event) => setLiveAutoFollow(event.target.checked)} />
            auto-follow
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={liveReconnectEnabled} onChange={(event) => setLiveReconnectEnabled(event.target.checked)} />
            auto-reconnect
          </label>
          <button type="button" onClick={clearLiveHistory}>
            clear history
          </button>
        </div>
        <p className="muted">
          status: <code>{liveStatus}</code>
          {liveLastError ? ` - ${liveLastError}` : ''}
          {liveLastEventUnixMs ? ` · last event ${new Date(liveLastEventUnixMs).toLocaleTimeString()}` : ''}
        </p>
        <div className="history-list compact">
          {liveHistory.length === 0 ? (
            <p className="muted">No connection history yet.</p>
          ) : (
            <ul>
              {liveHistory
                .slice(-8)
                .reverse()
                .map((entry) => (
                  <li key={`${entry.atUnixMs}:${entry.message}`}>
                    [{new Date(entry.atUnixMs).toLocaleTimeString()}] {entry.level}: {entry.message}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>

      {parseErrors.length > 0 ? (
        <section className="panel error-panel">
          <h2>ingest warnings</h2>
          <p>{parseErrors.length} item(s) were skipped due to parse or schema issues.</p>
          <ul>
            {parseErrors.slice(0, 5).map((error) => (
              <li key={`${error.line}:${error.message}`}>
                {error.line > 0 ? `line ${error.line}: ` : ''}
                {error.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {replay ? (
        <section className="panel controls">
          <div className="meta-row">
            <span>
              run: <code>{replay.runStart?.run_id ?? 'unknown'}</code>
            </span>
            <span>
              mode: <code>{mode}</code>
            </span>
            <span>
              index: <code>{replayIndexed ? 'indexed' : 'unindexed'}</code>
            </span>
            <span>
              source bytes: <code>{replaySourceBytes}</code>
            </span>
            <span>
              events: <code>{eventCount}</code>
            </span>
            <span>
              ticks: <code>{replayMaxTick >= 0 ? replayMaxTick + 1 : 0}</code>
            </span>
            {treeSummary ? (
              <span>
                tree: <code>{treeSummary.nodeCount}</code> nodes / <code>{treeSummary.edgeCount}</code> edges
              </span>
            ) : null}
          </div>

          <label className="tick-row" htmlFor="tick-scrubber">
            <span>tick {selectedTick}</span>
            <input
              id="tick-scrubber"
              type="range"
              min={0}
              max={Math.max(replayMaxTick, 0)}
              value={selectedTick}
              onChange={(evt) => {
                if (liveAutoFollow) {
                  setLiveAutoFollow(false);
                }
                setSelectedTick(Number(evt.target.value));
              }}
              disabled={replayMaxTick <= 0}
            />
          </label>
        </section>
      ) : null}

      <section className="content-grid">
        {replay ? (
          <>
            <TreeView replay={replay} selectedTick={selectedTick} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
            <NodeInspector replay={replay} selectedNodeId={selectedNodeId} tick={selectedTick} />
            <DslEditor replay={replay} onApplyCompiled={applyCompiledTree} onResetCompiled={resetCompiledTree} />
            <BlackboardDiff replay={replay} tick={selectedTick} />
          </>
        ) : (
          <div className="panel empty">Load a replay log to begin.</div>
        )}
      </section>
    </main>
  );
}
