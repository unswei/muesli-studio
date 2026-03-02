import { z } from 'zod';

export const EVENT_SCHEMA = 'mbt.evt.v1' as const;

export const eventTypeValues = [
  'run_start',
  'bt_def',
  'tick_begin',
  'tick_end',
  'node_status',
  'bb_write',
  'bb_delete',
  'bb_snapshot',
  'sched_submit',
  'sched_start',
  'sched_finish',
  'sched_cancel',
  'planner_v1',
  'vla_submit',
  'vla_poll',
  'vla_cancel',
  'vla_result',
  'error',
] as const;

export const statusValues = ['idle', 'running', 'success', 'failure', 'skipped'] as const;
export const severityValues = ['info', 'warning', 'error', 'fatal'] as const;
export const outcomeValues = ['ok', 'error', 'timeout', 'cancelled'] as const;

const envelopeSchema = z.object({
  schema: z.literal(EVENT_SCHEMA),
  run_id: z.string().min(1),
  unix_ms: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  tick: z.number().int().nonnegative().optional(),
});

const btNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  parent_id: z.string().optional(),
  source: z.string().optional(),
});

const btEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const blackboardValueSchema = z.object({
  digest: z.string().min(1),
  preview: z.string().optional(),
});

const runStartSchema = envelopeSchema.extend({
  type: z.literal('run_start'),
  data: z.object({
    git_sha: z.string().min(1),
    host: z.string().min(1),
    tick_hz: z.number().positive(),
    tree_hash: z.string().min(1),
    backend: z.string().optional(),
  }),
});

const btDefSchema = envelopeSchema.extend({
  type: z.literal('bt_def'),
  data: z.object({
    nodes: z.array(btNodeSchema),
    edges: z.array(btEdgeSchema),
    dsl: z.string().optional(),
  }),
});

const tickBeginSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('tick_begin'),
  data: z.object({
    wall_ms: z.number().nonnegative().optional(),
  }),
});

const tickEndSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('tick_end'),
  data: z.object({
    wall_ms: z.number().nonnegative().optional(),
  }),
});

const nodeStatusSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('node_status'),
  data: z.object({
    node_id: z.string().min(1),
    status: z.enum(statusValues),
    outcome: z.enum(outcomeValues).optional(),
    duration_ms: z.number().nonnegative().optional(),
    message: z.string().optional(),
  }),
});

const bbWriteSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('bb_write'),
  data: z.object({
    key: z.string().min(1),
    digest: z.string().min(1),
    preview: z.string().optional(),
  }),
});

const bbDeleteSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('bb_delete'),
  data: z.object({
    key: z.string().min(1),
    reason: z.string().optional(),
  }),
});

const bbSnapshotSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('bb_snapshot'),
  data: z.object({
    values: z.record(blackboardValueSchema),
  }),
});

const schedSubmitSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('sched_submit'),
  data: z.object({
    job_id: z.string().min(1),
    node_id: z.string().optional(),
    queue: z.string().optional(),
  }),
});

const schedStartSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('sched_start'),
  data: z.object({
    job_id: z.string().min(1),
    worker: z.string().optional(),
  }),
});

const schedFinishSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('sched_finish'),
  data: z.object({
    job_id: z.string().min(1),
    outcome: z.enum(outcomeValues),
    duration_ms: z.number().nonnegative().optional(),
  }),
});

const schedCancelSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('sched_cancel'),
  data: z.object({
    job_id: z.string().min(1),
    reason: z.string().optional(),
  }),
});

const plannerV1Schema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('planner_v1'),
  data: z.object({
    budget_ms: z.number().nonnegative(),
    time_used_ms: z.number().nonnegative(),
    confidence: z.number().min(0).max(1),
    summary: z.string().optional(),
  }),
});

const vlaSubmitSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('vla_submit'),
  data: z.object({
    request_id: z.string().min(1),
    service: z.string().min(1),
    prompt: z.string().optional(),
  }),
});

const vlaPollSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('vla_poll'),
  data: z.object({
    request_id: z.string().min(1),
    status: z.enum(statusValues).optional(),
  }),
});

const vlaCancelSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('vla_cancel'),
  data: z.object({
    request_id: z.string().min(1),
    reason: z.string().optional(),
  }),
});

const vlaResultSchema = envelopeSchema.extend({
  tick: z.number().int().nonnegative(),
  type: z.literal('vla_result'),
  data: z.object({
    request_id: z.string().min(1),
    outcome: z.enum(outcomeValues),
    summary: z.string().optional(),
  }),
});

const errorSchema = envelopeSchema.extend({
  type: z.literal('error'),
  data: z.object({
    severity: z.enum(severityValues),
    message: z.string().min(1),
    code: z.string().optional(),
    node_id: z.string().optional(),
  }),
});

export const mbtEventSchema = z.discriminatedUnion('type', [
  runStartSchema,
  btDefSchema,
  tickBeginSchema,
  tickEndSchema,
  nodeStatusSchema,
  bbWriteSchema,
  bbDeleteSchema,
  bbSnapshotSchema,
  schedSubmitSchema,
  schedStartSchema,
  schedFinishSchema,
  schedCancelSchema,
  plannerV1Schema,
  vlaSubmitSchema,
  vlaPollSchema,
  vlaCancelSchema,
  vlaResultSchema,
  errorSchema,
]);

export type ValidatedMbtEvent = z.infer<typeof mbtEventSchema>;

export function parseEvent(input: unknown): ValidatedMbtEvent {
  return mbtEventSchema.parse(input);
}

export function tryParseEvent(input: unknown): { success: true; event: ValidatedMbtEvent } | { success: false; error: string } {
  const result = mbtEventSchema.safeParse(input);
  if (result.success) {
    return { success: true, event: result.data };
  }

  return {
    success: false,
    error: result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; '),
  };
}

export function isMbtEvent(input: unknown): input is ValidatedMbtEvent {
  return mbtEventSchema.safeParse(input).success;
}
