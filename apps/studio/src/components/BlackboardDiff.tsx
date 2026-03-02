import type { ReplayStore } from '@muesli/replay';

interface BlackboardDiffProps {
  replay: ReplayStore;
  tick: number;
}

export function BlackboardDiff({ replay, tick }: BlackboardDiffProps) {
  const diff = replay.getBlackboardDiff(tick);

  return (
    <div className="panel split-panel">
      <h2>blackboard diff @ tick {tick}</h2>
      <div className="split-grid">
        <div>
          <h3>writes</h3>
          {diff.writes.length === 0 ? (
            <p className="muted">No writes at this tick.</p>
          ) : (
            <ul>
              {diff.writes.map((entry) => (
                <li key={entry.key}>
                  <code>{entry.key}</code> = <code>{entry.digest}</code>
                  {entry.preview ? ` (${entry.preview})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3>deletes</h3>
          {diff.deletes.length === 0 ? (
            <p className="muted">No deletes at this tick.</p>
          ) : (
            <ul>
              {diff.deletes.map((key) => (
                <li key={key}>
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
