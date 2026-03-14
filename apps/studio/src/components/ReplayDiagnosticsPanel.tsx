import type { ReplaySeekStats, ReplaySourceKind } from '../store';

interface ReplayDiagnosticsPanelProps {
  eventCount: number;
  selectedTick: number;
  replayIndexed: boolean;
  lazyActive: boolean;
  sourceKind: ReplaySourceKind;
  sourceBytes: number;
  loadedBytesEstimate: number;
  loadedTickCount: number;
  knownTickCount: number;
  highestTick: number;
  pendingTickCount: number;
  loadWarning: string | null;
  seekStats: ReplaySeekStats;
}

const ESTIMATED_EVENT_MEMORY_BYTES = 320;

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDurationMs(value: number | null): string {
  if (value === null) {
    return 'awaiting scrub';
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ms`;
}

function replayModeLabel(replayIndexed: boolean, lazyActive: boolean): string {
  if (lazyActive) {
    return 'lazy indexed';
  }

  if (replayIndexed) {
    return 'indexed';
  }

  return 'full scan';
}

function sourceLabel(sourceKind: ReplaySourceKind): string {
  if (sourceKind === 'file') {
    return 'local file';
  }

  if (sourceKind === 'url') {
    return 'URL fetch';
  }

  return 'in-memory text';
}

function seekModeLabel(value: ReplaySeekStats['last_mode']): string {
  if (value === 'hydrated') {
    return 'hydrated';
  }

  if (value === 'full-scan') {
    return 'full scan';
  }

  if (value === 'cached') {
    return 'cached';
  }

  return 'awaiting scrub';
}

export function ReplayDiagnosticsPanel({
  eventCount,
  selectedTick,
  replayIndexed,
  lazyActive,
  sourceKind,
  sourceBytes,
  loadedBytesEstimate,
  loadedTickCount,
  knownTickCount,
  highestTick,
  pendingTickCount,
  loadWarning,
  seekStats,
}: ReplayDiagnosticsPanelProps) {
  const replayMode = replayModeLabel(replayIndexed, lazyActive);
  const roughMemoryBytes = loadedBytesEstimate + eventCount * ESTIMATED_EVENT_MEMORY_BYTES;

  return (
    <section id="replay-diagnostics-panel" className="panel detail-panel replay-diagnostics-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">replay diagnostics</p>
          <h2>large logs</h2>
          <p className="panel-copy muted">Check replay mode, seek timing, and rough footprint before assuming a scrub issue is rendering-related.</p>
        </div>
        <div className="tree-summary-badges">
          <span className={`status-badge ${lazyActive ? 'status-badge--indexed' : 'status-badge--subtle'}`}>{replayMode}</span>
          <span className="status-badge status-badge--subtle">{sourceLabel(sourceKind)}</span>
        </div>
      </div>

      <div className="detail-summary-grid replay-diagnostics-summary">
        <div className="detail-stat">
          <span className="detail-label">selected tick</span>
          <strong>{selectedTick}</strong>
        </div>
        <div className="detail-stat">
          <span className="detail-label">loaded ticks</span>
          <strong>{loadedTickCount.toLocaleString()}</strong>
        </div>
        <div className="detail-stat">
          <span className="detail-label">pending ranges</span>
          <strong>{pendingTickCount.toLocaleString()}</strong>
        </div>
      </div>

      <div className="summary-section-grid">
        <section className="summary-section">
          <h3>seek latency</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>last seek</dt>
              <dd>{formatDurationMs(seekStats.last_duration_ms)}</dd>
            </div>
            <div>
              <dt>mean seek</dt>
              <dd>{formatDurationMs(seekStats.mean_duration_ms)}</dd>
            </div>
            <div>
              <dt>max seek</dt>
              <dd>{formatDurationMs(seekStats.max_duration_ms)}</dd>
            </div>
          </dl>
        </section>

        <section className="summary-section">
          <h3>seek history</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>samples</dt>
              <dd>{seekStats.count.toLocaleString()}</dd>
            </div>
            <div>
              <dt>last mode</dt>
              <dd>{seekModeLabel(seekStats.last_mode)}</dd>
            </div>
            <div>
              <dt>ticks hydrated</dt>
              <dd>{seekStats.last_hydrated_ticks.toLocaleString()}</dd>
            </div>
          </dl>
        </section>

        <section className="summary-section">
          <h3>footprint</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>source size</dt>
              <dd>{formatBytes(sourceBytes)}</dd>
            </div>
            <div>
              <dt>loaded byte estimate</dt>
              <dd>{formatBytes(loadedBytesEstimate)}</dd>
            </div>
            <div>
              <dt>rough memory use</dt>
              <dd>{formatBytes(roughMemoryBytes)}</dd>
            </div>
          </dl>
        </section>

        <section className="summary-section">
          <h3>range state</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>known ticks</dt>
              <dd>{knownTickCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>highest tick</dt>
              <dd>{highestTick.toLocaleString()}</dd>
            </div>
            <div>
              <dt>strategy</dt>
              <dd>{replayMode}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="summary-section summary-section--full">
        <div className="summary-section-heading">
          <h3>notes</h3>
          <p className="panel-empty-copy muted">
            Rough memory is heuristic only: loaded replay bytes plus a fixed per-event allowance. It is not a browser heap reading.
          </p>
        </div>
        {loadWarning ? <p className="diagnostics-note diagnostics-note--warning">{loadWarning}</p> : null}
      </section>
    </section>
  );
}
