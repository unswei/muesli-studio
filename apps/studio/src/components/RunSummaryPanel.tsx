import type { ReplayStore, RunSummary } from '@muesli/replay';

interface RunSummaryPanelProps {
  replay: ReplayStore;
  summary: RunSummary;
  eventCount: number;
}

interface SummarySignal {
  label: string;
  count: number;
}

const coreEventTypes = new Set([
  'run_start',
  'run_end',
  'episode_begin',
  'episode_end',
  'bt_def',
  'tick_begin',
  'tick_end',
  'node_enter',
  'node_exit',
  'node_status',
  'bb_write',
  'sched_submit',
  'sched_start',
  'sched_finish',
  'planner_call_start',
  'planner_call_end',
  'vla_submit',
  'vla_poll',
  'vla_result',
]);

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

function formatEventTypeLabel(type: string): string {
  return type.replaceAll('_', ' ');
}

function pluralise(label: string, count: number): string {
  return `${formatCount(count)} ${label}${count === 1 ? '' : 's'}`;
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
  const errorCount = summary.event_counts.error ?? 0;
  const eventFamilies = Object.entries(summary.event_counts).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  });
  const warningSignals: SummarySignal[] = [
    { label: 'budget warning', count: summary.warnings.budget_warning_count },
    { label: 'deadline exceeded', count: summary.warnings.deadline_exceeded_count },
    { label: 'error event', count: errorCount },
  ].filter((signal) => signal.count > 0);
  const unusualEventFamilies = eventFamilies.filter(([type, count]) => count > 0 && !coreEventTypes.has(type));
  const warningEventTotal = warningSignals.reduce((sum, signal) => sum + signal.count, 0);
  const unusualEventTotal = unusualEventFamilies.reduce((sum, [, count]) => sum + count, 0);
  const hasAttentionSignal = warningSignals.length > 0 || unusualEventFamilies.length > 0;
  const visibleUnusualFamilies = unusualEventFamilies.slice(0, 6);

  return (
    <section id="run-summary-panel" tabIndex={-1} className="panel detail-panel run-summary-panel keyboard-panel-target">
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
              hasAttentionSignal ? 'status-badge--history-warning' : 'status-badge--indexed'
            }`}
          >
            {hasAttentionSignal ? 'attention signals present' : 'routine footprint'}
          </span>
          <span className="status-badge status-badge--subtle">
            {warningEventTotal > 0 ? pluralise('warning signal', warningEventTotal) : 'no warning signals'}
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

      <section className="summary-section summary-section--full">
        <div className="summary-section-heading">
          <h3>attention before scrubbing</h3>
          <p className="panel-empty-copy muted">
            {hasAttentionSignal
              ? 'Warnings and non-routine event families are pulled forward here so the important parts of the run are visible immediately.'
              : 'No warnings or unusual event families were recorded in the loaded run.'}
          </p>
        </div>

        <div className="summary-alert-grid">
          <section className={warningSignals.length > 0 ? 'summary-alert-card summary-alert-card--warning' : 'summary-alert-card'}>
            <div className="summary-alert-heading">
              <h4>warning signals</h4>
              <span className={warningSignals.length > 0 ? 'status-badge status-badge--history-warning' : 'status-badge status-badge--indexed'}>
                {warningSignals.length > 0 ? pluralise('event', warningEventTotal) : 'none'}
              </span>
            </div>

            {warningSignals.length > 0 ? (
              <ul className="summary-chip-list" aria-label="warning signals">
                {warningSignals.map((signal) => (
                  <li key={signal.label} className="summary-chip summary-chip--warning">
                    <span>{signal.label}</span>
                    <strong>{formatCount(signal.count)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="panel-empty-copy muted">No budget, deadline, or error signals were recorded.</p>
            )}
          </section>

          <section className={unusualEventFamilies.length > 0 ? 'summary-alert-card summary-alert-card--notice' : 'summary-alert-card'}>
            <div className="summary-alert-heading">
              <h4>unusual event families</h4>
              <span className={unusualEventFamilies.length > 0 ? 'status-badge status-badge--history-warning' : 'status-badge status-badge--indexed'}>
                {unusualEventFamilies.length > 0 ? pluralise('family', unusualEventFamilies.length) : 'none'}
              </span>
            </div>

            {unusualEventFamilies.length > 0 ? (
              <>
                <ul className="summary-chip-list" aria-label="unusual event families">
                  {visibleUnusualFamilies.map(([type, count]) => (
                    <li key={type} className="summary-chip summary-chip--notice">
                      <span>{formatEventTypeLabel(type)}</span>
                      <strong>{formatCount(count)}</strong>
                    </li>
                  ))}
                </ul>
                <p className="panel-empty-copy muted">
                  {pluralise('event', unusualEventTotal)} across families outside the routine tick, node, planner, scheduler, and blackboard-write path.
                </p>
              </>
            ) : (
              <p className="panel-empty-copy muted">Only the routine tick, node, planner, scheduler, and blackboard-write families were recorded.</p>
            )}
          </section>
        </div>
      </section>

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
          <h3>full event footprint</h3>
          <p className="panel-empty-copy muted">Keeps the full event mix visible after the attention signals, so exhaustive counts stay available without hiding the long tail.</p>
        </div>
        <div className="event-family-grid">
          {eventFamilies.map(([type, count]) => (
            <div key={type} className="event-family-pill">
              <span>{formatEventTypeLabel(type)}</span>
              <strong>{formatCount(count)}</strong>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
