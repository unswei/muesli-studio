import { useDeferredValue, useMemo, useState } from 'react';

import type { ValidatedMbtEvent } from '@muesli/protocol';
import type { ReplayStore } from '@muesli/replay';

type EventFamily = 'all' | 'runtime' | 'node' | 'planner' | 'scheduler' | 'blackboard' | 'warning' | 'async';

interface EventExplorerProps {
  replay: ReplayStore;
  mode: 'replay' | 'live';
  eventCount: number;
  selectedTick: number;
  lazyActive: boolean;
  onJumpToTick: (tick: number) => void;
  onSelectNode: (nodeId: string) => void;
}

interface EventMatch {
  event: ValidatedMbtEvent;
  family: Exclude<EventFamily, 'all'>;
  nodeId: string | null;
  title: string;
  summary: string;
  searchText: string;
}

type JumpTargetKind = 'failure' | 'timeout' | 'cancellation' | 'planner' | 'vla' | 'blackboard';

interface JumpTarget {
  kind: JumpTargetKind;
  label: string;
  description: string;
  match: EventMatch | null;
}

const eventFamilies: ReadonlyArray<{ id: EventFamily; label: string }> = [
  { id: 'all', label: 'all' },
  { id: 'node', label: 'node' },
  { id: 'planner', label: 'planner' },
  { id: 'scheduler', label: 'scheduler' },
  { id: 'blackboard', label: 'blackboard' },
  { id: 'warning', label: 'warnings' },
  { id: 'async', label: 'async' },
  { id: 'runtime', label: 'run/tick' },
];

const RESULT_LIMIT = 12;
const jumpTargetOrder: readonly JumpTargetKind[] = ['failure', 'timeout', 'cancellation', 'planner', 'vla', 'blackboard'];

function normaliseNodeId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function eventFamilyForType(type: ValidatedMbtEvent['type']): Exclude<EventFamily, 'all'> {
  if (type === 'node_enter' || type === 'node_exit' || type === 'node_status') {
    return 'node';
  }

  if (type === 'planner_call_start' || type === 'planner_call_end' || type === 'planner_v1') {
    return 'planner';
  }

  if (type === 'sched_submit' || type === 'sched_start' || type === 'sched_finish' || type === 'sched_cancel') {
    return 'scheduler';
  }

  if (type === 'bb_write' || type === 'bb_delete' || type === 'bb_snapshot') {
    return 'blackboard';
  }

  if (type === 'budget_warning' || type === 'deadline_exceeded' || type === 'error') {
    return 'warning';
  }

  if (
    type === 'vla_submit' ||
    type === 'vla_poll' ||
    type === 'vla_cancel' ||
    type === 'vla_result' ||
    type === 'async_cancel_requested' ||
    type === 'async_cancel_acknowledged' ||
    type === 'async_completion_dropped'
  ) {
    return 'async';
  }

  return 'runtime';
}

function friendlyTypeLabel(type: ValidatedMbtEvent['type']): string {
  return type.replaceAll('_', ' ');
}

function appendScalarStrings(parts: string[], value: unknown, depth = 0): void {
  if (value === null || value === undefined || depth > 2 || parts.length >= 24) {
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      parts.push(trimmed);
    }
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    parts.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendScalarStrings(parts, item, depth + 1);
      if (parts.length >= 24) {
        break;
      }
    }
    return;
  }

  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      parts.push(key);
      appendScalarStrings(parts, entry, depth + 1);
      if (parts.length >= 24) {
        break;
      }
    }
  }
}

