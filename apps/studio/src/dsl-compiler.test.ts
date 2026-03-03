import { describe, expect, it } from 'vitest';

import { compileBtDsl } from './dsl-compiler';

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
  });

  it('accepts defbt wrapper form', () => {
    const compiled = compileBtDsl('(defbt demo_tree (sel (act fallback) (act recover)))');
    expect(compiled.nodes[0]).toEqual({ id: 1, kind: 'sel', name: 'sel' });
    expect(compiled.nodes).toHaveLength(3);
  });

  it('throws on malformed expressions', () => {
    expect(() => compileBtDsl('(bt (seq (act run)')).toThrowError('missing closing parenthesis');
  });
});
