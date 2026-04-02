import { useEffect, useMemo, useState } from 'react';

import type { ReplayStore } from '@muesli/replay';

interface ComparePanelProps {
  replay: ReplayStore;
  selectedTick: number;
  initialBaselineTick?: number;
}

interface NodeComparison {
  nodeId: string;
  label: string;
  baselineStatus: string;
  selectedStatus: string;
  baselineMessage: string | null;
  selectedMessage: string | null;
}

interface BlackboardComparison {
  added: string[];
  changed: string[];
  removed: string[];
}

function normaliseStatus(value: string | undefined): string {
  return value ?? 'unknown';
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
      return name.length > 0 ? name : `node ${nodeId}`;
    }
  }

  return `node ${nodeId}`;
}

function formatDurationMs(value: number | null): string {
  if (value === null) {
    return '0 ms';
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ms`;
}

function compareBlackboard(replay: ReplayStore, baselineTick: number, selectedTick: number): BlackboardComparison {
  const baseline = replay.getBlackboardAt(baselineTick);
  const selected = replay.getBlackboardAt(selectedTick);
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  for (const [key, selectedValue] of selected.entries()) {
    const baselineValue = baseline.get(key);
    if (!baselineValue) {
      added.push(key);
      continue;
    }

    if (baselineValue.digest !== selectedValue.digest) {
      changed.push(key);
    }
  }

  for (const key of baseline.keys()) {
    if (!selected.has(key)) {
      removed.push(key);
    }
  }

  return {
    added: added.sort(),
    changed: changed.sort(),
    removed: removed.sort(),
  };
}

function compareNodes(replay: ReplayStore, baselineTick: number, selectedTick: number): NodeComparison[] {
  return replay
    .getTreeNodeIds()
    .map((nodeId) => {
      const baseline = replay.getNodeStatusAt(nodeId, baselineTick);
      const selected = replay.getNodeStatusAt(nodeId, selectedTick);
      const baselineStatus = normaliseStatus(baseline?.status);
      const selectedStatus = normaliseStatus(selected?.status);
      const baselineMessage = baseline?.message ?? null;
      const selectedMessage = selected?.message ?? null;

      return {
        nodeId,
        label: nodeLabelFromReplay(replay, nodeId),
        baselineStatus,
        selectedStatus,
        baselineMessage,
        selectedMessage,
      };
    })
    .filter(
      (entry) =>
        entry.baselineStatus !== entry.selectedStatus ||
        entry.baselineMessage !== entry.selectedMessage,
    );
}

function plannerSchedulerFacts(replay: ReplayStore, tick: number): { plannerEvents: number; schedulerEvents: number; plannerTimeMs: number; schedulerTimeMs: number } {
  let plannerEvents = 0;
  let schedulerEvents = 0;
  let plannerTimeMs = 0;
  let schedulerTimeMs = 0;

  for (const event of replay.getTick(tick)) {
    const data = event.data as Record<string, unknown>;
    if (event.type === 'planner_call_start' || event.type === 'planner_call_end' || event.type === 'planner_v1') {
      plannerEvents += 1;
      if (typeof data.time_used_ms === 'number' && Number.isFinite(data.time_used_ms)) {
        plannerTimeMs += data.time_used_ms;
      }
    }

    if (event.type === 'sched_submit' || event.type === 'sched_start' || event.type === 'sched_finish' || event.type === 'sched_cancel') {
      schedulerEvents += 1;
      if (typeof data.run_time_ns === 'number' && Number.isFinite(data.run_time_ns)) {
        schedulerTimeMs += data.run_time_ns / 1_000_000;
      }
    }
  }

  return { plannerEvents, schedulerEvents, plannerTimeMs, schedulerTimeMs };
}

export function ComparePanel({ replay, selectedTick, initialBaselineTick }: ComparePanelProps) {
  const maxBaselineTick = Math.max(0, selectedTick - 1);
  const [baselineTick, setBaselineTick] = useState(() =>
    Math.max(0, Math.min(initialBaselineTick ?? maxBaselineTick, maxBaselineTick)),
  );

  useEffect(() => {
    setBaselineTick((current) => Math.max(0, Math.min(current, maxBaselineTick)));
  }, [maxBaselineTick]);

  const nodeChanges = useMemo(() => compareNodes(replay, baselineTick, selectedTick), [baselineTick, replay, selectedTick]);
  const blackboardChanges = useMemo(() => compareBlackboard(replay, baselineTick, selectedTick), [baselineTick, replay, selectedTick]);
  const baselineFacts = useMemo(() => plannerSchedulerFacts(replay, baselineTick), [baselineTick, replay]);
  const selectedFacts = useMemo(() => plannerSchedulerFacts(replay, selectedTick), [replay, selectedTick]);
  const visibleNodeChanges = nodeChanges.slice(0, 6);
  const changedKeyCount = blackboardChanges.added.length + blackboardChanges.changed.length + blackboardChanges.removed.length;

  return (
    <section id="compare-panel" className="panel detail-panel compare-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">compare mode</p>
          <h2>tick comparison</h2>
          <p className="panel-copy muted">Keep shared context visible and pull divergence forward instead of mirroring two full interfaces.</p>
        </div>
        <div className="tree-summary-badges">
          <span className="status-badge status-badge--subtle">baseline {baselineTick}</span>
          <span className="status-badge status-badge--history-warning">selected {selectedTick}</span>
        </div>
      </div>

      <div className="control-stack">
        <label className="event-search-field">
          <span>baseline tick</span>
          <input
            type="range"
            min={0}
            max={maxBaselineTick}
            value={baselineTick}
            onChange={(event) => setBaselineTick(Number(event.target.value))}
            disabled={maxBaselineTick <= 0}
          />
        </label>
        <p className="panel-empty-copy muted">
          Comparing tick {baselineTick} against tick {selectedTick}.
        </p>
      </div>

      <div className="detail-summary-grid">
        <div className="detail-stat">
          <span className="detail-label">divergent nodes</span>
          <strong>{nodeChanges.length.toLocaleString()}</strong>
        </div>
        <div className="detail-stat">
          <span className="detail-label">changed keys</span>
          <strong>{changedKeyCount.toLocaleString()}</strong>
        </div>
        <div className="detail-stat">
          <span className="detail-label">planner/scheduler delta</span>
          <strong>
            {selectedFacts.plannerEvents - baselineFacts.plannerEvents >= 0 ? '+' : ''}
            {selectedFacts.plannerEvents - baselineFacts.plannerEvents} / {selectedFacts.schedulerEvents - baselineFacts.schedulerEvents >= 0 ? '+' : ''}
            {selectedFacts.schedulerEvents - baselineFacts.schedulerEvents}
          </strong>
        </div>
      </div>

      <div className="summary-section-grid">
        <section className="summary-section">
          <h3>execution delta</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>planner events</dt>
              <dd>
                {baselineFacts.plannerEvents} → {selectedFacts.plannerEvents}
              </dd>
            </div>
            <div>
              <dt>planner time</dt>
              <dd>
                {formatDurationMs(baselineFacts.plannerTimeMs)} → {formatDurationMs(selectedFacts.plannerTimeMs)}
              </dd>
            </div>
            <div>
              <dt>scheduler events</dt>
              <dd>
                {baselineFacts.schedulerEvents} → {selectedFacts.schedulerEvents}
              </dd>
            </div>
            <div>
              <dt>scheduler time</dt>
              <dd>
                {formatDurationMs(baselineFacts.schedulerTimeMs)} → {formatDurationMs(selectedFacts.schedulerTimeMs)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="summary-section">
          <h3>blackboard delta</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>added</dt>
              <dd>{blackboardChanges.added.join(', ') || 'none'}</dd>
            </div>
            <div>
              <dt>changed</dt>
              <dd>{blackboardChanges.changed.join(', ') || 'none'}</dd>
            </div>
            <div>
              <dt>removed</dt>
              <dd>{blackboardChanges.removed.join(', ') || 'none'}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="summary-section summary-section--full">
        <div className="summary-section-heading">
          <h3>aligned node divergence</h3>
          <p className="panel-empty-copy muted">Only changed nodes are shown, in tree order, so shared context stays quiet and divergence reads immediately.</p>
        </div>
        {visibleNodeChanges.length === 0 ? (
          <p className="panel-empty-copy muted">No node-status divergence was recorded between these ticks.</p>
        ) : (
          <ul className="compare-list">
            {visibleNodeChanges.map((entry) => (
              <li key={entry.nodeId} className="compare-list-item">
                <div className="compare-list-header">
                  <span className="detail-list-primary">{entry.label}</span>
                  <code>node {entry.nodeId}</code>
                </div>
                <div className="compare-list-grid">
                  <div className="compare-state compare-state--baseline">
                    <span className="compare-state-label">baseline</span>
                    <strong>{entry.baselineStatus}</strong>
                    <span className="detail-list-secondary">{entry.baselineMessage ?? 'No message'}</span>
                  </div>
                  <div className="compare-state compare-state--selected">
                    <span className="compare-state-label">selected</span>
                    <strong>{entry.selectedStatus}</strong>
                    <span className="detail-list-secondary">{entry.selectedMessage ?? 'No message'}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {nodeChanges.length > visibleNodeChanges.length ? (
          <p className="panel-empty-copy muted">
            Showing the first {visibleNodeChanges.length} divergent nodes out of {nodeChanges.length}.
          </p>
        ) : null}
      </section>
    </section>
  );
}
