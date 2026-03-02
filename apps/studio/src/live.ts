import { tryParseEvent, type ValidatedMbtEvent } from '@muesli/protocol';

export interface LiveParseIssue {
  message: string;
  raw: string;
}

export interface ParsedLivePayload {
  events: ValidatedMbtEvent[];
  issues: LiveParseIssue[];
}

export function parseLivePayload(payload: string): ParsedLivePayload {
  const events: ValidatedMbtEvent[] = [];
  const issues: LiveParseIssue[] = [];

  const lines = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid JSON payload';
      issues.push({ message, raw: line });
      continue;
    }

    const validation = tryParseEvent(parsed);
    if (validation.success) {
      events.push(validation.event);
      continue;
    }

    issues.push({ message: validation.error, raw: line });
  }

  return { events, issues };
}

export async function decodeWebSocketData(data: unknown): Promise<string> {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return data.text();
  }

  return String(data ?? '');
}
