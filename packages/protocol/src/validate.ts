import { z } from 'zod';

export const EVENT_SCHEMA = 'mbt.evt.v1' as const;

export const eventTypeValues = [
  'run_start',
  'bt_def',
  'tick_begin',
  'tick_end',
  'node_enter',
  'node_exit',
  'node_status',
  'budget_warning',
  'deadline_exceeded',
  'bb_write',
  'bb_delete',
  'bb_snapshot',
  'sched_submit',
  'sched_start',
  'sched_finish',
  'sched_cancel',
  'planner_call_start',
  'planner_call_end',
  'planner_v1',
  'vla_submit',
  'vla_poll',
  'vla_cancel',
  'vla_result',
  'async_cancel_requested',
  'async_cancel_acknowledged',
  'async_completion_dropped',
  'error',
] as const;

export const statusValues = ['idle', 'running', 'success', 'failure', 'skipped'] as const;
export const severityValues = ['info', 'warning', 'error', 'fatal'] as const;
export const outcomeValues = ['ok', 'error', 'timeout', 'cancelled', 'failed'] as const;

const stringOrIntIdSchema = z.union([z.string().min(1), z.number().int().nonnegative()]);

const envelopeSchema = z.object({
  schema: z.literal(EVENT_SCHEMA),
  run_id: z.string().min(1),
  unix_ms: z.number().int(),
  seq: z.number().int().positive(),
  tick: z.number().int().nonnegative().optional(),
});

const runStartSchema = envelopeSchema.extend({
  type: z.literal('run_start'),
  data: z
    .object({
      git_sha: z.string().min(1),
      tick_hz: z.number().positive(),
      tree_hash: z.string().min(1),
      host: z.union([
        z.string().min(1),
        z
          .object({
            name: z.string().min(1),
            version: z.string().min(1),
            platform: z.string().min(1),
          })
          .passthrough(),
      ]),
      capabilities: z.record(z.unknown()).optional(),
      backend: z.string().optional(),
    })
    .passthrough(),
});

const btNodeSchema = z
  .object({
    id: stringOrIntIdSchema,
    name: z.string().min(1),
    kind: z.string().min(1),
    parent_id: stringOrIntIdSchema.optional(),
    source: z.string().optional(),
  })
  .passthrough();

const btEdgeSchema = z
  .object({
    from: stringOrIntIdSchema.optional(),
    to: stringOrIntIdSchema.optional(),
    parent: stringOrIntIdSchema.optional(),
    child: stringOrIntIdSchema.optional(),
    index: z.number().int().nonnegative().optional(),
  })
  .passthrough()
  .refine((edge) => {
    const hasFromTo = edge.from !== undefined && edge.to !== undefined;
    const hasParentChild = edge.parent !== undefined && edge.child !== undefined;
    return hasFromTo || hasParentChild;
  }, 'bt_def edge must contain from/to or parent/child');

const btDefSchema = envelopeSchema.extend({
  type: z.literal('bt_def'),
  data: z
    .object({
      nodes: z.array(btNodeSchema),
      edges: z.array(btEdgeSchema),
      dsl: z.string().optional(),
      tree_name: z.string().optional(),
      tree_hash: z.string().optional(),
    })
    .passthrough(),
});

const tickBeginSchema = envelopeSchema.extend({
  type: z.literal('tick_begin'),
  tick: z.number().int().nonnegative(),
  data: z.record(z.unknown()),
});

const tickEndSchema = envelopeSchema.extend({
  type: z.literal('tick_end'),
  tick: z.number().int().nonnegative(),
  data: z.record(z.unknown()),
});

const nodeStatusSchema = envelopeSchema.extend({
  type: z.literal('node_status'),
  tick: z.number().int().nonnegative(),
  data: z
    .object({
      node_id: stringOrIntIdSchema,
      status: z.enum(statusValues),
      outcome: z.union([z.enum(outcomeValues), z.string().min(1)]).optional(),
      message: z.string().optional(),
      duration_ms: z.number().nonnegative().optional(),
      dur_ms: z.number().nonnegative().optional(),
    })
    .passthrough(),
});

const nodeEnterSchema = envelopeSchema.extend({
  type: z.literal('node_enter'),
  tick: z.number().int().nonnegative(),
  data: z
    .object({
      node_id: stringOrIntIdSchema,
    })
    .passthrough(),
});

const nodeExitSchema = envelopeSchema.extend({
  type: z.literal('node_exit'),
  tick: z.number().int().nonnegative(),
  data: z
    .object({
      node_id: stringOrIntIdSchema,
      status: z.enum(statusValues).optional(),
      dur_ms: z.number().nonnegative().optional(),
    })
    .passthrough(),
});

const budgetWarningSchema = envelopeSchema.extend({
  type: z.literal('budget_warning'),
  data: z.record(z.unknown()),
});

