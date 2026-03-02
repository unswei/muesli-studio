import { describe, expect, it } from 'vitest';

import { decodeWebSocketData, parseLivePayload } from './live';

describe('parseLivePayload', () => {
  it('parses newline-delimited event payloads', () => {
    const payload =
      '{"schema":"mbt.evt.v1","type":"tick_begin","run_id":"r","unix_ms":1,"seq":1,"tick":0,"data":{}}\n' +
      '{"schema":"mbt.evt.v1","type":"tick_end","run_id":"r","unix_ms":2,"seq":2,"tick":0,"data":{}}';

    const parsed = parseLivePayload(payload);
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events[0]?.type).toBe('tick_begin');
    expect(parsed.events[1]?.type).toBe('tick_end');
  });

  it('collects validation issues without dropping valid events', () => {
    const payload =
      '{"schema":"mbt.evt.v1","type":"tick_begin","run_id":"r","unix_ms":1,"seq":1,"tick":0,"data":{}}\n' +
      '{"schema":"mbt.evt.v1","type":"tick_begin"}';

    const parsed = parseLivePayload(payload);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.issues.length).toBeGreaterThan(0);
  });
});

describe('decodeWebSocketData', () => {
  it('handles string and ArrayBuffer payloads', async () => {
    const text = '{"a":1}';
    expect(await decodeWebSocketData(text)).toBe(text);

    const buffer = new TextEncoder().encode(text).buffer;
    expect(await decodeWebSocketData(buffer)).toBe(text);
  });
});
