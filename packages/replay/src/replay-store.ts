import type { ValidatedMbtEvent } from '@muesli/protocol';

type StatusEvent = Extract<ValidatedMbtEvent, { type: 'node_status' }>;
type BlackboardWriteEvent = Extract<ValidatedMbtEvent, { type: 'bb_write' }>;
type BlackboardDeleteEvent = Extract<ValidatedMbtEvent, { type: 'bb_delete' }>;
type BlackboardSnapshotEvent = Extract<ValidatedMbtEvent, { type: 'bb_snapshot' }>;

type BlackboardValue = {
  digest: string;
  preview?: string;
};

interface BlackboardDiffState {
  writes: Map<string, BlackboardValue>;
  deletes: Set<string>;
}

interface BlackboardHistoryPoint {
  tick: number;
  seq: number;
  value?: BlackboardValue;
  deleted: boolean;
}

export interface NodeStatusPoint {
  tick: number;
  seq: number;
  status: StatusEvent['data']['status'];
  outcome?: StatusEvent['data']['outcome'];
  message?: string;
}

export interface BlackboardDiff {
  tick: number;
  writes: Array<{ key: string; digest: string; preview?: string }>;
  deletes: string[];
}

export class ReplayStore {
  private readonly events: ValidatedMbtEvent[] = [];

  private readonly eventsByTick = new Map<number, ValidatedMbtEvent[]>();

  private readonly nodeTimeline = new Map<string, NodeStatusPoint[]>();

  private readonly nodeLastStatus = new Map<string, NodeStatusPoint>();

  private readonly blackboardDiffByTick = new Map<number, BlackboardDiffState>();

  private readonly blackboardHistory = new Map<string, BlackboardHistoryPoint[]>();

  private readonly blackboardSnapshots: Array<{ tick: number; values: Map<string, BlackboardValue> }> = [];

  private cursorTick = 0;

  private maxTickValue = -1;

  private runStartEvent?: Extract<ValidatedMbtEvent, { type: 'run_start' }>;

  private btDefEvent?: Extract<ValidatedMbtEvent, { type: 'bt_def' }>;

  append(event: ValidatedMbtEvent): void {
    this.events.push(event);

    if (event.type === 'run_start') {
      this.runStartEvent = event;
    }

    if (event.type === 'bt_def') {
      this.btDefEvent = event;
    }

    if (typeof event.tick === 'number') {
      this.maxTickValue = Math.max(this.maxTickValue, event.tick);
      const bucket = this.eventsByTick.get(event.tick) ?? [];
      bucket.push(event);
      this.eventsByTick.set(event.tick, bucket);
    }

    switch (event.type) {
      case 'node_status': {
        const point: NodeStatusPoint = {
          tick: event.tick,
          seq: event.seq,
          status: event.data.status,
          outcome: event.data.outcome,
          message: event.data.message,
        };

        const timeline = this.nodeTimeline.get(event.data.node_id) ?? [];
        timeline.push(point);
        this.nodeTimeline.set(event.data.node_id, timeline);
        this.nodeLastStatus.set(event.data.node_id, point);
        break;
      }

      case 'bb_write':
        this.applyBlackboardWrite(event);
        break;

      case 'bb_delete':
        this.applyBlackboardDelete(event);
        break;

      case 'bb_snapshot':
        this.applyBlackboardSnapshot(event);
        break;

      default:
        break;
    }
  }

  appendMany(events: ValidatedMbtEvent[]): void {
    for (const event of events) {
      this.append(event);
    }
  }

  getAllEvents(): readonly ValidatedMbtEvent[] {
    return this.events;
  }

  get runStart(): Extract<ValidatedMbtEvent, { type: 'run_start' }> | undefined {
    return this.runStartEvent;
  }

  get btDef(): Extract<ValidatedMbtEvent, { type: 'bt_def' }> | undefined {
    return this.btDefEvent;
  }

  get maxTick(): number {
    return this.maxTickValue;
  }

  getTick(tick: number): readonly ValidatedMbtEvent[] {
    return this.eventsByTick.get(tick) ?? [];
  }

  getNodeTimeline(nodeId: string): readonly NodeStatusPoint[] {
    return this.nodeTimeline.get(nodeId) ?? [];
  }

