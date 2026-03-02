import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseJsonlEvents } from '@muesli/replay';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

describe('studio replay fixtures', () => {
  it('can parse the minimal replay fixture used by the file loader', () => {
    const raw = readFileSync(path.join(rootDir, 'tools', 'fixtures', 'minimal_run.jsonl'), 'utf8');
    const parsed = parseJsonlEvents(raw);

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.events.length).toBeGreaterThan(5);
  });
});
