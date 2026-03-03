import { describe, expect, it } from 'vitest';

import { evaluateVersionGate } from '../src/version-gate';

describe('evaluateVersionGate', () => {
  it('accepts known contract/schema versions', () => {
    const result = evaluateVersionGate({
      contractVersion: 'runtime-contract-v1',
      schemaVersion: 'mbt.evt.v1',
      capabilities: {
        reset: true,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.capabilities.reset).toBe(true);
  });

  it('rejects unknown major versions', () => {
    const result = evaluateVersionGate({
      contractVersion: 'runtime-contract-v2',
      schemaVersion: 'mbt.evt.v2',
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((entry) => entry.includes('contract major version 2'))).toBe(true);
    expect(result.errors.some((entry) => entry.includes('schema major version 2'))).toBe(true);
  });

  it('warns on newer minor versions', () => {
    const result = evaluateVersionGate({
      contractVersion: 'runtime-contract-v1.2',
      schemaVersion: 'mbt.evt.v1.3',
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((entry) => entry.includes('contract minor version 2'))).toBe(true);
    expect(result.warnings.some((entry) => entry.includes('schema minor version 3'))).toBe(true);
  });
});