function summaryForEvent(event: ValidatedMbtEvent, nodeId: string | null): string {
  const data = event.data as Record<string, unknown>;

  if (event.type === 'node_status') {
    const message = typeof data.message === 'string' ? data.message : null;
    const outcome = typeof data.outcome === 'string' ? data.outcome : null;
    const status = typeof data.status === 'string' ? data.status : 'unknown';
    return [status, outcome, message].filter((value): value is string => Boolean(value)).join(' · ');
  }

  if (event.type === 'node_enter') {
    return nodeId ? `entered node ${nodeId}` : 'node enter';
  }

  if (event.type === 'node_exit') {
    const status = typeof data.status === 'string' ? data.status : 'unknown';
    const durationMs = typeof data.dur_ms === 'number' ? `${data.dur_ms.toFixed(1)} ms` : null;
    return [status, durationMs].filter((value): value is string => Boolean(value)).join(' · ');
  }

  if (event.type === 'planner_call_start') {
    const planner = typeof data.planner === 'string' ? data.planner : 'planner';
    const budgetMs = typeof data.budget_ms === 'number' ? `${data.budget_ms} ms budget` : null;
    return [planner, budgetMs].filter((value): value is string => Boolean(value)).join(' · ');
  }

  if (event.type === 'planner_call_end') {
    const planner = typeof data.planner === 'string' ? data.planner : 'planner';
    const status = typeof data.status === 'string' ? data.status : null;
    const usedMs = typeof data.time_used_ms === 'number' ? `${data.time_used_ms.toFixed(1)} ms used` : null;
    return [planner, status, usedMs].filter((value): value is string => Boolean(value)).join(' · ');
  }

  if (event.type === 'sched_submit' || event.type === 'sched_start' || event.type === 'sched_finish' || event.type === 'sched_cancel') {
    const jobId = typeof data.job_id === 'number' || typeof data.job_id === 'string' ? `job ${data.job_id}` : null;
    const status = typeof data.status === 'string' ? data.status : null;
    const worker = typeof data.worker === 'string' ? data.worker : null;
    const reason = typeof data.reason === 'string' ? data.reason : null;
    return [jobId, status, worker, reason].filter((value): value is string => Boolean(value)).join(' · ');
  }

  if (event.type === 'bb_write') {
    const key = typeof data.key === 'string' ? data.key : 'blackboard write';
    const preview = typeof data.preview === 'string' ? data.preview : null;
    return [key, preview].filter((value): value is string => Boolean(value)).join(' · ');
  }

  if (event.type === 'bb_delete') {
    const key = typeof data.key === 'string' ? data.key : 'blackboard delete';
    const reason = typeof data.reason === 'string' ? data.reason : null;
    return [key, reason].filter((value): value is string => Boolean(value)).join(' · ');
  }

  if (event.type === 'budget_warning' || event.type === 'deadline_exceeded') {
    const reason = typeof data.reason === 'string' ? data.reason : friendlyTypeLabel(event.type);
    const decisionPoint = typeof data.decision_point === 'string' ? data.decision_point : null;
    const remainingMs = typeof data.remaining_ms === 'number' ? `${data.remaining_ms.toFixed(1)} ms remaining` : null;
    return [reason, decisionPoint, remainingMs].filter((value): value is string => Boolean(value)).join(' · ');
  }

  if (event.type === 'tick_end') {
    const rootStatus = typeof data.root_status === 'string' ? data.root_status : 'unknown';
    const tickMs = typeof data.tick_ms === 'number' ? `${data.tick_ms.toFixed(1)} ms` : null;
    return [rootStatus, tickMs].filter((value): value is string => Boolean(value)).join(' · ');
  }

  if (event.type === 'run_start') {
    const backend =
      typeof data.backend === 'string'
        ? data.backend
        : data.host && typeof data.host === 'object' && typeof (data.host as Record<string, unknown>).name === 'string'
          ? String((data.host as Record<string, unknown>).name)
          : null;
    return [event.run_id, backend].filter((value): value is string => Boolean(value)).join(' · ');
  }

  const scalarParts: string[] = [];
  appendScalarStrings(scalarParts, data);
  return scalarParts.slice(0, 4).join(' · ');
}

