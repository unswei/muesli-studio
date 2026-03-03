import { tryParseEvent, type ValidatedMbtEvent } from '@muesli/protocol';

import { parseJsonlEvents, type JsonlParseError, type JsonlParseResult } from '../jsonl';

export const TICK_SIDECAR_SCHEMA = 'mbt.sidecar.tick-index.v1' as const;

export interface TickIndexEntry {
  tick: number;
  byte_start: number;
  byte_end: number;
  line_start: number;
  first_seq: number;
}

export interface TickSidecarIndexV1 {
  schema: typeof TICK_SIDECAR_SCHEMA;
  source: string;
  event_count: number;
  max_tick: number;
  events_sha256?: string;
  tick_entries: TickIndexEntry[];
}

export interface SidecarLoadMetadata {
  index_used: boolean;
  warning: string | null;
  tick_entries: number;
  max_tick: number;
}

export interface JsonlParseWithSidecarResult extends JsonlParseResult {
  sidecar: SidecarLoadMetadata;
}

function parseTickEntry(raw: unknown, index: number): TickIndexEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`tick_entries[${index}] must be an object`);
  }

  const entry = raw as Record<string, unknown>;
  const tick = Number(entry.tick);
  const byteStart = Number(entry.byte_start);
  const byteEnd = Number(entry.byte_end);
  const lineStart = Number(entry.line_start);
  const firstSeq = Number(entry.first_seq);

  if (!Number.isInteger(tick) || tick < 0) {
    throw new Error(`tick_entries[${index}].tick must be a non-negative integer`);
  }

  if (!Number.isInteger(byteStart) || byteStart < 0) {
    throw new Error(`tick_entries[${index}].byte_start must be a non-negative integer`);
  }

  if (!Number.isInteger(byteEnd) || byteEnd < byteStart) {
    throw new Error(`tick_entries[${index}].byte_end must be an integer >= byte_start`);
  }

  if (!Number.isInteger(lineStart) || lineStart < 1) {
    throw new Error(`tick_entries[${index}].line_start must be an integer >= 1`);
  }

  if (!Number.isInteger(firstSeq) || firstSeq <= 0) {
    throw new Error(`tick_entries[${index}].first_seq must be a positive integer`);
  }

  return {
    tick,
    byte_start: byteStart,
    byte_end: byteEnd,
    line_start: lineStart,
    first_seq: firstSeq,
  };
}

export function parseTickSidecarIndex(text: string): TickSidecarIndexV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`sidecar parse failed: ${message}`);
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('sidecar root must be a JSON object');
  }

  const object = raw as Record<string, unknown>;
  if (object.schema !== TICK_SIDECAR_SCHEMA) {
    throw new Error(`sidecar schema must be ${TICK_SIDECAR_SCHEMA}`);
  }

  if (typeof object.source !== 'string' || object.source.length === 0) {
    throw new Error('sidecar source must be a non-empty string');
  }

  const eventCount = Number(object.event_count);
  if (!Number.isInteger(eventCount) || eventCount < 0) {
    throw new Error('sidecar event_count must be a non-negative integer');
  }

  const maxTick = Number(object.max_tick);
  if (!Number.isInteger(maxTick) || maxTick < 0) {
    throw new Error('sidecar max_tick must be a non-negative integer');
  }

  const rawEntries = object.tick_entries;
  if (!Array.isArray(rawEntries)) {
    throw new Error('sidecar tick_entries must be an array');
  }

  const tickEntries = rawEntries.map((entry, index) => parseTickEntry(entry, index));
  for (let index = 1; index < tickEntries.length; index += 1) {
    const prev = tickEntries[index - 1];
    const current = tickEntries[index];
    if (!prev || !current) {
      continue;
    }

    if (current.tick <= prev.tick) {
      throw new Error(`sidecar tick_entries must be ordered by increasing tick (index ${index})`);
    }

    if (current.byte_start < prev.byte_end) {
      throw new Error(`sidecar byte ranges overlap at tick_entries[${index}]`);
    }
  }

  const eventsSha256 = object.events_sha256;
  if (eventsSha256 !== undefined && (typeof eventsSha256 !== 'string' || eventsSha256.length === 0)) {
    throw new Error('sidecar events_sha256 must be a non-empty string when present');
  }

  return {
    schema: TICK_SIDECAR_SCHEMA,
    source: object.source,
    event_count: eventCount,
    max_tick: maxTick,
    events_sha256: eventsSha256 as string | undefined,
    tick_entries: tickEntries,
  };
}

function parseJsonlWithLineOffset(text: string, lineOffset: number): JsonlParseResult {
  const parsed = parseJsonlEvents(text);
  if (lineOffset <= 0 || parsed.errors.length === 0) {
    return parsed;
  }

  const shiftedErrors: JsonlParseError[] = parsed.errors.map((error) => ({
    ...error,
    line: error.line + lineOffset,
  }));
  return {
    events: parsed.events,
    errors: shiftedErrors,
  };
}

