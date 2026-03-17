import type { ReplayStore } from '@muesli/replay';

interface NodeInspectorProps {
  replay: ReplayStore;
  selectedNodeId: string | null;
  tick: number;
}

function nodeLabelFromReplay(replay: ReplayStore, nodeId: string): string {
  const rawNodes = replay.btDef?.data.nodes;
  if (!Array.isArray(rawNodes)) {
    return `node ${nodeId}`;
  }

  for (const rawNode of rawNodes) {
    if (!rawNode || typeof rawNode !== 'object') {
      continue;
    }

    const record = rawNode as Record<string, unknown>;
    const candidate = record.id;
    if ((typeof candidate === 'string' || typeof candidate === 'number') && String(candidate) === nodeId) {
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      return name.length > 0 ? `${name} · node ${nodeId}` : `node ${nodeId}`;
    }
  }

  return `node ${nodeId}`;
}

export function NodeInspector({ replay, selectedNodeId, tick }: NodeInspectorProps) {
  if (!selectedNodeId) {
    return (
      <div id="node-inspector-panel" className="panel split-panel detail-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">selected node</p>
            <h2>history</h2>
            <p className="panel-copy muted">Select a node in the tree to review its status changes, outcomes, and messages over time.</p>
          </div>
        </div>
      </div>
    );
  }

  const timeline = replay.getNodeTimeline(selectedNodeId);
  const current = replay.getNodeStatusAt(selectedNodeId, tick);
  const nodeLabel = nodeLabelFromReplay(replay, selectedNodeId);

  return (
    <div id="node-inspector-panel" className="panel split-panel detail-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">selected node</p>
          <h2>history</h2>
          <p className="panel-copy muted">Review the current status and recent node messages without leaving the selected tick.</p>
        </div>
        <span className="status-badge status-badge--subtle">{nodeLabel}</span>
      </div>

      <div className="detail-summary-grid">
        <div className="detail-stat">
          <span className="detail-label">selected tick</span>
          <strong>{tick}</strong>
        </div>
        <div className="detail-stat">
          <span className="detail-label">current status</span>
          <code>{current?.status ?? 'unknown'}</code>
        </div>
        <div className="detail-stat">
          <span className="detail-label">timeline entries</span>
          <strong>{timeline.length}</strong>
        </div>
      </div>

      <div className="history-list">
        {timeline.length === 0 ? (
          <p className="panel-empty-copy muted">No node status events were recorded for this node.</p>
        ) : (
          <ul className="detail-list">
            {timeline.map((point) => (
              <li key={`${point.seq}-${point.tick}`} className="detail-list-item">
                <div className="detail-list-row">
                  <span className="detail-list-primary">tick {point.tick}</span>
                  <code>{point.status}</code>
                </div>
                {point.outcome ? <span className="detail-list-secondary">outcome: {point.outcome}</span> : null}
                {point.message ? <span className="detail-list-secondary">{point.message}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
