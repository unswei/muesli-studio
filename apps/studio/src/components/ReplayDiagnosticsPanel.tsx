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
  loadedCoveragePercent: number;
  highestTick: number;
  pendingTickCount: number;
  loadWarning: string | null;
  seekStats: ReplaySeekStats;
  onHydrateWindow: (() => void) | null;
  onHydrateAll: (() => void) | null;
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
    return 'on-demand loading';
  }

  if (replayIndexed) {
    return 'quick access';
  }

  return 'standard loading';
}

function sourceLabel(sourceKind: ReplaySourceKind): string {
  if (sourceKind === 'file') {
    return 'local file';
  }

  if (sourceKind === 'url') {
    return 'web link';
  }

  return 'pasted text';
}

function seekModeLabel(value: ReplaySeekStats['last_mode']): string {
  if (value === 'hydrated') {
    return 'loaded now';
  }

  if (value === 'full-scan') {
    return 'standard loading';
  }

  if (value === 'cached') {
    return 'already loaded';
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
  loadedCoveragePercent,
  highestTick,
  pendingTickCount,
  loadWarning,
  seekStats,
  onHydrateWindow,
  onHydrateAll,
}: ReplayDiagnosticsPanelProps) {
  const replayMode = replayModeLabel(replayIndexed, lazyActive);
  const roughMemoryBytes = loadedBytesEstimate + eventCount * ESTIMATED_EVENT_MEMORY_BYTES;
  const canHydrateMore = lazyActive && loadedTickCount < knownTickCount;

  return (
    <section id="replay-diagnostics-panel" tabIndex={-1} className="panel detail-panel replay-diagnostics-panel keyboard-panel-target">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">replay diagnostics</p>
          <h2>large logs</h2>
          <p className="panel-copy muted">Check loading mode, scrub timing, and rough footprint if a large run feels slow.</p>
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
              <dt>ticks loaded now</dt>
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
          <h3>coverage</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>coverage</dt>
              <dd>{loadedCoveragePercent.toFixed(0)}%</dd>
            </div>
            <div>
              <dt>loaded ticks</dt>
              <dd>
                {loadedTickCount.toLocaleString()} / {knownTickCount.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>pending work</dt>
              <dd>{pendingTickCount > 0 ? `${pendingTickCount.toLocaleString()} ticks queued` : 'idle'}</dd>
            </div>
          </dl>
          {lazyActive ? (
            <>
              <div className="progress-track" aria-hidden="true">
                <div className="progress-fill" style={{ width: `${loadedCoveragePercent}%` }} />
              </div>
              <div className="button-row diagnostics-actions">
                <button type="button" className="button-ghost" onClick={onHydrateWindow ?? undefined} disabled={!canHydrateMore || pendingTickCount > 0}>
                  load nearby
                </button>
                <button type="button" className="button-primary" onClick={onHydrateAll ?? undefined} disabled={!canHydrateMore || pendingTickCount > 0}>
                  load all
                </button>
              </div>
            </>
          ) : null}
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
          <p className="panel-empty-copy muted">Rough memory is only an estimate. It helps compare loading modes, not measure exact browser memory use.</p>
        </div>
        {lazyActive ? (
          <p className="panel-empty-copy muted">
            Large runs can load nearby parts first. Use `load nearby` or `load all` if you want more of the run ready before scrubbing.
          </p>
        ) : null}
        {loadWarning ? <p className="diagnostics-note diagnostics-note--warning">{loadWarning}</p> : null}
      </section>
    </section>
  );
}
