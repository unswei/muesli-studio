export interface RunEventRecord {
  schema: string;
  contract_version?: string;
  type: string;
  run_id: string;
  unix_ms: number;
  seq: number;
  tick?: number;
  data: Record<string, unknown>;
}

export interface RunSummary {
  contract_version: string;
  schema_version: string;
  event_counts: Record<string, number>;
  ticks: {
    count: number;
    min_duration_ms: number | null;
    max_duration_ms: number | null;
    mean_duration_ms: number | null;
  };
  node_status_counts: Record<string, number>;
  async_jobs: {
    sched: {
      submit: number;
      start: number;
      cancel: number;
      finish: number;
      terminal_states: Record<string, number>;
    };
    vla: {
      submit: number;
      poll: number;
      cancel: number;
      result: number;
      terminal_states: Record<string, number>;
    };
  };
  warnings: {
    budget_warning_count: number;
    deadline_exceeded_count: number;
  };
  digest: string;
}

export interface SummariseRunOptions {
  contractVersion?: string;
  schemaVersion?: string;
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`);
  return `{${entries.join(',')}}`;
}

function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (const char of text) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }

  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function detectBudgetWarning(event: RunEventRecord): boolean {
  if (event.type === 'error') {
    const code = String(event.data.code ?? '').toLowerCase();
    const message = String(event.data.message ?? '').toLowerCase();
    return code.includes('budget') || message.includes('budget');
  }

  if (event.type !== 'tick_end') {
    return false;
  }

  const budget = event.data.budget;
  if (!budget || typeof budget !== 'object') {
    return false;
  }

  const budgetRecord = budget as Record<string, unknown>;
  const budgetMs = numberFromUnknown(budgetRecord.tick_budget_ms);
  const usedMs = numberFromUnknown(budgetRecord.tick_time_ms);
  if (budgetMs === null || usedMs === null) {
    return false;
  }

  return usedMs > budgetMs;
}

function detectDeadlineExceeded(event: RunEventRecord): boolean {
  if (event.type === 'error') {
    const code = String(event.data.code ?? '').toLowerCase();
    const message = String(event.data.message ?? '').toLowerCase();
    return code.includes('deadline') || message.includes('deadline');
  }

  if (event.type === 'sched_cancel' || event.type === 'vla_cancel') {
    const reason = String((event.data as Record<string, unknown>).reason ?? '').toLowerCase();
    return reason.includes('deadline');
  }

  return false;
}

function tickDurationMs(event: RunEventRecord): number | null {
  if (event.type !== 'tick_end') {
    return null;
  }

  const directDuration = numberFromUnknown(event.data.tick_ms);
  if (directDuration !== null) {
    return directDuration;
  }

  const budget = event.data.budget;
  if (!budget || typeof budget !== 'object') {
    return null;
  }

  return numberFromUnknown((budget as Record<string, unknown>).tick_time_ms);
}

export function summariseRun(events: readonly RunEventRecord[], options: SummariseRunOptions = {}): RunSummary {
  const eventCounts: Record<string, number> = {};
  const nodeStatusCounts: Record<string, number> = {};
  const schedTerminalStates: Record<string, number> = {};
  const vlaTerminalStates: Record<string, number> = {};
  const durations: number[] = [];

  let budgetWarningCount = 0;
  let deadlineExceededCount = 0;

  const asyncJobs = {
    sched: {
      submit: 0,
      start: 0,
      cancel: 0,
      finish: 0,
    },
    vla: {
      submit: 0,
      poll: 0,
      cancel: 0,
      result: 0,
    },
  };

  for (const event of events) {
    increment(eventCounts, event.type);

    if (event.type === 'node_status') {
      const status = String((event.data as Record<string, unknown>).status ?? 'unknown');
      increment(nodeStatusCounts, status);
    }

    if (detectBudgetWarning(event)) {
      budgetWarningCount += 1;
    }

    if (detectDeadlineExceeded(event)) {
      deadlineExceededCount += 1;
    }

    const duration = tickDurationMs(event);
    if (duration !== null) {
      durations.push(duration);
    }

    if (event.type === 'sched_submit') {
      asyncJobs.sched.submit += 1;
    } else if (event.type === 'sched_start') {
      asyncJobs.sched.start += 1;
    } else if (event.type === 'sched_cancel') {
      asyncJobs.sched.cancel += 1;
      increment(schedTerminalStates, 'cancelled');
    } else if (event.type === 'sched_finish') {
      asyncJobs.sched.finish += 1;
      const status = String((event.data as Record<string, unknown>).status ?? 'unknown');
      increment(schedTerminalStates, status);
    } else if (event.type === 'vla_submit') {
      asyncJobs.vla.submit += 1;
    } else if (event.type === 'vla_poll') {
      asyncJobs.vla.poll += 1;
    } else if (event.type === 'vla_cancel') {
      asyncJobs.vla.cancel += 1;
      increment(vlaTerminalStates, 'cancelled');
    } else if (event.type === 'vla_result') {
      asyncJobs.vla.result += 1;
      const status = String((event.data as Record<string, unknown>).status ?? 'unknown');
      increment(vlaTerminalStates, status);
    }
  }

  const durationSum = durations.reduce((sum, value) => sum + value, 0);
  const minDuration = durations.length > 0 ? Math.min(...durations) : null;
  const maxDuration = durations.length > 0 ? Math.max(...durations) : null;
  const meanDuration = durations.length > 0 ? durationSum / durations.length : null;

  const schemaVersion = options.schemaVersion ?? events[0]?.schema ?? 'mbt.evt.v1';
  const contractVersion = options.contractVersion ?? 'runtime-contract-v1';
  const normalisedDigestText = events.map((event) => stableStringify(event)).join('\n');

  return {
    contract_version: contractVersion,
    schema_version: schemaVersion,
    event_counts: eventCounts,
    ticks: {
      count: durations.length,
      min_duration_ms: minDuration,
      max_duration_ms: maxDuration,
      mean_duration_ms: meanDuration,
    },
    node_status_counts: nodeStatusCounts,
    async_jobs: {
      sched: {
        ...asyncJobs.sched,
        terminal_states: schedTerminalStates,
      },
      vla: {
        ...asyncJobs.vla,
        terminal_states: vlaTerminalStates,
      },
    },
    warnings: {
      budget_warning_count: budgetWarningCount,
      deadline_exceeded_count: deadlineExceededCount,
    },
    digest: fnv1a64(normalisedDigestText),
  };
}
