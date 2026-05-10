// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseEvent, type ValidatedMbtEvent } from '@muesli/protocol';
import { parseJsonlEvents, ReplayStore } from '@muesli/replay';

import { buildEventMatch, buildJumpTargets, EventExplorer, filterEventMatches } from './EventExplorer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..', '..');

function loadStudioDemoReplay(): ReplayStore {
  const raw = readFileSync(path.join(rootDir, 'tests', 'fixtures', 'studio_demo', 'events.jsonl'), 'utf8');
  const parsed = parseJsonlEvents(raw);
  expect(parsed.errors).toHaveLength(0);

  const replay = new ReplayStore();
  replay.appendMany(parsed.events);
  return replay;
}

function loadDeadlineCancelReplay(): ReplayStore {
  const raw = readFileSync(path.join(rootDir, 'tests', 'fixtures', 'deadline_cancel', 'events.jsonl'), 'utf8');
  const parsed = parseJsonlEvents(raw);
  expect(parsed.errors).toHaveLength(0);

  const replay = new ReplayStore();
  replay.appendMany(parsed.events);
  return replay;
}

function loadV08OutcomeReplay(): ReplayStore {
  const raw = readFileSync(
    path.join(rootDir, 'tests', 'fixtures', 'muesli_bt_v0_8_ros2_preemption', 'events.jsonl'),
    'utf8',
  );
  const parsed = parseJsonlEvents(raw);
  expect(parsed.errors).toHaveLength(0);

  const replay = new ReplayStore();
  replay.appendMany(parsed.events);
  return replay;
}

