import type { ReplayStore } from '@muesli/replay';

interface NodeInspectorProps {
  replay: ReplayStore;
  selectedNodeId: string | null;
  tick: number;
}

export function NodeInspector({ replay, selectedNodeId, tick }: NodeInspectorProps) {
  if (!selectedNodeId) {
    return (
      <div className="panel split-panel">
        <h2>node inspector</h2>
        <p className="muted">Select a node in the tree to inspect timeline history.</p>
      </div>
    );
  }

  const timeline = replay.getNodeTimeline(selectedNodeId);
  const current = replay.getNodeStatusAt(selectedNodeId, tick);

  return (
    <div className="panel split-panel">
      <h2>node inspector</h2>
      <p>
        <strong>{selectedNodeId}</strong> at tick {tick}: <code>{current?.status ?? 'unknown'}</code>
      </p>
      <div className="history-list">
        {timeline.length === 0 ? (
          <p className="muted">No node status events for this node.</p>
        ) : (
          <ul>
            {timeline.map((point) => (
              <li key={`${point.seq}-${point.tick}`}>
                tick {point.tick}: <code>{point.status}</code>
                {point.outcome ? ` (${point.outcome})` : ''}
                {point.message ? ` - ${point.message}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
