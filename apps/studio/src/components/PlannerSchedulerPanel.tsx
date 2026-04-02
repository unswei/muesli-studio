import type { ValidatedMbtEvent } from '@muesli/protocol';
import type { ReplayStore } from '@muesli/replay';

interface PlannerSchedulerPanelProps {
  replay: ReplayStore;
  selectedTick: number;
}

interface TickActivity {
  tick: number;
  plannerEvents: number;
  plannerCalls: number;
  plannerBudgetMs: number;
  plannerUsedMs: number;
  plannerNames: string[];
  plannerStatuses: string[];
  schedulerEvents: number;
  schedulerJobs: number;
  schedulerQueueDepthMax: number | null;
  schedulerRuntimeMs: number;
  schedulerWorkers: string[];
  schedulerStatuses: string[];
}

interface PlannerSchedulerOverview {
  plannerCallCount: number;
  schedulerJobCount: number;
  activeTickCount: number;
  meanPlannerUsedMs: number | null;
  meanSchedulerRuntimeMs: number | null;
  topPlanner: string | null;
  topWorker: string | null;
  maxPlannerEvents: number;
  maxSchedulerEvents: number;
  activeTicks: TickActivity[];
  selectedTickActivity: TickActivity | null;
}

function stringFromUnknown(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberFromUnknown(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatDurationMs(value: number | null): string {
  if (value === null) {
    return 'unavailable';
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ms`;
}

function incrementCounter(counter: Map<string, number>, value: string | null): void {
  if (!value) {
    return;
  }

  counter.set(value, (counter.get(value) ?? 0) + 1);
}

function mostCommonLabel(counter: Map<string, number>): string | null {
  let bestLabel: string | null = null;
  let bestCount = -1;

  for (const [label, count] of counter.entries()) {
    if (count > bestCount || (count === bestCount && bestLabel !== null && label.localeCompare(bestLabel) < 0)) {
      bestLabel = label;
      bestCount = count;
    }
  }

  return bestLabel;
}

function ensureTickActivity(map: Map<number, TickActivity>, tick: number): TickActivity {
  const existing = map.get(tick);
  if (existing) {
    return existing;
  }

  const created: TickActivity = {
    tick,
    plannerEvents: 0,
    plannerCalls: 0,
    plannerBudgetMs: 0,
    plannerUsedMs: 0,
    plannerNames: [],
    plannerStatuses: [],
    schedulerEvents: 0,
    schedulerJobs: 0,
    schedulerQueueDepthMax: null,
    schedulerRuntimeMs: 0,
    schedulerWorkers: [],
    schedulerStatuses: [],
  };
  map.set(tick, created);
  return created;
}

export function buildPlannerSchedulerOverview(replay: ReplayStore, selectedTick: number): PlannerSchedulerOverview {
  const tickMap = new Map<number, TickActivity>();
  const plannerCounter = new Map<string, number>();
  const workerCounter = new Map<string, number>();

  let plannerCallCount = 0;
  let plannerUsedMsTotal = 0;
  let plannerUsedSamples = 0;
  let schedulerJobCount = 0;
  let schedulerRuntimeMsTotal = 0;
  let schedulerRuntimeSamples = 0;

  for (const event of replay.getAllEvents() as readonly ValidatedMbtEvent[]) {
    if (typeof event.tick !== 'number') {
      continue;
    }

    const tick = event.tick;
    const activity = ensureTickActivity(tickMap, tick);
    const data = event.data as Record<string, unknown>;

    if (event.type === 'planner_call_start') {
      activity.plannerEvents += 1;
      activity.plannerCalls += 1;
      plannerCallCount += 1;

      const planner = stringFromUnknown(data.planner);
      if (planner) {
        activity.plannerNames.push(planner);
        incrementCounter(plannerCounter, planner);
      }

      const budgetMs = numberFromUnknown(data.budget_ms);
      if (budgetMs !== null) {
        activity.plannerBudgetMs += budgetMs;
      }
      continue;
    }

    if (event.type === 'planner_call_end' || event.type === 'planner_v1') {
      activity.plannerEvents += 1;

      const planner = stringFromUnknown(data.planner);
      if (planner) {
        activity.plannerNames.push(planner);
        incrementCounter(plannerCounter, planner);
      }

      const status = stringFromUnknown(data.status);
      if (status) {
        activity.plannerStatuses.push(status);
      }

      const usedMs = numberFromUnknown(data.time_used_ms);
      if (usedMs !== null) {
        activity.plannerUsedMs += usedMs;
        plannerUsedMsTotal += usedMs;
        plannerUsedSamples += 1;
      }
      continue;
    }

    if (
      event.type === 'sched_submit' ||
      event.type === 'sched_start' ||
      event.type === 'sched_finish' ||
      event.type === 'sched_cancel'
    ) {
      activity.schedulerEvents += 1;

      if (event.type === 'sched_submit') {
        activity.schedulerJobs += 1;
        schedulerJobCount += 1;

        const queueDepth = numberFromUnknown(data.queue_depth);
        if (queueDepth !== null) {
          activity.schedulerQueueDepthMax =
            activity.schedulerQueueDepthMax === null ? queueDepth : Math.max(activity.schedulerQueueDepthMax, queueDepth);
        }
      }

      const worker = stringFromUnknown(data.worker);
      if (worker) {
        activity.schedulerWorkers.push(worker);
        incrementCounter(workerCounter, worker);
      }

      const status = stringFromUnknown(data.status) ?? (event.type === 'sched_cancel' ? 'cancelled' : null);
      if (status) {
        activity.schedulerStatuses.push(status);
      }

      const runtimeNs = numberFromUnknown(data.run_time_ns);
      if (runtimeNs !== null) {
        const runtimeMs = runtimeNs / 1_000_000;
        activity.schedulerRuntimeMs += runtimeMs;
        schedulerRuntimeMsTotal += runtimeMs;
        schedulerRuntimeSamples += 1;
      }
    }
  }

  const activeTicks = [...tickMap.values()]
    .filter((entry) => entry.plannerEvents > 0 || entry.schedulerEvents > 0)
    .sort((left, right) => right.tick - left.tick);
  const maxPlannerEvents = activeTicks.reduce((max, entry) => Math.max(max, entry.plannerEvents), 0);
  const maxSchedulerEvents = activeTicks.reduce((max, entry) => Math.max(max, entry.schedulerEvents), 0);

  return {
    plannerCallCount,
    schedulerJobCount,
    activeTickCount: activeTicks.length,
    meanPlannerUsedMs: plannerUsedSamples > 0 ? plannerUsedMsTotal / plannerUsedSamples : null,
    meanSchedulerRuntimeMs: schedulerRuntimeSamples > 0 ? schedulerRuntimeMsTotal / schedulerRuntimeSamples : null,
    topPlanner: mostCommonLabel(plannerCounter),
    topWorker: mostCommonLabel(workerCounter),
    maxPlannerEvents,
    maxSchedulerEvents,
    activeTicks,
    selectedTickActivity: tickMap.get(selectedTick) ?? null,
  };
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function activitySummary(entry: TickActivity): { planner: string; scheduler: string } {
  const plannerBits = [`${entry.plannerEvents} event${entry.plannerEvents === 1 ? '' : 's'}`];
  if (entry.plannerCalls > 0) {
    plannerBits.push(`${entry.plannerCalls} call${entry.plannerCalls === 1 ? '' : 's'}`);
  }
  if (entry.plannerUsedMs > 0 || entry.plannerBudgetMs > 0) {
    plannerBits.push(`${formatDurationMs(entry.plannerUsedMs)} used / ${formatDurationMs(entry.plannerBudgetMs)} budget`);
  }

  const schedulerBits = [`${entry.schedulerEvents} event${entry.schedulerEvents === 1 ? '' : 's'}`];
  if (entry.schedulerJobs > 0) {
    schedulerBits.push(`${entry.schedulerJobs} job${entry.schedulerJobs === 1 ? '' : 's'}`);
  }
  if (entry.schedulerRuntimeMs > 0) {
    schedulerBits.push(`${formatDurationMs(entry.schedulerRuntimeMs)} run`);
  }
  if (entry.schedulerQueueDepthMax !== null) {
    schedulerBits.push(`queue ${entry.schedulerQueueDepthMax}`);
  }

  return {
    planner: plannerBits.join(' · '),
    scheduler: schedulerBits.join(' · '),
  };
}

export function PlannerSchedulerPanel({ replay, selectedTick }: PlannerSchedulerPanelProps) {
  const overview = buildPlannerSchedulerOverview(replay, selectedTick);
  const selectedActivity = overview.selectedTickActivity;
  const visibleTicks = overview.activeTicks.slice(0, 6);

  return (
    <section className="panel detail-panel planner-scheduler-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">execution depth</p>
          <h2>planner and scheduler</h2>
          <p className="panel-copy muted">Read planner pressure and scheduler throughput together before drilling into individual events.</p>
        </div>
        <div className="tree-summary-badges">
          <span className="status-badge status-badge--subtle">{overview.activeTickCount} active tick{overview.activeTickCount === 1 ? '' : 's'}</span>
          <span className="status-badge status-badge--subtle">tick {selectedTick}</span>
        </div>
      </div>

      <div className="detail-summary-grid">
        <div className="detail-stat">
          <span className="detail-label">planner calls</span>
          <strong>{overview.plannerCallCount.toLocaleString()}</strong>
        </div>
        <div className="detail-stat">
          <span className="detail-label">scheduler jobs</span>
          <strong>{overview.schedulerJobCount.toLocaleString()}</strong>
        </div>
        <div className="detail-stat">
          <span className="detail-label">active ticks</span>
          <strong>{overview.activeTickCount.toLocaleString()}</strong>
        </div>
      </div>

      <div className="summary-section-grid">
        <section className="summary-section">
          <h3>overview</h3>
          <dl className="summary-definition-list">
            <div>
              <dt>top planner</dt>
              <dd>{overview.topPlanner ?? 'unavailable'}</dd>
            </div>
            <div>
              <dt>mean planner time</dt>
              <dd>{formatDurationMs(overview.meanPlannerUsedMs)}</dd>
            </div>
            <div>
              <dt>top worker</dt>
              <dd>{overview.topWorker ?? 'unavailable'}</dd>
            </div>
            <div>
              <dt>mean scheduler runtime</dt>
              <dd>{formatDurationMs(overview.meanSchedulerRuntimeMs)}</dd>
            </div>
          </dl>
        </section>

        <section className="summary-section">
          <h3>selected tick</h3>
          {selectedActivity ? (
            <dl className="summary-definition-list">
              <div>
                <dt>planner</dt>
                <dd>{selectedActivity.plannerEvents > 0 ? activitySummary(selectedActivity).planner : 'quiet'}</dd>
              </div>
              <div>
                <dt>scheduler</dt>
                <dd>{selectedActivity.schedulerEvents > 0 ? activitySummary(selectedActivity).scheduler : 'quiet'}</dd>
              </div>
              <div>
                <dt>planner status</dt>
                <dd>{dedupe(selectedActivity.plannerStatuses).join(', ') || 'n/a'}</dd>
              </div>
              <div>
                <dt>scheduler status</dt>
                <dd>{dedupe(selectedActivity.schedulerStatuses).join(', ') || 'n/a'}</dd>
              </div>
            </dl>
          ) : (
            <p className="panel-empty-copy muted">No planner or scheduler activity was recorded at the selected tick.</p>
          )}
        </section>
      </div>

      <section className="summary-section summary-section--full">
        <div className="summary-section-heading">
          <h3>tick activity</h3>
          <p className="panel-empty-copy muted">
            One chart language for both systems: each row shows planner and scheduler intensity for the same tick.
          </p>
        </div>
        {visibleTicks.length === 0 ? (
          <p className="panel-empty-copy muted">No planner or scheduler events were recorded in this run.</p>
        ) : (
          <ul className="planner-activity-list">
            {visibleTicks.map((entry) => {
              const summary = activitySummary(entry);
              const plannerWidth = overview.maxPlannerEvents > 0 ? (entry.plannerEvents / overview.maxPlannerEvents) * 100 : 0;
              const schedulerWidth = overview.maxSchedulerEvents > 0 ? (entry.schedulerEvents / overview.maxSchedulerEvents) * 100 : 0;

              return (
                <li key={entry.tick} className="planner-activity-item">
                  <div className="planner-activity-tick">
                    <span className="detail-list-primary">tick {entry.tick}</span>
                    {entry.tick === selectedTick ? <span className="status-badge status-badge--subtle">selected</span> : null}
                  </div>
                  <div className="planner-activity-meters">
                    <div className="planner-activity-lane">
                      <span className="planner-activity-label">planner</span>
                      <div className="planner-activity-track" aria-hidden="true">
                        <div className="planner-activity-fill planner-activity-fill--planner" style={{ width: `${plannerWidth}%` }} />
                      </div>
                      <span className="planner-activity-copy">{summary.planner}</span>
                    </div>
                    <div className="planner-activity-lane">
                      <span className="planner-activity-label">scheduler</span>
                      <div className="planner-activity-track" aria-hidden="true">
                        <div className="planner-activity-fill planner-activity-fill--scheduler" style={{ width: `${schedulerWidth}%` }} />
                      </div>
                      <span className="planner-activity-copy">{summary.scheduler}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {overview.activeTicks.length > visibleTicks.length ? (
          <p className="panel-empty-copy muted">
            Showing the newest {visibleTicks.length} active ticks out of {overview.activeTicks.length}.
          </p>
        ) : null}
      </section>
    </section>
  );
}