export function buildEventMatch(event: ValidatedMbtEvent): EventMatch {
  const nodeId = normaliseNodeId((event.data as Record<string, unknown>).node_id);
  const family = eventFamilyForType(event.type);
  const title = friendlyTypeLabel(event.type);
  const summary = summaryForEvent(event, nodeId);
  const searchParts = [
    title,
    event.type,
    event.run_id,
    typeof event.tick === 'number' ? String(event.tick) : '',
    String(event.seq),
    nodeId ?? '',
    summary,
  ];
  appendScalarStrings(searchParts, event.data);

  return {
    event,
    family,
    nodeId,
    title,
    summary,
    searchText: searchParts.join(' ').toLowerCase(),
  };
}

export function filterEventMatches(matches: readonly EventMatch[], family: EventFamily, query: string): EventMatch[] {
  const trimmedQuery = query.trim().toLowerCase();

  return matches.filter((match) => {
    if (family !== 'all' && match.family !== family) {
      return false;
    }

    if (trimmedQuery.length === 0) {
      return true;
    }

    return match.searchText.includes(trimmedQuery);
  });
}

function isFailureMatch(match: EventMatch): boolean {
  const data = match.event.data as Record<string, unknown>;

  if (match.event.type === 'error') {
    return true;
  }

  if (match.event.type === 'node_status' || match.event.type === 'node_exit') {
    return data.status === 'failure';
  }

  if (match.event.type === 'tick_end') {
    return data.root_status === 'failure';
  }

  return false;
}

function isTimeoutMatch(match: EventMatch): boolean {
  return match.event.type === 'deadline_exceeded';
}

function isCancellationMatch(match: EventMatch): boolean {
  return (
    match.event.type === 'async_cancel_requested' ||
    match.event.type === 'async_cancel_acknowledged' ||
    match.event.type === 'sched_cancel' ||
    match.event.type === 'vla_cancel'
  );
}

function isPlannerMatch(match: EventMatch): boolean {
  return match.event.type === 'planner_call_start' || match.event.type === 'planner_call_end' || match.event.type === 'planner_v1';
}

function isVlaMatch(match: EventMatch): boolean {
  return (
    match.event.type === 'vla_submit' ||
    match.event.type === 'vla_poll' ||
    match.event.type === 'vla_cancel' ||
    match.event.type === 'vla_result'
  );
}

function isBlackboardMatch(match: EventMatch): boolean {
  return match.event.type === 'bb_write' || match.event.type === 'bb_delete' || match.event.type === 'bb_snapshot';
}

export function buildJumpTargets(matches: readonly EventMatch[]): JumpTarget[] {
  const byKind = new Map<JumpTargetKind, EventMatch | null>();
  for (const kind of jumpTargetOrder) {
    byKind.set(kind, null);
  }

  for (const match of matches) {
    if (byKind.get('failure') === null && isFailureMatch(match)) {
      byKind.set('failure', match);
    }
    if (byKind.get('timeout') === null && isTimeoutMatch(match)) {
      byKind.set('timeout', match);
    }
    if (byKind.get('cancellation') === null && isCancellationMatch(match)) {
      byKind.set('cancellation', match);
    }
    if (byKind.get('planner') === null && isPlannerMatch(match)) {
      byKind.set('planner', match);
    }
    if (byKind.get('vla') === null && isVlaMatch(match)) {
      byKind.set('vla', match);
    }
    if (byKind.get('blackboard') === null && isBlackboardMatch(match)) {
      byKind.set('blackboard', match);
    }
  }

  return [
    {
      kind: 'failure',
      label: 'first failure',
      description: 'Jump to the earliest failure signal in the loaded event stream.',
      match: byKind.get('failure') ?? null,
    },
    {
      kind: 'timeout',
      label: 'timeout',
      description: 'Jump to the first explicit deadline exceeded event.',
      match: byKind.get('timeout') ?? null,
    },
    {
      kind: 'cancellation',
      label: 'cancellation',
      description: 'Jump to the earliest cancellation request or acknowledgement.',
      match: byKind.get('cancellation') ?? null,
    },
    {
      kind: 'planner',
      label: 'planner activity',
      description: 'Jump to the first planner call recorded in the run.',
      match: byKind.get('planner') ?? null,
    },
    {
      kind: 'vla',
      label: 'VLA activity',
      description: 'Jump to the first VLA lifecycle event in the run.',
      match: byKind.get('vla') ?? null,
    },
    {
      kind: 'blackboard',
      label: 'blackboard change',
      description: 'Jump to the first recorded blackboard write, delete, or snapshot.',
      match: byKind.get('blackboard') ?? null,
    },
  ];
}

