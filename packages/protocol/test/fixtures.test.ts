import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseEvent } from '../src/validate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readJsonlFixture(fileName: string): Promise<unknown[]> {
  const raw = await readFile(path.join(rootDir, 'tools', 'fixtures', fileName), 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe('protocol fixtures', () => {
  for (const fixture of ['minimal_run.jsonl', 'planner_run.jsonl', 'scheduler_run.jsonl']) {
    it(`validates ${fixture}`, async () => {
      const events = await readJsonlFixture(fixture);
      expect(events.length).toBeGreaterThan(0);

      for (const event of events) {
        expect(() => parseEvent(event)).not.toThrow();
      }
    });
  }
});
