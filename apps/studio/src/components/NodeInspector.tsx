import type { ReplayStore } from '@muesli/replay';

interface NodeInspectorProps {
  replay: ReplayStore;
  selectedNodeId: string | null;
  tick: number;
}

export function NodeInspector({ replay, selectedNodeId, tick }: NodeInspectorProps) {
  if (!selectedNodeId) {
    return (
      <div id="node-inspector-panel" className="panel split-panel detail-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">inspect</p>
            <h2>node</h2>
          </div>
        </div>
        <p className="panel-copy muted">Select a node in the tree to inspect status history and behaviour over time.</p>
      </div>
    );
  }

  const timeline = replay.getNodeTimeline(selectedNodeId);
  const current = replay.getNodeStatusAt(selectedNodeId, tick);

  return (
    <div id="node-inspector-panel" className="panel split-panel detail-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">inspect</p>
          <h2>node</h2>
        </div>
        <span className="status-badge status-badge--subtle">node {selectedNodeId}</span>
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
          <p className="panel-empty-copy muted">No node status events for this node.</p>
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
