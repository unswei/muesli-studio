import type { ReplayStore, RunSummary } from '@muesli/replay';

interface RunSummaryPanelProps {
  replay: ReplayStore;
  summary: RunSummary;
  eventCount: number;
}

function stringFromUnknown(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatDurationMs(value: number | null): string {
  if (value === null) {
    return 'unavailable';
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ms`;
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function backendLabel(runStartData: Record<string, unknown> | undefined): string {
  const backend = stringFromUnknown(runStartData?.backend);
  if (backend) {
    return backend;
  }

  const host = runStartData?.host;
  if (host && typeof host === 'object') {
    const hostName = stringFromUnknown((host as Record<string, unknown>).name);
    if (hostName) {
      return hostName;
    }
  }

  return stringFromUnknown(host) ?? 'unknown';
}

export function RunSummaryPanel({ replay, summary, eventCount }: RunSummaryPanelProps) {
  const runStartData = replay.runStart?.data as Record<string, unknown> | undefined;
  const btDefData = replay.btDef?.data as Record<string, unknown> | undefined;

  const backend = backendLabel(runStartData);
  const treeName = stringFromUnknown(btDefData?.tree_name) ?? 'behaviour tree';
  const treeHash = stringFromUnknown(btDefData?.tree_hash) ?? stringFromUnknown(runStartData?.tree_hash) ?? 'unavailable';
  const runId = replay.runStart?.run_id ?? 'unknown';
  const plannerCallCount = summary.event_counts.planner_call_start ?? summary.event_counts.planner_call_end ?? 0;
  const asyncCancelCount =
    (summary.event_counts.async_cancel_requested ?? 0) +
    (summary.event_counts.async_cancel_acknowledged ?? 0) +
    summary.async_jobs.sched.cancel +
    summary.async_jobs.vla.cancel;
  const eventFamilies = Object.entries(summary.event_counts).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  });

  return (
    <section id="run-summary-panel" className="panel detail-panel run-summary-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">run</p>
          <h2>summary</h2>
          <p className="panel-copy muted">Check identity, timing, warnings, and event footprint before scrubbing into individual ticks and node histories.</p>
        </div>

        <div className="tree-summary-badges">
          <span className="status-badge status-badge--subtle">{backend}</span>
          <span
            className={`status-badge ${
              summary.warnings.budget_warning_count > 0 || summary.warnings.deadline_exceeded_count > 0
                ? 'status-badge--history-warning'
                : 'status-badge--indexed'
            }`}
          >
            {summary.warnings.budget_warning_count > 0 || summary.warnings.deadline_exceeded_count > 0 ? 'run warnings' : 'no run warnings'}
          </span>
        </div>
      </div>

      <div className="detail-summary-grid run-summary-grid">
        <div className="detail-stat">
          <span className="detail-label">run id</span>
          <strong>{runId}</strong>
        </div>
        <div className="detail-stat">
          <span className="detail-label">schema</span>
          <code>{summary.schema_version}</code>
        </div>
        <div className="detail-stat">
          <span className="detail-label">contract</span>
          <code>{summary.contract_version}</code>
        </div>
      </div>

      <div className="summary-section-grid">
        <section className="summary-section">
          <h3>identity</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>tree</dt>
              <dd>{treeName}</dd>
            </div>
            <div>
              <dt>tree hash</dt>
              <dd>
                <code>{treeHash}</code>
              </dd>
            </div>
            <div>
              <dt>digest</dt>
              <dd>
                <code>{summary.digest}</code>
              </dd>
            </div>
          </dl>
        </section>

        <section className="summary-section">
          <h3>counts</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>events</dt>
              <dd>{formatCount(eventCount)}</dd>
            </div>
            <div>
              <dt>ticks</dt>
              <dd>{formatCount(summary.ticks.count)}</dd>
            </div>
            <div>
              <dt>event families</dt>
              <dd>{formatCount(eventFamilies.length)}</dd>
            </div>
          </dl>
        </section>

        <section className="summary-section">
          <h3>timing</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>mean tick time</dt>
              <dd>{formatDurationMs(summary.ticks.mean_duration_ms)}</dd>
            </div>
            <div>
              <dt>max tick time</dt>
              <dd>{formatDurationMs(summary.ticks.max_duration_ms)}</dd>
            </div>
            <div>
              <dt>min tick time</dt>
              <dd>{formatDurationMs(summary.ticks.min_duration_ms)}</dd>
            </div>
          </dl>
        </section>

        <section className="summary-section">
          <h3>planner and scheduler</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>planner calls</dt>
              <dd>{formatCount(plannerCallCount)}</dd>
            </div>
            <div>
              <dt>scheduler jobs</dt>
              <dd>{formatCount(summary.async_jobs.sched.submit)}</dd>
            </div>
            <div>
              <dt>async cancels</dt>
              <dd>{formatCount(asyncCancelCount)}</dd>
            </div>
          </dl>
        </section>

        <section className="summary-section">
          <h3>warnings</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>budget warnings</dt>
              <dd>{formatCount(summary.warnings.budget_warning_count)}</dd>
            </div>
            <div>
              <dt>deadline exceeded</dt>
              <dd>{formatCount(summary.warnings.deadline_exceeded_count)}</dd>
            </div>
            <div>
              <dt>node statuses</dt>
              <dd>
                running {formatCount(summary.node_status_counts.running ?? 0)} / success {formatCount(summary.node_status_counts.success ?? 0)}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="summary-section summary-section--full">
        <div className="summary-section-heading">
          <h3>event families</h3>
          <p className="panel-empty-copy muted">Keeps the overall run footprint visible while you inspect the replay or prepare a screenshot.</p>
        </div>
        <div className="event-family-grid">
          {eventFamilies.map(([type, count]) => (
            <div key={type} className="event-family-pill">
              <span>{type.replaceAll('_', ' ')}</span>
              <strong>{formatCount(count)}</strong>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
