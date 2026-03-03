import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateLogSubprocess } from '../src/validate/validate-log-subprocess';

describe('validateLogSubprocess', () => {
  it('returns ok for successful validator', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'mbt-validate-ok-'));
    const scriptPath = path.join(tempDir, 'validate.py');
    const logPath = path.join(tempDir, 'events.jsonl');

    await writeFile(
      scriptPath,
      [
        '#!/usr/bin/env python3',
        'import sys',
        'print("event log validation passed")',
        'sys.exit(0)',
      ].join('\n'),
      'utf8',
    );
    await chmod(scriptPath, 0o755);
    await writeFile(logPath, '{}\n', 'utf8');

    try {
      const result = await validateLogSubprocess({
        validatorPath: scriptPath,
        logPath,
      });

      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('collects diagnostics for failing validator', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'mbt-validate-fail-'));
    const scriptPath = path.join(tempDir, 'validate.py');
    const logPath = path.join(tempDir, 'events.jsonl');

    await writeFile(
      scriptPath,
      [
        '#!/usr/bin/env python3',
        'import sys',
        'print("error: events.jsonl:1: schema mismatch", file=sys.stderr)',
        'sys.exit(1)',
      ].join('\n'),
      'utf8',
    );
    await chmod(scriptPath, 0o755);
    await writeFile(logPath, '{}\n', 'utf8');

    try {
      const result = await validateLogSubprocess({
        validatorPath: scriptPath,
        logPath,
      });

      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.diagnostics[0]).toContain('schema mismatch');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

