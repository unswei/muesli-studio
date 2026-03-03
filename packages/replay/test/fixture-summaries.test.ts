import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadBundle } from '../src';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');
const fixturesRoot = path.join(rootDir, 'tests', 'fixtures');
const schemaPath = path.join(fixturesRoot, 'schema', 'mbt.evt.v1.schema.json');

interface FixtureCase {
  name: string;
  bundleDir: string;
}

const fixtures: FixtureCase[] = [
  { name: 'budget_warning', bundleDir: path.join(fixturesRoot, 'budget_warning') },
  { name: 'deadline_cancel', bundleDir: path.join(fixturesRoot, 'deadline_cancel') },
  { name: 'determinism_replay', bundleDir: path.join(fixturesRoot, 'determinism_replay') },
];

describe('fixture bundle regression summaries', () => {
  for (const fixture of fixtures) {
    it(`matches expected summary for ${fixture.name}`, async () => {
      const loaded = await loadBundle(fixture.bundleDir, {
        schemaPath,
      });

      const expectedSummaryPath = path.join(fixture.bundleDir, 'expected_summary.json');
      const expectedSummary = JSON.parse(await readFile(expectedSummaryPath, 'utf8')) as unknown;

      expect(loaded.validation.ok).toBe(true);
      expect(loaded.summary).toEqual(expectedSummary);
    });
  }
});

