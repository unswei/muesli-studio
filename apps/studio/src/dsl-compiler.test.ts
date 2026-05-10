import { describe, expect, it } from 'vitest';

import {
  DslCompileError,
  buildDslCapabilityContext,
  compileBtDsl,
  normaliseCapabilityMetadata,
  validateDslCapabilities,
} from './dsl-compiler';

function expectCompileError(source: string): DslCompileError {
  try {
    compileBtDsl(source);
  } catch (error) {
    expect(error).toBeInstanceOf(DslCompileError);
    return error as DslCompileError;
  }
  throw new Error('expected compile error');
}

describe('compileBtDsl', () => {
  it('compiles a simple bt form into deterministic nodes and edges', () => {
    const compiled = compileBtDsl('(bt (seq (cond always-true) (act always-success)))');

    expect(compiled.nodes).toEqual([
      { id: 1, kind: 'seq', name: 'seq' },
      { id: 2, kind: 'cond', name: 'always-true' },
      { id: 3, kind: 'act', name: 'always-success' },
    ]);
    expect(compiled.edges).toEqual([
      { parent: 1, child: 2, index: 0 },
      { parent: 1, child: 3, index: 1 },
    ]);
    expect(compiled.diagnostics).toEqual([]);
  });

  it('accepts defbt wrapper form', () => {
    const compiled = compileBtDsl('(defbt demo_tree (sel (act fallback) (act recover)))');
    expect(compiled.nodes[0]).toEqual({ id: 1, kind: 'sel', name: 'sel' });
    expect(compiled.nodes).toHaveLength(3);
  });

  it('reports line and column for missing closing parentheses', () => {
    const error = expectCompileError('(bt (seq (act run)');

    expect(error.diagnostics[0]).toMatchObject({
      kind: 'syntax',
      severity: 'error',
      message: 'Missing closing parenthesis.',
      line: 1,
      column: 5,
      expected: 'A `)` to close this list.',
    });
  });

  it('reports unexpected closing parentheses', () => {
    const error = expectCompileError(')');

    expect(error.diagnostics[0]).toMatchObject({
      kind: 'syntax',
      severity: 'error',
      message: 'Unexpected closing parenthesis.',
      line: 1,
      column: 1,
    });
  });

  it('reports unsupported forms without raw compiler copy', () => {
    const error = expectCompileError('(bt (par (act a)))');

    expect(error.diagnostics[0]).toMatchObject({
      kind: 'unsupported-form',
      severity: 'error',
      message: 'Studio preview does not support `par` yet.',
      expected: 'Studio preview supports `seq`, `sel`, `act`, `cond`, and `dec` here.',
      line: 1,
      column: 6,
    });
  });

  it('reports empty lists as syntax errors', () => {
    const error = expectCompileError('(bt ())');

    expect(error.diagnostics[0]).toMatchObject({
      kind: 'syntax',
      severity: 'error',
      message: 'Empty list is not a valid node.',
      line: 1,
      column: 5,
    });
  });

  it('warns about duplicate sibling signatures without blocking preview', () => {
    const compiled = compileBtDsl('(bt (seq (act plan) (act plan)))');

    expect(compiled.diagnostics).toContainEqual(
      expect.objectContaining({
        kind: 'unstable-identity',
        severity: 'warning',
        message: 'Sibling nodes have the same signature.',
        line: 1,
        column: 21,
      }),
    );
  });

  it('accepts supported leaf forms with extra callback arguments', () => {
    const compiled = compileBtDsl('(bt (seq (act choose-step choose-next-step scene-result next-step)))');

    expect(compiled.nodes).toContainEqual({ id: 2, kind: 'act', name: 'choose-step' });
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.capabilityRequirements).toEqual([]);
  });

  it('extracts capability requirements from leaf callback arguments', () => {
    const compiled = compileBtDsl('(bt (seq (act drive-to-goal :cap cap.motion.v1) (cond scene-ready cap.perception.scene.v1)))');

    expect(compiled.capabilityRequirements).toEqual([
      { capability: 'cap.motion.v1', nodeName: 'drive-to-goal' },
      { capability: 'cap.perception.scene.v1', nodeName: 'scene-ready' },
    ]);
  });

  it('keeps the capability validation hook inert without requirements', () => {
    expect(validateDslCapabilities()).toEqual([]);
    expect(validateDslCapabilities({ available: ['cap.motion.v1'] })).toEqual([]);
  });

  it('normalises flat and bundle-shaped capability metadata', () => {
    expect(
      normaliseCapabilityMetadata({
        'cap.motion.v1': { version: 1 },
        'cap.disabled.v1': false,
        capabilities: [{ id: 'cap.perception.scene.v1' }],
        bundles: [{ capability: 'cap.echo.v1' }],
      }),
    ).toEqual(['cap.echo.v1', 'cap.motion.v1', 'cap.perception.scene.v1']);
  });

  it('builds stable capability validation context', () => {
    expect(
      buildDslCapabilityContext({
        required: [{ capability: 'cap.motion.v1' }, { capability: 'cap.perception.scene.v1' }],
        available: { 'cap.motion.v1': { provider: 'test' } },
      }),
    ).toEqual({
      requiredCapabilities: ['cap.motion.v1', 'cap.perception.scene.v1'],
      availableCapabilities: ['cap.motion.v1'],
      missingCapabilities: ['cap.perception.scene.v1'],
    });
  });

  it('reports missing capability requirements without blocking compilation', () => {
    const diagnostics = validateDslCapabilities({
      required: [{ capability: 'cap.motion.v1', nodeName: 'drive-to-goal' }],
      available: ['cap.echo.v1'],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        kind: 'capability',
        severity: 'warning',
        message: 'Required capability `cap.motion.v1` is not present.',
      }),
    );
    expect(
      validateDslCapabilities({
        required: [{ capability: 'cap.motion.v1' }],
        available: { 'cap.motion.v1': { provider: 'test' } },
      }),
    ).toEqual([]);
  });
});
