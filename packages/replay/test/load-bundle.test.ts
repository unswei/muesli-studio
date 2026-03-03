import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BundleLoadError, loadBundle } from '../src';

async function writeBundleFile(bundleDir: string, fileName: string, body: string): Promise<void> {
  await writeFile(path.join(bundleDir, fileName), body, 'utf8');
}

function validManifest(): string {
  return JSON.stringify(
    {
      contract_id: 'runtime-contract-v1.0.0',
      contract_version: '1.0.0',
      fixture_name: 'fixture-test',
      schema: 'mbt.evt.v1',
    },
    null,
    2,
  );
}

function validEvents(): string {
  return [
    JSON.stringify({
      schema: 'mbt.evt.v1',
      contract_version: '1.0.0',
      type: 'run_start',
      run_id: 'fixture-test',
      unix_ms: 1,
      seq: 1,
      data: {
        git_sha: 'fixture',
        host: { name: 'fixture', version: '1', platform: 'test' },
        tick_hz: 20,
        tree_hash: 'tree',
        capabilities: { reset: true },
      },
    }),
    JSON.stringify({
      schema: 'mbt.evt.v1',
      contract_version: '1.0.0',
      type: 'tick_end',
      run_id: 'fixture-test',
      unix_ms: 2,
      seq: 2,
      tick: 1,
      data: {
        root_status: 'success',
        tick_ms: 1.2,
        tick_budget_ms: 5,
      },
    }),
  ].join('\n');
}

describe('loadBundle', () => {
  it('loads a valid bundle and returns a deterministic summary', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mbt-bundle-ok-'));
    const bundleDir = path.join(root, 'fixture');
    await mkdir(bundleDir, { recursive: true });

    try {
      await writeBundleFile(bundleDir, 'manifest.json', validManifest());
      await writeBundleFile(bundleDir, 'events.jsonl', validEvents());
      await writeBundleFile(bundleDir, 'config.json', JSON.stringify({ deterministic_mode: true }, null, 2));

      const bundle = await loadBundle(bundleDir, {
        skipValidation: true,
      });

      expect(bundle.manifest.fixture_name).toBe('fixture-test');
      expect(bundle.events).toHaveLength(2);
      expect(bundle.summary.schema_version).toBe('mbt.evt.v1');
      expect(bundle.summary.contract_version).toBe('1.0.0');
      expect(bundle.summary.digest.startsWith('fnv1a64:')).toBe(true);
      expect(bundle.version_gate.ok).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails on missing required files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mbt-bundle-missing-'));

    try {
      await expect(loadBundle(root, { skipValidation: true })).rejects.toBeInstanceOf(BundleLoadError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails fast on incompatible contract major versions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mbt-bundle-version-'));
    const bundleDir = path.join(root, 'fixture');
    await mkdir(bundleDir, { recursive: true });

    try {
      await writeBundleFile(
        bundleDir,
        'manifest.json',
        JSON.stringify(
          {
            contract_id: 'runtime-contract-v2.0.0',
            contract_version: '2.0.0',
            fixture_name: 'fixture-test',
            schema: 'mbt.evt.v1',
          },
          null,
          2,
        ),
      );
      await writeBundleFile(bundleDir, 'events.jsonl', validEvents());

      await expect(loadBundle(bundleDir, { skipValidation: true })).rejects.toThrow('version gate failed');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

