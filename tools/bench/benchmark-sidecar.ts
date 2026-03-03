import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import {
  extractTickEventsBySidecar,
  parseJsonlEvents,
  parseJsonlEventsWithOptionalSidecar,
  parseTickSidecarIndex,
} from '@muesli/replay';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const fixtureDir = path.join(rootDir, 'tests', 'fixtures', 'large_replay');
const eventsPath = path.join(fixtureDir, 'events.jsonl');
const sidecarPath = path.join(fixtureDir, 'events.sidecar.tick-index.v1.json');
const outputPath = path.join(rootDir, 'tests', 'benchmarks', 'sidecar-large_replay.json');

function deterministicSampleTicks(maxTick: number, count: number): number[] {
  const ticks = new Set<number>();
  let state = 20260303;
  while (ticks.size < count) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    ticks.add((state % maxTick) + 1);
  }
  return Array.from(ticks.values()).sort((left, right) => left - right);
}

function roundMs(value: number): number {
  return Number(value.toFixed(3));
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fullScanTickCount(eventsText: string, tick: number): number {
  const parsed = parseJsonlEvents(eventsText);
  return parsed.events.filter((event) => event.tick === tick).length;
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  const eventsText = await readFile(eventsPath, 'utf8');
  const sidecarText = await readFile(sidecarPath, 'utf8');
  const sidecar = parseTickSidecarIndex(sidecarText);

  const eventsSha256 = createHash('sha256').update(eventsText, 'utf8').digest('hex');
  const sampleTicks = deterministicSampleTicks(sidecar.max_tick, 64);

  const parseStart = performance.now();
  const parsed = parseJsonlEvents(eventsText);
  const parseMs = performance.now() - parseStart;
  if (parsed.errors.length > 0) {
    throw new Error(`full parse produced ${parsed.errors.length} errors`);
  }

  const indexedParseStart = performance.now();
  const parsedWithSidecar = parseJsonlEventsWithOptionalSidecar(eventsText, sidecarText);
  const indexedParseMs = performance.now() - indexedParseStart;
  if (parsedWithSidecar.errors.length > 0) {
    throw new Error(`indexed parse produced ${parsedWithSidecar.errors.length} errors`);
  }

  const fullSeekMs: number[] = [];
  const indexedSeekMs: number[] = [];
  let parityMismatches = 0;
  for (const tick of sampleTicks) {
    const fullStart = performance.now();
    const fullCount = fullScanTickCount(eventsText, tick);
    fullSeekMs.push(performance.now() - fullStart);

    const indexedStart = performance.now();
    const indexedCount = extractTickEventsBySidecar(eventsText, sidecar, tick).length;
    indexedSeekMs.push(performance.now() - indexedStart);

    if (fullCount !== indexedCount) {
      parityMismatches += 1;
    }
  }

  const report = {
    schema: 'mbt.sidecar.benchmark.v1',
    fixture: 'tests/fixtures/large_replay/events.jsonl',
    sidecar: 'tests/fixtures/large_replay/events.sidecar.tick-index.v1.json',
    events_sha256: eventsSha256,
    event_count: parsed.events.length,
    max_tick: sidecar.max_tick,
    sample_ticks: sampleTicks,
    metrics: {
      cold_parse_ms: roundMs(parseMs),
      indexed_parse_ms: roundMs(indexedParseMs),
      full_scan_seek_mean_ms: roundMs(mean(fullSeekMs)),
      indexed_seek_mean_ms: roundMs(mean(indexedSeekMs)),
      full_scan_seek_max_ms: roundMs(Math.max(...fullSeekMs)),
      indexed_seek_max_ms: roundMs(Math.max(...indexedSeekMs)),
    },
    parity: {
      indexed_matches_full_parse: parsedWithSidecar.events.length === parsed.events.length,
      seek_count_mismatches: parityMismatches,
    },
    env: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };

  if (checkOnly) {
    if (!report.parity.indexed_matches_full_parse || report.parity.seek_count_mismatches > 0) {
      throw new Error('sidecar benchmark parity checks failed');
    }
    console.log('sidecar benchmark check passed');
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`wrote ${path.relative(rootDir, outputPath)}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