  getNodeStatusAt(nodeId: string, tick: number): NodeStatusPoint | undefined {
    const timeline = this.nodeTimeline.get(nodeId);
    if (!timeline || timeline.length === 0) {
      return undefined;
    }

    for (let index = timeline.length - 1; index >= 0; index -= 1) {
      const point = timeline[index];
      if (!point) {
        continue;
      }

      if (point.tick <= tick) {
        return point;
      }
    }

    return undefined;
  }

  getBlackboardDiff(tick: number): BlackboardDiff {
    const internal = this.blackboardDiffByTick.get(tick);

    if (!internal) {
      return { tick, writes: [], deletes: [] };
    }

    return {
      tick,
      writes: Array.from(internal.writes.entries()).map(([key, value]) => ({
        key,
        digest: value.digest,
        preview: value.preview,
      })),
      deletes: Array.from(internal.deletes.values()),
    };
  }

  getBlackboardAt(tick: number): Map<string, BlackboardValue> {
    const state = this.seedBlackboardState(tick);
    const floorTick = this.blackboardSnapshotFloorTick(tick);

    for (const [key, history] of this.blackboardHistory) {
      for (const point of history) {
        if (point.tick <= floorTick || point.tick > tick) {
          continue;
        }

        if (point.deleted || !point.value) {
          state.delete(key);
        } else {
          state.set(key, point.value);
        }
      }
    }

    return state;
  }

  seek(tick: number): { tick: number; events: readonly ValidatedMbtEvent[] } {
    if (this.maxTickValue < 0) {
      this.cursorTick = 0;
      return { tick: 0, events: [] };
    }

    const clamped = Math.max(0, Math.min(tick, this.maxTickValue));
    this.cursorTick = clamped;

    return {
      tick: clamped,
      events: this.getTick(clamped),
    };
  }

  get currentTick(): number {
    return this.cursorTick;
  }

  private applyBlackboardWrite(event: BlackboardWriteEvent): void {
    const value: BlackboardValue = {
      digest: event.data.digest,
      preview: event.data.preview,
    };

    this.upsertBlackboardDiff(event.tick).writes.set(event.data.key, value);
    this.upsertBlackboardDiff(event.tick).deletes.delete(event.data.key);

    const history = this.blackboardHistory.get(event.data.key) ?? [];
    history.push({
      tick: event.tick,
      seq: event.seq,
      value,
      deleted: false,
    });
    this.blackboardHistory.set(event.data.key, history);
  }

  private applyBlackboardDelete(event: BlackboardDeleteEvent): void {
    this.upsertBlackboardDiff(event.tick).writes.delete(event.data.key);
    this.upsertBlackboardDiff(event.tick).deletes.add(event.data.key);

    const history = this.blackboardHistory.get(event.data.key) ?? [];
    history.push({
      tick: event.tick,
      seq: event.seq,
      deleted: true,
    });
    this.blackboardHistory.set(event.data.key, history);
  }

  private applyBlackboardSnapshot(event: BlackboardSnapshotEvent): void {
    this.blackboardSnapshots.push({
      tick: event.tick,
      values: new Map(Object.entries(event.data.values)),
    });

    this.blackboardSnapshots.sort((left, right) => left.tick - right.tick);
  }

  private upsertBlackboardDiff(tick: number): BlackboardDiffState {
    const existing = this.blackboardDiffByTick.get(tick);
    if (existing) {
      return existing;
    }

    const created: BlackboardDiffState = {
      writes: new Map<string, BlackboardValue>(),
      deletes: new Set<string>(),
    };
    this.blackboardDiffByTick.set(tick, created);
    return created;
  }

  private blackboardSnapshotFloorTick(tick: number): number {
    let floor = -1;

    for (const snapshot of this.blackboardSnapshots) {
      if (snapshot.tick <= tick) {
        floor = Math.max(floor, snapshot.tick);
      }
    }

    return floor;
  }

  private seedBlackboardState(tick: number): Map<string, BlackboardValue> {
    const state = new Map<string, BlackboardValue>();

    let candidate: { tick: number; values: Map<string, BlackboardValue> } | undefined;
    for (const snapshot of this.blackboardSnapshots) {
      if (snapshot.tick <= tick) {
        if (!candidate || snapshot.tick >= candidate.tick) {
          candidate = snapshot;
        }
      }
    }

    if (!candidate) {
      return state;
    }

    for (const [key, value] of candidate.values) {
      state.set(key, value);
    }

    return state;
  }
}
