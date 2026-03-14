import type { ReplayStore, RunSummary } from '@muesli/replay';

import { TreeView } from './TreeView';

interface HeroCaptureProps {
  replay: ReplayStore;
  summary: RunSummary;
  selectedTick: number;
  selectedNodeId: string | null;
  maxTick: number;
  tickCount: number;
  replayIndexed: boolean;
  onSelectNode: (nodeId: string) => void;
  onSelectTick: (tick: number) => void;
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

function nodeNameFromReplay(replay: ReplayStore, nodeId: string | null): string {
  if (!nodeId) {
    return 'tree focus';
  }

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
      return stringFromUnknown(record.name) ?? `node ${nodeId}`;
    }
  }

  return `node ${nodeId}`;
}

export function HeroCapture({
  replay,
  summary,
  selectedTick,
  selectedNodeId,
  maxTick,
  tickCount,
  replayIndexed,
  onSelectNode,
  onSelectTick,
}: HeroCaptureProps) {
  const runStartData = replay.runStart?.data as Record<string, unknown> | undefined;
  const btDefData = replay.btDef?.data as Record<string, unknown> | undefined;
  const backend = backendLabel(runStartData);
  const treeName = stringFromUnknown(btDefData?.tree_name) ?? 'behaviour tree';
  const runId = replay.runStart?.run_id ?? 'unknown';
  const plannerCalls = summary.event_counts.planner_call_start ?? summary.event_counts.planner_call_end ?? 0;
  const selectedNodeName = nodeNameFromReplay(replay, selectedNodeId);
  const selectedNodeStatus = selectedNodeId ? replay.getNodeStatusAt(selectedNodeId, selectedTick) : undefined;
  const selectedNodeTimeline = selectedNodeId ? replay.getNodeTimeline(selectedNodeId).slice(-3).reverse() : [];
  const diff = replay.getBlackboardDiff(selectedTick);

  return (
    <section id="readme-hero" className="hero-stage-panel">
      <div className="hero-stage-heading">
        <div>
          <p className="eyebrow">polished inspection and publication workflow</p>
          <h2>{treeName}</h2>
          <p className="panel-copy muted">Replan under budget pressure, keep the tree readable, and preserve the run story in one calm surface.</p>
        </div>

        <div className="tree-summary-badges">
          <span className="status-badge status-badge--subtle">{backend}</span>
          <span className="status-badge status-badge--subtle">{runId}</span>
          <span className="status-badge status-badge--history-warning">
            {summary.warnings.budget_warning_count} budget warning
            {summary.warnings.budget_warning_count === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="hero-stage-grid">
        <div className="hero-stage-main">
          <TreeView replay={replay} selectedTick={selectedTick} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />

          <section className="hero-scrubber-panel">
            <div className="hero-scrubber-meta">
              <div>
                <span className="metric-label">selected tick</span>
                <div className="hero-scrubber-tick">{selectedTick}</div>
              </div>

              <div className="hero-scrubber-facts">
                <span className="status-badge status-badge--subtle">{replayIndexed ? 'indexed replay' : 'full scan'}</span>
                <span className="status-badge status-badge--subtle">{tickCount} tick(s)</span>
                <span className="status-badge status-badge--subtle">{plannerCalls} planner call(s)</span>
              </div>
            </div>

            <label className="tick-row" htmlFor="tick-scrubber">
              <span>
                <span>tick scrubber</span>
                <span>
                  0 → {maxTick}
                </span>
              </span>
              <input
                id="tick-scrubber"
                type="range"
                min={0}
                max={maxTick}
                value={selectedTick}
                onChange={(event) => onSelectTick(Number(event.target.value))}
                disabled={maxTick <= 0}
              />
            </label>

            <div className="scrubber-scale">
              <span>0</span>
              <span>{Math.max(Math.floor(maxTick / 2), 0)}</span>
              <span>{maxTick}</span>
            </div>
          </section>
        </div>

        <aside className="hero-story-panel">
          <div className="hero-story-header">
            <p className="panel-kicker">selected story</p>
            <h3>{selectedNodeName}</h3>
            <p className="panel-copy muted">
              {selectedNodeStatus?.message ?? 'Select a node to keep the current branch, timing, and blackboard changes in view.'}
            </p>
          </div>

          <dl className="hero-story-grid">
            <div>
              <dt>status</dt>
              <dd>{selectedNodeStatus?.status ?? 'unknown'}</dd>
            </div>
            <div>
              <dt>mean tick time</dt>
              <dd>{formatDurationMs(summary.ticks.mean_duration_ms)}</dd>
            </div>
            <div>
              <dt>schema</dt>
              <dd>
                <code>{summary.schema_version}</code>
              </dd>
            </div>
            <div>
              <dt>contract</dt>
              <dd>
                <code>{summary.contract_version}</code>
              </dd>
            </div>
            <div>
              <dt>scheduler jobs</dt>
              <dd>{summary.async_jobs.sched.submit}</dd>
            </div>
            <div>
              <dt>event digest</dt>
              <dd>
                <code>{summary.digest}</code>
              </dd>
            </div>
          </dl>

          <div className="hero-story-section">
            <h3>recent node history</h3>
            {selectedNodeTimeline.length === 0 ? (
              <p className="panel-empty-copy muted">No node status history for this selection.</p>
            ) : (
              <ul className="detail-list">
                {selectedNodeTimeline.map((point) => (
                  <li key={`${point.seq}-${point.tick}`} className="detail-list-item">
                    <div className="detail-list-row">
                      <span className="detail-list-primary">tick {point.tick}</span>
                      <code>{point.status}</code>
                    </div>
                    {point.message ? <span className="detail-list-secondary">{point.message}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="hero-story-section">
            <h3>blackboard at tick {selectedTick}</h3>
            {diff.writes.length === 0 && diff.deletes.length === 0 ? (
              <p className="panel-empty-copy muted">No blackboard changes at this tick.</p>
            ) : (
              <ul className="detail-list">
                {diff.writes.slice(0, 3).map((entry) => (
                  <li key={entry.key} className="detail-list-item">
                    <div className="detail-list-row">
                      <code>{entry.key}</code>
                      <span className="detail-list-primary">write</span>
                    </div>
                    {entry.preview ? <span className="detail-list-secondary">{entry.preview}</span> : null}
                  </li>
                ))}
                {diff.deletes.slice(0, 2).map((key) => (
                  <li key={key} className="detail-list-item">
                    <div className="detail-list-row">
                      <code>{key}</code>
                      <span className="detail-list-primary">delete</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
