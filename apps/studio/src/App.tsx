import { useCallback, useEffect, useMemo, useRef } from 'react';

import { BlackboardDiff } from './components/BlackboardDiff';
import { decodeWebSocketData, parseLivePayload } from './live';
import { NodeInspector } from './components/NodeInspector';
import { TreeView } from './components/TreeView';
import { useStudioStore } from './store';

export function App() {
  const replay = useStudioStore((state) => state.replay);
  const eventCount = useStudioStore((state) => state.eventCount);
  const selectedTick = useStudioStore((state) => state.selectedTick);
  const selectedNodeId = useStudioStore((state) => state.selectedNodeId);
  const parseErrors = useStudioStore((state) => state.parseErrors);
  const mode = useStudioStore((state) => state.mode);
  const liveUrl = useStudioStore((state) => state.liveUrl);
  const liveStatus = useStudioStore((state) => state.liveStatus);
  const liveAutoFollow = useStudioStore((state) => state.liveAutoFollow);
  const liveLastError = useStudioStore((state) => state.liveLastError);
  const loadJsonl = useStudioStore((state) => state.loadJsonl);
  const appendLiveEvents = useStudioStore((state) => state.appendLiveEvents);
  const setSelectedTick = useStudioStore((state) => state.setSelectedTick);
  const setSelectedNodeId = useStudioStore((state) => state.setSelectedNodeId);
  const setLiveUrl = useStudioStore((state) => state.setLiveUrl);
  const setLiveStatus = useStudioStore((state) => state.setLiveStatus);
  const setLiveAutoFollow = useStudioStore((state) => state.setLiveAutoFollow);
  const addParseError = useStudioStore((state) => state.addParseError);

  const wsRef = useRef<WebSocket | null>(null);

  const treeSummary = useMemo(() => {
    if (!replay?.btDef) {
      return null;
    }

    return {
      nodeCount: replay.btDef.data.nodes.length,
      edgeCount: replay.btDef.data.edges.length,
    };
  }, [replay]);

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    loadJsonl(text);
  };

  const disconnectLive = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close(1000, 'manual disconnect');
      wsRef.current = null;
    }

    setLiveStatus('disconnected');
  }, [setLiveStatus]);

  const connectLive = useCallback(() => {
    if (!liveUrl.trim()) {
      setLiveStatus('error', 'WebSocket URL is empty');
      return;
    }

    if (wsRef.current) {
      disconnectLive();
    }

    setLiveStatus('connecting');

    const ws = new WebSocket(liveUrl.trim());
    wsRef.current = ws;

    ws.onopen = () => {
      setLiveStatus('connected');
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
    };

    ws.onclose = (event) => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }

      if (event.code === 1000 || event.code === 1005) {
        setLiveStatus('disconnected');
        return;
      }

      const reason = event.reason ? ` (${event.reason})` : '';
      setLiveStatus('error', `connection closed: ${event.code}${reason}`);
    };
  }, [addParseError, appendLiveEvents, disconnectLive, liveUrl, setLiveStatus]);

  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      if (ws) {
        ws.close(1000, 'component unmount');
        wsRef.current = null;
      }
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="header">
        <div>
          <h1>muesli-studio</h1>
          <p className="muted">P1: replay + live monitoring over WebSocket, sharing one append-only replay engine.</p>
        </div>

        <label className="file-input">
          <span>open JSONL</span>
          <input type="file" accept=".jsonl,application/json,text/plain" onChange={onFileChange} />
        </label>
      </header>

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

          <button type="button" onClick={connectLive} disabled={liveStatus === 'connecting' || liveStatus === 'connected'}>
            connect
          </button>
          <button type="button" onClick={disconnectLive} disabled={liveStatus === 'disconnected'}>
            disconnect
          </button>

          <label className="checkbox">
            <input type="checkbox" checked={liveAutoFollow} onChange={(event) => setLiveAutoFollow(event.target.checked)} />
            auto-follow
          </label>
        </div>
        <p className="muted">
          status: <code>{liveStatus}</code>
          {liveLastError ? ` - ${liveLastError}` : ''}
        </p>
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
              events: <code>{eventCount}</code>
            </span>
            <span>
              ticks: <code>{replay.maxTick >= 0 ? replay.maxTick + 1 : 0}</code>
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
              max={Math.max(replay.maxTick, 0)}
              value={selectedTick}
              onChange={(evt) => {
                if (liveAutoFollow) {
                  setLiveAutoFollow(false);
                }
                setSelectedTick(Number(evt.target.value));
              }}
              disabled={replay.maxTick <= 0}
            />
          </label>
        </section>
      ) : null}

      <section className="content-grid">
        {replay ? (
          <>
            <TreeView replay={replay} selectedTick={selectedTick} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
            <NodeInspector replay={replay} selectedNodeId={selectedNodeId} tick={selectedTick} />
            <BlackboardDiff replay={replay} tick={selectedTick} />
          </>
        ) : (
          <div className="panel empty">Load a replay log to begin.</div>
        )}
      </section>
    </main>
  );
}
