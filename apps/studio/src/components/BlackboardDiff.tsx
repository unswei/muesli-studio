import type { ReplayStore } from '@muesli/replay';

interface BlackboardDiffProps {
  replay: ReplayStore;
  tick: number;
}

export function BlackboardDiff({ replay, tick }: BlackboardDiffProps) {
  const diff = replay.getBlackboardDiff(tick);

  return (
    <div id="blackboard-diff" className="panel split-panel detail-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">selected tick</p>
          <h2>blackboard diff</h2>
          <p className="panel-copy muted">Inspect writes and deletes recorded at the current tick in a stable key order.</p>
        </div>
        <span className="status-badge status-badge--subtle">tick {tick}</span>
      </div>

      <div className="detail-summary-grid">
        <div className="detail-stat">
          <span className="detail-label">writes</span>
          <strong>{diff.writes.length}</strong>
        </div>
        <div className="detail-stat">
          <span className="detail-label">deletes</span>
          <strong>{diff.deletes.length}</strong>
        </div>
        <div className="detail-stat">
          <span className="detail-label">key order</span>
          <strong>stable</strong>
        </div>
      </div>

      <div className="split-grid diff-grid">
        <div className="diff-column">
          <h3>writes</h3>
          {diff.writes.length === 0 ? (
            <p className="panel-empty-copy muted">No writes were recorded at this tick.</p>
          ) : (
            <ul className="detail-list">
              {diff.writes.map((entry) => (
                <li key={entry.key} className="detail-list-item">
                  <div className="detail-list-row">
                    <code>{entry.key}</code>
                    <code>{entry.digest}</code>
                  </div>
                  {entry.preview ? <span className="detail-list-secondary">{entry.preview}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="diff-column">
          <h3>deletes</h3>
          {diff.deletes.length === 0 ? (
            <p className="panel-empty-copy muted">No deletes were recorded at this tick.</p>
          ) : (
            <ul className="detail-list">
              {diff.deletes.map((key) => (
                <li key={key} className="detail-list-item">
                  <code>{key}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