const deadlineExceededSchema = envelopeSchema.extend({
  type: z.literal('deadline_exceeded'),
  data: z.record(z.unknown()),
});

const bbWriteSchema = envelopeSchema.extend({
  type: z.literal('bb_write'),
  tick: z.number().int().nonnegative(),
  data: z
    .object({
      key: z.string().min(1),
      digest: z.string().min(1).optional(),
      value_digest: z.string().min(1).optional(),
      preview: z.unknown().optional(),
    })
    .passthrough()
    .refine((data) => data.digest !== undefined || data.value_digest !== undefined, {
      message: 'bb_write requires digest or value_digest',
    }),
});

const bbDeleteSchema = envelopeSchema.extend({
  type: z.literal('bb_delete'),
  tick: z.number().int().nonnegative(),
  data: z
    .object({
      key: z.string().min(1),
      reason: z.string().optional(),
    })
    .passthrough(),
});

const bbSnapshotSchema = envelopeSchema.extend({
  type: z.literal('bb_snapshot'),
  tick: z.number().int().nonnegative(),
  data: z
    .object({
      values: z.record(z.unknown()).optional(),
      entries: z.array(z.tuple([z.string(), z.unknown()])).optional(),
    })
    .passthrough()
    .refine((data) => data.values !== undefined || data.entries !== undefined, {
      message: 'bb_snapshot requires values or entries',
    }),
});

const schedSubmitSchema = envelopeSchema.extend({
  type: z.literal('sched_submit'),
  data: z.record(z.unknown()),
});

const schedStartSchema = envelopeSchema.extend({
  type: z.literal('sched_start'),
  data: z.record(z.unknown()),
});

const schedFinishSchema = envelopeSchema.extend({
  type: z.literal('sched_finish'),
  data: z.record(z.unknown()),
});

const schedCancelSchema = envelopeSchema.extend({
  type: z.literal('sched_cancel'),
  data: z.record(z.unknown()),
});

const plannerCallStartSchema = envelopeSchema.extend({
  type: z.literal('planner_call_start'),
  tick: z.number().int().nonnegative(),
  data: z.record(z.unknown()),
});

const plannerCallEndSchema = envelopeSchema.extend({
  type: z.literal('planner_call_end'),
  tick: z.number().int().nonnegative(),
  data: z.record(z.unknown()),
});

const plannerV1Schema = envelopeSchema.extend({
  type: z.literal('planner_v1'),
  data: z.record(z.unknown()),
});

const vlaSubmitSchema = envelopeSchema.extend({
  type: z.literal('vla_submit'),
  data: z.record(z.unknown()),
});

const vlaPollSchema = envelopeSchema.extend({
  type: z.literal('vla_poll'),
  data: z.record(z.unknown()),
});

const vlaCancelSchema = envelopeSchema.extend({
  type: z.literal('vla_cancel'),
  data: z.record(z.unknown()),
});

const vlaResultSchema = envelopeSchema.extend({
  type: z.literal('vla_result'),
  data: z.record(z.unknown()),
});

const asyncCancelRequestedSchema = envelopeSchema.extend({
  type: z.literal('async_cancel_requested'),
  data: z.record(z.unknown()),
});

const asyncCancelAcknowledgedSchema = envelopeSchema.extend({
  type: z.literal('async_cancel_acknowledged'),
  data: z.record(z.unknown()),
});

const asyncCompletionDroppedSchema = envelopeSchema.extend({
  type: z.literal('async_completion_dropped'),
  data: z.record(z.unknown()),
});

const errorSchema = envelopeSchema.extend({
  type: z.literal('error'),
  data: z
    .object({
      severity: z.union([z.enum(severityValues), z.string().min(1)]),
      message: z.string().min(1),
      code: z.string().optional(),
      component: z.string().optional(),
      node_id: stringOrIntIdSchema.optional(),
    })
    .passthrough(),
});

export const mbtEventSchema = z.discriminatedUnion('type', [
  runStartSchema,
  btDefSchema,
  tickBeginSchema,
  tickEndSchema,
  nodeEnterSchema,
  nodeExitSchema,
  nodeStatusSchema,
  budgetWarningSchema,
  deadlineExceededSchema,
  bbWriteSchema,
  bbDeleteSchema,
  bbSnapshotSchema,
  schedSubmitSchema,
  schedStartSchema,
  schedFinishSchema,
  schedCancelSchema,
  plannerCallStartSchema,
  plannerCallEndSchema,
  plannerV1Schema,
  vlaSubmitSchema,
  vlaPollSchema,
  vlaCancelSchema,
  vlaResultSchema,
  asyncCancelRequestedSchema,
  asyncCancelAcknowledgedSchema,
  asyncCompletionDroppedSchema,
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
