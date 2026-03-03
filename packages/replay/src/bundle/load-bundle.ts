import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';

import { summariseRun } from '../summarise-run';
import { evaluateVersionGate } from '../version-gate';
import { validateLogSubprocess } from '../validate/validate-log-subprocess';
import type { RunEventRecord } from '../summarise-run';
import { BundleLoadError, type FixtureBundleManifest, type LoadedBundle } from './types';

export interface LoadBundleOptions {
  validatorPath?: string;
  schemaPath?: string;
  pythonExecutable?: string;
  skipValidation?: boolean;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BundleLoadError(`${label} must be a JSON object`);
  }

  return value as Record<string, unknown>;
}

function asOptionalObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BundleLoadError(`${label} must be a JSON object`);
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BundleLoadError(`${label} must be a non-empty string`);
  }

  return value;
}

function parseManifest(raw: unknown): FixtureBundleManifest {
  const object = asObject(raw, 'manifest');
  return {
    ...object,
    contract_id: asString(object.contract_id, 'manifest.contract_id'),
    contract_version: asString(object.contract_version, 'manifest.contract_version'),
    fixture_name: asString(object.fixture_name, 'manifest.fixture_name'),
    schema: asString(object.schema, 'manifest.schema'),
  };
}

function parseEventRecord(raw: unknown, lineNumber: number): RunEventRecord {
  const object = asObject(raw, `events.jsonl line ${lineNumber}`);
  const schema = asString(object.schema, `events.jsonl line ${lineNumber} schema`);
  const type = asString(object.type, `events.jsonl line ${lineNumber} type`);
  const runId = asString(object.run_id, `events.jsonl line ${lineNumber} run_id`);
  const unixMs = Number(object.unix_ms);
  const seq = Number(object.seq);
  const tick = object.tick;
  const data = asObject(object.data, `events.jsonl line ${lineNumber} data`);

  if (!Number.isFinite(unixMs)) {
    throw new BundleLoadError(`events.jsonl line ${lineNumber} unix_ms must be numeric`);
  }

  if (!Number.isFinite(seq)) {
    throw new BundleLoadError(`events.jsonl line ${lineNumber} seq must be numeric`);
  }

  if (tick !== undefined && !Number.isFinite(Number(tick))) {
    throw new BundleLoadError(`events.jsonl line ${lineNumber} tick must be numeric when present`);
  }

  const contractVersion = object.contract_version;
  if (contractVersion !== undefined && typeof contractVersion !== 'string') {
    throw new BundleLoadError(`events.jsonl line ${lineNumber} contract_version must be a string when present`);
  }

  return {
    schema,
    type,
    run_id: runId,
    unix_ms: unixMs,
    seq,
    tick: tick === undefined ? undefined : Number(tick),
    data,
    contract_version: contractVersion,
  };
}

async function readOptionalJsonObject(filePath: string, label: string): Promise<Record<string, unknown> | null> {
  try {
    await access(filePath);
  } catch {
    return null;
  }

  const text = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(text) as unknown;
  return asOptionalObject(parsed, label);
}

async function validateEventsWithAjv(events: RunEventRecord[], schemaPath: string): Promise<{ ok: boolean; diagnostics: string[] }> {
  let schema: unknown;
  try {
    schema = JSON.parse(await readFile(schemaPath, 'utf8')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unable to read schema';
    return {
      ok: false,
      diagnostics: [`could not load schema for fallback validator: ${message}`],
    };
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  let validate;
  try {
    validate = ajv.compile(schema as object);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unable to compile schema';
    return {
      ok: false,
      diagnostics: [`could not compile schema for fallback validator: ${message}`],
    };
  }

  const diagnostics: string[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const valid = validate(event);
    if (!valid) {
      const problems = (validate.errors ?? [])
        .map((entry) => `${entry.instancePath || '<root>'} ${entry.message ?? 'schema violation'}`)
        .join('; ');
      diagnostics.push(`event ${index + 1}: ${problems}`);
    }
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics,
  };
}

export async function loadBundle(bundleDir: string, options: LoadBundleOptions = {}): Promise<LoadedBundle> {
  const manifestPath = path.join(bundleDir, 'manifest.json');
  const eventsPath = path.join(bundleDir, 'events.jsonl');
  const configPath = path.join(bundleDir, 'config.json');
  const seedPath = path.join(bundleDir, 'seed.json');
  const expectedMetricsPath = path.join(bundleDir, 'expected_metrics.json');
  const validatorPath = options.validatorPath ?? path.resolve('tools', 'validate_log.py');
  const schemaPath = options.schemaPath ?? path.resolve('schema', 'mbt.evt.v1.schema.json');

  try {
    await access(manifestPath);
  } catch {
    throw new BundleLoadError(`missing required file: ${manifestPath}`);
  }

  try {
    await access(eventsPath);
  } catch {
    throw new BundleLoadError(`missing required file: ${eventsPath}`);
  }

  const manifestRaw = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  const manifest = parseManifest(manifestRaw);
  const config = await readOptionalJsonObject(configPath, 'config');
  const seed = await readOptionalJsonObject(seedPath, 'seed');
  const expectedMetrics = await readOptionalJsonObject(expectedMetricsPath, 'expected_metrics');

  const eventsText = await readFile(eventsPath, 'utf8');
  const events: RunEventRecord[] = [];
  const lines = eventsText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').trim();
    if (!line) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid JSON';
      throw new BundleLoadError(`events.jsonl line ${index + 1}: ${message}`);
    }

    events.push(parseEventRecord(parsed, index + 1));
  }

  if (events.length === 0) {
    throw new BundleLoadError('events.jsonl must contain at least one event');
  }

  const runStart = events.find((event) => event.type === 'run_start');
  const capabilities = runStart?.data?.capabilities;
  const versionGate = evaluateVersionGate({
    contractVersion: manifest.contract_id,
    schemaVersion: manifest.schema,
    capabilities: capabilities && typeof capabilities === 'object' ? (capabilities as Record<string, unknown>) : undefined,
  });

  if (!versionGate.ok) {
    throw new BundleLoadError(`version gate failed: ${versionGate.errors.join('; ')}`);
  }

  let validation = {
    ok: true,
    diagnostics: [] as string[],
    validator_path: validatorPath,
  };

  if (!options.skipValidation) {
    const validatorResult = await validateLogSubprocess({
      validatorPath,
      schemaPath,
      logPath: eventsPath,
      pythonExecutable: options.pythonExecutable,
      cwd: process.cwd(),
    });

    validation = {
      ok: validatorResult.ok,
      diagnostics: validatorResult.diagnostics,
      validator_path: validatorPath,
    };

    if (!validatorResult.ok) {
      const fallback = await validateEventsWithAjv(events, schemaPath);
      validation = {
        ok: fallback.ok,
        diagnostics: fallback.ok
          ? ['subprocess validator unavailable or failed; fallback AJV validator passed']
          : fallback.diagnostics,
        validator_path: validatorPath,
      };

      if (!fallback.ok) {
        const firstDiagnostic = fallback.diagnostics[0] ?? validatorResult.diagnostics[0] ?? 'unknown validator error';
        throw new BundleLoadError(`log validation failed: ${firstDiagnostic}`);
      }
    }
  }

  const summary = summariseRun(events, {
    contractVersion: manifest.contract_version,
    schemaVersion: manifest.schema,
  });

  return {
    bundle_dir: bundleDir,
    manifest,
    config,
    seed,
    expected_metrics: expectedMetrics,
    events,
    validation,
    version_gate: versionGate,
    summary,
  };
}
