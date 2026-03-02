import { useMemo } from 'react';

import { BlackboardDiff } from './components/BlackboardDiff';
import { NodeInspector } from './components/NodeInspector';
import { TreeView } from './components/TreeView';
import { useStudioStore } from './store';

export function App() {
  const replay = useStudioStore((state) => state.replay);
  const selectedTick = useStudioStore((state) => state.selectedTick);
  const selectedNodeId = useStudioStore((state) => state.selectedNodeId);
  const parseErrors = useStudioStore((state) => state.parseErrors);
  const loadJsonl = useStudioStore((state) => state.loadJsonl);
  const setSelectedTick = useStudioStore((state) => state.setSelectedTick);
  const setSelectedNodeId = useStudioStore((state) => state.setSelectedNodeId);

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

  return (
    <main className="app-shell">
      <header className="header">
        <div>
          <h1>muesli-studio</h1>
          <p className="muted">P0 replay mode: JSONL load, tree status replay, tick scrub, blackboard diff.</p>
        </div>

        <label className="file-input">
          <span>open JSONL</span>
          <input type="file" accept=".jsonl,application/json,text/plain" onChange={onFileChange} />
        </label>
      </header>

      {parseErrors.length > 0 ? (
        <section className="panel error-panel">
          <h2>parse warnings</h2>
          <p>{parseErrors.length} line(s) were skipped due to parse or schema issues.</p>
          <ul>
            {parseErrors.slice(0, 5).map((error) => (
              <li key={`${error.line}:${error.message}`}>
                line {error.line}: {error.message}
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
              events: <code>{replay.getAllEvents().length}</code>
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
              onChange={(evt) => setSelectedTick(Number(evt.target.value))}
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