export function EventExplorer({
  replay,
  mode,
  eventCount,
  selectedTick,
  lazyActive,
  onJumpToTick,
  onSelectNode,
}: EventExplorerProps) {
  const [query, setQuery] = useState('');
  const [activeFamily, setActiveFamily] = useState<EventFamily>('all');
  const deferredQuery = useDeferredValue(query);

  const jumpToMatch = (match: EventMatch | null): void => {
    if (!match || typeof match.event.tick !== 'number') {
      return;
    }

    if (match.nodeId) {
      onSelectNode(match.nodeId);
    }

    onJumpToTick(match.event.tick);
  };

  const matches = useMemo(() => replay.getAllEvents().map(buildEventMatch), [eventCount, replay]);
  const filteredMatches = useMemo(
    () => filterEventMatches(matches, activeFamily, deferredQuery).sort((left, right) => right.event.seq - left.event.seq),
    [activeFamily, deferredQuery, matches],
  );
  const visibleMatches = filteredMatches.slice(0, RESULT_LIMIT);
  const matchingTickCount = useMemo(() => {
    const ticks = new Set<number>();
    for (const match of filteredMatches) {
      if (typeof match.event.tick === 'number') {
        ticks.add(match.event.tick);
      }
    }

    return ticks.size;
  }, [filteredMatches]);
  const familyCounts = useMemo(() => {
    const counts = new Map<EventFamily, number>();
    counts.set('all', matches.length);
    for (const family of eventFamilies) {
      if (family.id !== 'all') {
        counts.set(family.id, 0);
      }
    }

    for (const match of matches) {
      counts.set(match.family, (counts.get(match.family) ?? 0) + 1);
    }

    return counts;
  }, [matches]);
  const jumpTargets = useMemo(() => buildJumpTargets(matches), [matches]);
  const hasActiveFilter = activeFamily !== 'all' || deferredQuery.trim().length > 0;

  return (
    <section id="event-explorer-panel" tabIndex={-1} className="panel detail-panel event-explorer-panel keyboard-panel-target">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">timeline search</p>
          <h2>event explorer</h2>
          <p className="panel-copy muted">Search by event type, node, planner, blackboard key, or message, then jump straight to the matching tick.</p>
        </div>
        <div className="tree-summary-badges">
          <span className="status-badge status-badge--subtle">{mode === 'live' ? 'live stream' : 'replay log'}</span>
          {hasActiveFilter ? <span className="status-badge status-badge--indexed">{filteredMatches.length} match(es)</span> : null}
        </div>
      </div>

      <div className="control-stack">
        <div className="summary-section summary-section--full jump-targets-section">
          <div className="summary-section-heading">
            <h3>jump to</h3>
            <p className="panel-empty-copy muted">Use the quickest path to the first failure, timeout, cancellation, planner, VLA, or blackboard event.</p>
          </div>
          <div className="jump-target-grid">
            {jumpTargets.map((target) => {
              const tick = target.match?.event.tick;
              const canJump = typeof tick === 'number';
              return (
                <button
                  key={target.kind}
                  type="button"
                  className={target.match ? 'button-ghost jump-target-button' : 'button-ghost jump-target-button jump-target-button--empty'}
                  onClick={() => {
                    if (!canJump) {
                      return;
                    }

                    jumpToMatch(target.match);
                  }}
                  disabled={!canJump}
                >
                  <span className="jump-target-label">{target.label}</span>
                  <span className="jump-target-value">{canJump ? `tick ${tick}` : 'unavailable'}</span>
                </button>
              );
            })}
          </div>
        </div>

        <label className="event-search-field">
          <span>search</span>
          <input
            id="event-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                jumpToMatch(visibleMatches[0] ?? null);
                return;
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                if (query.length > 0) {
                  setQuery('');
                } else {
                  (event.currentTarget as HTMLInputElement).blur();
                }
              }
            }}
            placeholder="Search type, node, planner, key, or message"
          />
        </label>

        <div className="event-filter-row" role="toolbar" aria-label="event family filters">
          {eventFamilies.map((family) => (
            <button
              key={family.id}
              type="button"
              className={activeFamily === family.id ? 'button-primary event-filter-chip' : 'button-ghost event-filter-chip'}
              onClick={() => setActiveFamily(family.id)}
            >
              {family.label}
              <span>{(familyCounts.get(family.id) ?? 0).toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="detail-summary-grid">
        <div className="detail-stat">
          <span className="detail-label">loaded events</span>
          <strong>{eventCount.toLocaleString()}</strong>
        </div>
        <div className="detail-stat">
          <span className="detail-label">matching events</span>
          <strong>{filteredMatches.length.toLocaleString()}</strong>
        </div>
        <div className="detail-stat">
          <span className="detail-label">matching ticks</span>
          <strong>{matchingTickCount.toLocaleString()}</strong>
        </div>
      </div>

      {lazyActive ? (
        <p className="notice-inline notice-inline--info">
          Search covers the part of the run that is loaded right now. Move further through a very large run to bring more results into view.
        </p>
      ) : null}

      <p className="panel-empty-copy muted">
        Shortcuts: <code>/</code> search, <code>Enter</code> jump first match, <code>Esc</code> clear search, <code>←/→</code> scrub,
        <code>Shift+←/→</code> jump by ten ticks, <code>Home</code>/<code>End</code> go to bounds, <code>1-8</code> switch panels.
      </p>

      <div className="history-list">
        {visibleMatches.length === 0 ? (
          <p className="panel-empty-copy muted">
            {hasActiveFilter ? 'No events match the current search or family filter.' : 'No events are loaded yet.'}
          </p>
        ) : (
          <>
            <ul className="detail-list">
              {visibleMatches.map((match) => {
                const tick = match.event.tick;
                const canJump = typeof tick === 'number';
                return (
                  <li key={match.event.seq} className="detail-list-item">
                    <div className="detail-list-row">
                      <span className="detail-list-primary">
                        {canJump ? `tick ${tick}` : 'run event'} · {match.title}
                      </span>
                      <div className="event-match-actions">
                        {typeof tick === 'number' && tick === selectedTick ? (
                          <span className="status-badge status-badge--subtle">selected tick</span>
                        ) : null}
                        <button
                          type="button"
                          className="button-ghost"
                          onClick={() => jumpToMatch(match)}
                          disabled={!canJump}
                        >
                          jump
                        </button>
                      </div>
                    </div>
                    <span className="detail-list-secondary">{match.summary || 'No additional event detail.'}</span>
                    <div className="detail-list-row">
                      <span className="detail-list-secondary">seq {match.event.seq} · {match.family}</span>
                      {match.nodeId ? <code>node {match.nodeId}</code> : <code>{match.event.type}</code>}
                    </div>
                  </li>
                );
              })}
            </ul>

            {filteredMatches.length > RESULT_LIMIT ? (
              <p className="panel-empty-copy muted">
                Showing the newest {RESULT_LIMIT.toLocaleString()} matches out of {filteredMatches.length.toLocaleString()}.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
