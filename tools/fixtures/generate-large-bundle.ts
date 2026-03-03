import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTickSidecarIndex, loadBundle, type RunEventRecord } from '@muesli/replay/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

const fixtureDir = path.join(rootDir, 'tests', 'fixtures', 'large_replay');
const TICK_COUNT = 5_000;
const TICK_BUDGET_MS = 20;
const BASE_UNIX_MS = 1735689608000;
const CONTRACT_ID = 'runtime-contract-v1.0.0';
const CONTRACT_VERSION = '1.0.0';
const RUN_ID = 'fixture-large-replay';

function nextTickDurationMs(tick: number): number {
  const fractional = ((tick * 17) % 100) / 100;
  return 2 + fractional;
}

function makeRunStart(): RunEventRecord {
  return {
    schema: 'mbt.evt.v1',
    contract_version: CONTRACT_VERSION,
    type: 'run_start',
    run_id: RUN_ID,
    unix_ms: BASE_UNIX_MS,
    seq: 1,
    data: {
      git_sha: 'fixture',
      host: {
        name: 'muesli-bt',
        version: '0.1.0',
        platform: 'linux',
      },
      contract_version: CONTRACT_VERSION,
      contract_id: CONTRACT_ID,
      tick_hz: 50,
      tree_hash: 'fnv1a64:4444444444444444',
      capabilities: {
        reset: true,
      },
    },
  };
}

function makeBtDef(seq: number): RunEventRecord {
  return {
    schema: 'mbt.evt.v1',
    contract_version: CONTRACT_VERSION,
    type: 'bt_def',
    run_id: RUN_ID,
    unix_ms: BASE_UNIX_MS + 1,
    seq,
    data: {
      tree_name: 'bt',
      dsl: '(bt (seq (act plan) (act execute)))',
      tree_hash: 'fnv1a64:4444444444444444',
      nodes: [
        { id: 1, kind: 'seq', name: 'root' },
        { id: 2, kind: 'act', name: 'plan' },
      ],
      edges: [{ parent: 1, child: 2, index: 0 }],
    },
  };
}

function createEvents(): RunEventRecord[] {
  const events: RunEventRecord[] = [];
  events.push(makeRunStart());
  events.push(makeBtDef(2));

  let seq = 3;
  let unixMs = BASE_UNIX_MS + 2;
  for (let tick = 1; tick <= TICK_COUNT; tick += 1) {
    const plannerWork = 32 + (tick % 256);
    const tickDurationMs = nextTickDurationMs(tick);
    const isFinalTick = tick === TICK_COUNT;
    const nodeStatus = isFinalTick ? 'success' : 'running';
    const rootStatus = isFinalTick ? 'success' : 'running';

    events.push({
      schema: 'mbt.evt.v1',
      contract_version: CONTRACT_VERSION,
      type: 'tick_begin',
      run_id: RUN_ID,
      unix_ms: unixMs,
      seq,
      tick,
      data: {
        tick_budget_ms: TICK_BUDGET_MS,
      },
    });
    seq += 1;
    unixMs += 1;

    events.push({
      schema: 'mbt.evt.v1',
      contract_version: CONTRACT_VERSION,
      type: 'node_enter',
      run_id: RUN_ID,
      unix_ms: unixMs,
      seq,
      tick,
      data: {
        node_id: 1,
      },
    });
    seq += 1;
    unixMs += 1;

    events.push({
      schema: 'mbt.evt.v1',
      contract_version: CONTRACT_VERSION,
      type: 'planner_call_start',
      run_id: RUN_ID,
      unix_ms: unixMs,
      seq,
      tick,
      data: {
        node_id: 2,
        planner: 'mcts',
        budget_ms: 12,
      },
    });
    seq += 1;
    unixMs += 1;

    events.push({
      schema: 'mbt.evt.v1',
      contract_version: CONTRACT_VERSION,
      type: 'planner_call_end',
      run_id: RUN_ID,
      unix_ms: unixMs,
      seq,
      tick,
      data: {
        node_id: 2,
        planner: 'mcts',
        status: 'ok',
        time_used_ms: 2,
        work_done: plannerWork,
      },
    });
    seq += 1;
    unixMs += 1;

    events.push({
      schema: 'mbt.evt.v1',
      contract_version: CONTRACT_VERSION,
      type: 'node_exit',
      run_id: RUN_ID,
      unix_ms: unixMs,
      seq,
      tick,
      data: {
        node_id: 1,
        status: nodeStatus,
        dur_ms: Number((tickDurationMs - 0.1).toFixed(2)),
      },
    });
    seq += 1;
    unixMs += 1;

    events.push({
      schema: 'mbt.evt.v1',
      contract_version: CONTRACT_VERSION,
      type: 'tick_end',
      run_id: RUN_ID,
      unix_ms: unixMs,
      seq,
      tick,
      data: {
        root_status: rootStatus,
        tick_ms: Number(tickDurationMs.toFixed(2)),
        tick_budget_ms: TICK_BUDGET_MS,
      },
    });
    seq += 1;
    unixMs += 1;
  }

  return events;
}

async function main(): Promise<void> {
  await mkdir(fixtureDir, { recursive: true });

  const events = createEvents();
  const eventLines = events.map((event) => JSON.stringify(event));
  const eventsText = `${eventLines.join('\n')}\n`;
  const eventsSha256 = createHash('sha256').update(eventsText, 'utf8').digest('hex');

  const manifest = {
    contract_id: CONTRACT_ID,
    contract_version: CONTRACT_VERSION,
    fixture_name: 'large-replay-case',
    generated_from_commit_time_utc: '2026-03-03T00:00:00Z',
    generator: 'tools/fixtures/generate-large-bundle.ts',
    git_sha: 'fixture',
    provenance_model: 'deterministic-from-seed',
    schema: 'mbt.evt.v1',
    schema_path: 'tests/fixtures/schema/mbt.evt.v1.schema.json',
  };

  const config = {
    deterministic_mode: true,
    scenario: 'large_replay_sidecar_baseline',
    tick_budget_ms: TICK_BUDGET_MS,
    tick_count: TICK_COUNT,
  };

  const seed = {
    seed: 7001,
  };

  const expectedMetrics = {
    event_count: events.length,
    max_tick: TICK_COUNT,
    events_sha256: eventsSha256,
    required_types: ['run_start', 'bt_def', 'tick_begin', 'node_enter', 'planner_call_start', 'planner_call_end', 'node_exit', 'tick_end'],
  };

  await writeFile(path.join(fixtureDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(path.join(fixtureDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await writeFile(path.join(fixtureDir, 'seed.json'), `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
  await writeFile(path.join(fixtureDir, 'events.jsonl'), eventsText, 'utf8');
  await writeFile(path.join(fixtureDir, 'expected_metrics.json'), `${JSON.stringify(expectedMetrics, null, 2)}\n`, 'utf8');

  const sidecar = buildTickSidecarIndex(eventsText, 'events.jsonl');
  sidecar.events_sha256 = eventsSha256;
  await writeFile(path.join(fixtureDir, 'events.sidecar.tick-index.v1.json'), `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');

  const loaded = await loadBundle(fixtureDir, {
    skipValidation: true,
  });
  await writeFile(path.join(fixtureDir, 'expected_summary.json'), `${JSON.stringify(loaded.summary, null, 2)}\n`, 'utf8');

  console.log(`generated ${events.length} events at ${path.relative(rootDir, fixtureDir)}/events.jsonl`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
