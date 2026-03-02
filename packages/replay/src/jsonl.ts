import { parseEvent, tryParseEvent, type ValidatedMbtEvent } from '@muesli/protocol';

export interface JsonlParseError {
  line: number;
  message: string;
  raw: string;
}

export interface JsonlParseResult {
  events: ValidatedMbtEvent[];
  errors: JsonlParseError[];
}

export function parseJsonlEvents(text: string): JsonlParseResult {
  const events: ValidatedMbtEvent[] = [];
  const errors: JsonlParseError[] = [];

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid JSON';
      errors.push({ line: index + 1, message, raw: rawLine });
      continue;
    }

    const validation = tryParseEvent(parsed);
    if (validation.success) {
      events.push(validation.event);
      continue;
    }

    errors.push({ line: index + 1, message: validation.error, raw: rawLine });
  }

  return { events, errors };
}

export function parseJsonlStrict(text: string): ValidatedMbtEvent[] {
  const result = parseJsonlEvents(text);
  if (result.errors.length > 0) {
    const [first] = result.errors;
    if (first) {
      throw new Error(`line ${first.line}: ${first.message}`);
    }

    throw new Error('unknown JSONL parse error');
  }

  return result.events;
}

export async function parseJsonlStream(
  chunks: AsyncIterable<string | Uint8Array>,
  onEvent: (event: ValidatedMbtEvent) => void,
): Promise<void> {
  let buffer = '';

  for await (const chunk of chunks) {
    buffer += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const event = parseEvent(JSON.parse(trimmed) as unknown);
      onEvent(event);
    }
  }

  if (buffer.trim().length > 0) {
    const event = parseEvent(JSON.parse(buffer) as unknown);
    onEvent(event);
  }
}