function parseRangeByBytes(buffer: Uint8Array, entry: TickIndexEntry): JsonlParseResult {
  const segment = new TextDecoder().decode(buffer.subarray(entry.byte_start, entry.byte_end));
  return parseJsonlWithLineOffset(segment, entry.line_start - 1);
}

export function buildTickSidecarIndex(eventsText: string, source = 'events.jsonl'): TickSidecarIndexV1 {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const buffer = encoder.encode(eventsText);
  const byTick = new Map<number, TickIndexEntry>();
  let eventCount = 0;
  let maxTick = 0;

  let lineNumber = 1;
  let lineStart = 0;
  for (let cursor = 0; cursor <= buffer.length; cursor += 1) {
    const atEnd = cursor === buffer.length;
    const isNewline = !atEnd && buffer[cursor] === 0x0a;
    if (!atEnd && !isNewline) {
      continue;
    }

    const rawLine = buffer.subarray(lineStart, cursor);
    const line = decoder.decode(rawLine).replace(/\r$/, '');
    if (line.trim().length > 0) {
      eventCount += 1;

      let payload: unknown;
      try {
        payload = JSON.parse(line) as unknown;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'invalid JSON';
        throw new Error(`cannot build sidecar: line ${lineNumber} JSON parse failed: ${message}`);
      }

      const parsed = tryParseEvent(payload);
      if (!parsed.success) {
        throw new Error(`cannot build sidecar: line ${lineNumber} event validation failed: ${parsed.error}`);
      }

      const event = parsed.event;
      if (typeof event.tick === 'number' && Number.isInteger(event.tick) && event.tick >= 0) {
        if (!byTick.has(event.tick)) {
          byTick.set(event.tick, {
            tick: event.tick,
            byte_start: lineStart,
            byte_end: buffer.length,
            line_start: lineNumber,
            first_seq: event.seq,
          });
        }
        maxTick = Math.max(maxTick, event.tick);
      }
    }

    lineStart = cursor + 1;
    lineNumber += 1;
  }

  const tickEntries = Array.from(byTick.values()).sort((left, right) => left.tick - right.tick);
  for (let index = 0; index < tickEntries.length; index += 1) {
    const current = tickEntries[index];
    if (!current) {
      continue;
    }

    const next = tickEntries[index + 1];
    current.byte_end = next?.byte_start ?? buffer.length;
  }

  return {
    schema: TICK_SIDECAR_SCHEMA,
    source,
    event_count: eventCount,
    max_tick: maxTick,
    tick_entries: tickEntries,
  };
}

export function parseJsonlEventsUsingSidecar(eventsText: string, index: TickSidecarIndexV1): JsonlParseResult {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const buffer = encoder.encode(eventsText);
  const allEvents: ValidatedMbtEvent[] = [];
  const allErrors: JsonlParseError[] = [];

  const firstTick = index.tick_entries[0];
  const bootstrapEnd = firstTick?.byte_start ?? buffer.length;
  if (bootstrapEnd > 0) {
    const bootstrapText = decoder.decode(buffer.subarray(0, bootstrapEnd));
    const bootstrapResult = parseJsonlEvents(bootstrapText);
    allEvents.push(...bootstrapResult.events);
    allErrors.push(...bootstrapResult.errors);
  }

  for (const entry of index.tick_entries) {
    const parsed = parseRangeByBytes(buffer, entry);
    allEvents.push(...parsed.events);
    allErrors.push(...parsed.errors);
  }

  return {
    events: allEvents,
    errors: allErrors,
  };
}

export function parseJsonlEventsWithOptionalSidecar(eventsText: string, sidecarText?: string | null): JsonlParseWithSidecarResult {
  if (!sidecarText || sidecarText.trim().length === 0) {
    const parsed = parseJsonlEvents(eventsText);
    return {
      ...parsed,
      sidecar: {
        index_used: false,
        warning: null,
        tick_entries: 0,
        max_tick: 0,
      },
    };
  }

  try {
    const index = parseTickSidecarIndex(sidecarText);
    const parsed = parseJsonlEventsUsingSidecar(eventsText, index);
    return {
      ...parsed,
      sidecar: {
        index_used: true,
        warning: null,
        tick_entries: index.tick_entries.length,
        max_tick: index.max_tick,
      },
    };
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    const parsed = parseJsonlEvents(eventsText);
    return {
      ...parsed,
      sidecar: {
        index_used: false,
        warning: `sidecar ignored: ${warning}`,
        tick_entries: 0,
        max_tick: 0,
      },
    };
  }
}

export function extractTickEventsBySidecar(eventsText: string, index: TickSidecarIndexV1, tick: number): ValidatedMbtEvent[] {
  const entry = index.tick_entries.find((candidate) => candidate.tick === tick);
  if (!entry) {
    return [];
  }

  const parsed = parseRangeByBytes(new TextEncoder().encode(eventsText), entry);
  return parsed.events.filter((event) => event.tick === tick);
}