function lifecycleEvent(
  type: ValidatedMbtEvent['type'],
  seq: number,
  data: Record<string, unknown>,
  tick = 1,
): ValidatedMbtEvent {
  return parseEvent({
    schema: 'mbt.evt.v1',
    contract_version: '1.0.0',
    type,
    run_id: 'fixture-model-capability',
    unix_ms: 1735689600000 + seq,
    seq,
    tick,
    data,
  });
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('EventExplorer', () => {
  let rendered: Array<{ root: Root; container: HTMLDivElement }> = [];

  beforeEach(() => {
    rendered = [];
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const view of rendered) {
      act(() => {
        view.root.unmount();
      });
      view.container.remove();
    }
    rendered = [];
  });

  it('filters the canonical demo events by family and search text', () => {
    const replay = loadStudioDemoReplay();
    const matches = replay.getAllEvents().map(buildEventMatch);

    const plannerMatches = filterEventMatches(matches, 'planner', 'rrt_star');
    const replanMatches = filterEventMatches(matches, 'all', 'replanned around a moving obstacle');

    expect(plannerMatches).toHaveLength(4);
    expect(plannerMatches.every((match) => match.family === 'planner')).toBe(true);
    expect(replanMatches).toHaveLength(1);
    expect(replanMatches[0]?.event.tick).toBe(3);
    expect(replanMatches[0]?.nodeId).toBe('4');
  });

  it('builds jump targets for failure, timeout, cancellation, VLA, planner, and blackboard events', () => {
    const replay = loadDeadlineCancelReplay();
    const matches = replay.getAllEvents().map(buildEventMatch);
    const targets = buildJumpTargets(matches);

    expect(targets.find((target) => target.kind === 'failure')?.match?.event.tick).toBe(2);
    expect(targets.find((target) => target.kind === 'timeout')?.match?.event.type).toBe('deadline_exceeded');
    expect(targets.find((target) => target.kind === 'cancellation')?.match?.event.type).toBe('async_cancel_requested');
    expect(targets.find((target) => target.kind === 'vla')?.match?.event.type).toBe('vla_submit');
    expect(targets.find((target) => target.kind === 'planner')?.match).toBeNull();
    expect(targets.find((target) => target.kind === 'blackboard')?.match).toBeNull();
  });

  it('groups v0.8.0 outcome events with readable summaries and failure jumps', () => {
    const replay = loadV08OutcomeReplay();
    const matches = replay.getAllEvents().map(buildEventMatch);
    const targets = buildJumpTargets(matches);

    const hostAction = matches.find((match) => match.event.type === 'host_action_invalid');
    const fallback = matches.find((match) => match.event.type === 'fallback_used');
    const blackboard = matches.find((match) => match.event.type === 'bb_write' && match.event.tick === 1);

    expect(hostAction?.family).toBe('warning');
    expect(hostAction?.summary).toContain('ros2');
    expect(hostAction?.summary).toContain('u_must_be_map');
    expect(fallback?.summary).toContain('safe_action');
    expect(blackboard?.summary).toContain('ros2.action.v1');
    expect(targets.find((target) => target.kind === 'failure')?.match?.event.type).toBe('host_action_invalid');
    expect(targets.find((target) => target.kind === 'blackboard')?.match?.event.tick).toBe(1);
  });

  it('surfaces model and capability lifecycle events as their own group and jump target', () => {
    const events = [
      lifecycleEvent('cap_call_start', 1, { capability: 'cap.model.world', operation: 'infer' }),
      lifecycleEvent('cap_call_end', 2, { capability: 'cap.model.world', operation: 'infer', status: 'accepted' }),
      lifecycleEvent('vla_timeout', 3, { job_id: 'vla-7', reason: 'deadline' }, 2),
      lifecycleEvent('late_result_dropped', 4, { job_id: 'vla-7', reason: 'stale_result' }, 2),
    ];
    const matches = events.map(buildEventMatch);
    const capabilityMatches = filterEventMatches(matches, 'capability', 'cap.model.world');
    const targets = buildJumpTargets(matches);

    expect(capabilityMatches).toHaveLength(2);
    expect(capabilityMatches.every((match) => match.family === 'capability')).toBe(true);
    expect(targets.find((target) => target.kind === 'capability')?.match?.event.type).toBe('cap_call_start');
    expect(targets.find((target) => target.kind === 'timeout')?.match?.event.type).toBe('vla_timeout');
    expect(targets.find((target) => target.kind === 'cancellation')?.match?.event.type).toBe('late_result_dropped');
    expect(targets.find((target) => target.kind === 'vla')?.match?.event.type).toBe('vla_timeout');
  });

  it('filters interactively and jumps to the selected tick and node', () => {
    const replay = loadStudioDemoReplay();
    const onJumpToTick = vi.fn();
    const onSelectNode = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    rendered.push({ root, container });

    act(() => {
      root.render(
        <EventExplorer
          replay={replay}
          mode="replay"
          eventCount={replay.getAllEvents().length}
          selectedTick={2}
          lazyActive={false}
          onJumpToTick={onJumpToTick}
          onSelectNode={onSelectNode}
        />,
      );
    });

    const plannerFilterButton = Array.from(container.querySelectorAll('.event-filter-chip')).find((button) =>
      button.textContent?.includes('planner'),
    );
    expect(plannerFilterButton).toBeDefined();

    act(() => {
      plannerFilterButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('matching events');
    expect(container.textContent).toContain('4');
    expect(container.textContent).toContain('tick 3');

    const jumpButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('jump'));
    expect(jumpButton).toBeDefined();

    act(() => {
      jumpButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectNode).toHaveBeenCalledWith('4');
    expect(onJumpToTick).toHaveBeenCalledWith(3);
  });

  it('uses the search input Enter flow to jump to the first matching event', () => {
    const replay = loadStudioDemoReplay();
    const onJumpToTick = vi.fn();
    const onSelectNode = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    rendered.push({ root, container });

    act(() => {
      root.render(
        <EventExplorer
          replay={replay}
          mode="replay"
          eventCount={replay.getAllEvents().length}
          selectedTick={0}
          lazyActive={false}
          onJumpToTick={onJumpToTick}
          onSelectNode={onSelectNode}
        />,
      );
    });

    const searchInput = container.querySelector('#event-search-input') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    act(() => {
      setInputValue(searchInput as HTMLInputElement, 'replanned around a moving obstacle');
    });

    act(() => {
      searchInput?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onSelectNode).toHaveBeenCalledWith('4');
    expect(onJumpToTick).toHaveBeenCalledWith(3);
  });

  it('jumps to the first timeout and selects the related node', () => {
    const replay = loadDeadlineCancelReplay();
    const onJumpToTick = vi.fn();
    const onSelectNode = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    rendered.push({ root, container });

    act(() => {
      root.render(
        <EventExplorer
          replay={replay}
          mode="replay"
          eventCount={replay.getAllEvents().length}
          selectedTick={0}
          lazyActive={false}
          onJumpToTick={onJumpToTick}
          onSelectNode={onSelectNode}
        />,
      );
    });

    const timeoutButton = Array.from(container.querySelectorAll('.jump-target-button')).find((button) =>
      button.textContent?.includes('timeout'),
    );
    expect(timeoutButton).toBeDefined();
    expect(timeoutButton?.textContent).toContain('tick 2');

    act(() => {
      timeoutButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectNode).not.toHaveBeenCalled();
    expect(onJumpToTick).toHaveBeenCalledWith(2);
  });
});
