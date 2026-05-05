import { describe, expect, it } from 'vitest';

import { compileBtDsl } from './dsl-compiler';
import { buildBtStructureDiff, compiledToPreviewTreeDefinition } from './dsl-preview';

function diffBetween(currentDsl: string, nextDsl: string) {
  return buildBtStructureDiff(
    compiledToPreviewTreeDefinition(compileBtDsl(currentDsl)),
    compiledToPreviewTreeDefinition(compileBtDsl(nextDsl)),
  );
}

describe('buildBtStructureDiff', () => {
  it('reports added nodes', () => {
    const diff = diffBetween('(bt (seq (act a)))', '(bt (seq (act a) (act b)))');

    expect(diff.nodeCount).toBe(3);
    expect(diff.edgeCount).toBe(2);
    expect(diff.summary).toMatchObject({ added: 1, removed: 0, renamed: 0, reordered: 0, changed: 0, total: 1 });
    expect(diff.rows).toContainEqual(
      expect.objectContaining({
        type: 'added',
        path: '0/1',
        after: expect.objectContaining({ label: 'act b' }),
        parentPath: '0',
      }),
    );
  });

  it('reports removed nodes', () => {
    const diff = diffBetween('(bt (seq (act a) (act b)))', '(bt (seq (act a)))');

    expect(diff.summary).toMatchObject({ added: 0, removed: 1, renamed: 0, reordered: 0, changed: 0, total: 1 });
    expect(diff.rows).toContainEqual(
      expect.objectContaining({
        type: 'removed',
        path: '0/1',
        before: expect.objectContaining({ label: 'act b' }),
        parentPath: '0',
      }),
    );
  });

  it('reports renamed nodes at stable paths', () => {
    const diff = diffBetween('(bt (seq (act a)))', '(bt (seq (act b)))');

    expect(diff.summary).toMatchObject({ added: 0, removed: 0, renamed: 1, reordered: 0, changed: 0, total: 1 });
    expect(diff.rows).toContainEqual(
      expect.objectContaining({
        type: 'renamed',
        path: '0/0',
        before: expect.objectContaining({ kind: 'act', name: 'a' }),
        after: expect.objectContaining({ kind: 'act', name: 'b' }),
      }),
    );
  });

  it('reports changed node kinds at stable paths', () => {
    const diff = diffBetween('(bt (seq (act a)))', '(bt (seq (cond a)))');

    expect(diff.summary).toMatchObject({ added: 0, removed: 0, renamed: 0, reordered: 0, changed: 1, total: 1 });
    expect(diff.rows).toContainEqual(
      expect.objectContaining({
        type: 'changed',
        path: '0/0',
        before: expect.objectContaining({ kind: 'act', name: 'a' }),
        after: expect.objectContaining({ kind: 'cond', name: 'a' }),
      }),
    );
  });

  it('reports reordered children under the same parent without false renames', () => {
    const diff = diffBetween('(bt (seq (act a) (act b)))', '(bt (seq (act b) (act a)))');

    expect(diff.summary).toMatchObject({ added: 0, removed: 0, renamed: 0, reordered: 1, changed: 0, total: 1 });
    expect(diff.rows).toContainEqual(
      expect.objectContaining({
        type: 'reordered',
        path: '0',
        beforeChildren: ['act a', 'act b'],
        afterChildren: ['act b', 'act a'],
      }),
    );
  });

  it('keeps rename and reorder combinations deterministic', () => {
    const diff = diffBetween('(bt (seq (act a) (act b) (act c)))', '(bt (seq (act b) (act renamed-a) (act c)))');

    expect(diff.summary.total).toBe(diff.rows.length);
    expect(diff.rows.map((row) => `${row.type}:${row.path}`)).toEqual(['renamed:0/1', 'reordered:0']);
  });

  it('keeps summary counts aligned with row classifications', () => {
    const diff = diffBetween('(bt (seq (act a) (act b)))', '(bt (sel (cond renamed) (act a) (act c)))');
    const counted = diff.rows.reduce(
      (acc, row) => {
        acc[row.type] += 1;
        return acc;
      },
      { added: 0, removed: 0, renamed: 0, reordered: 0, changed: 0 },
    );

    expect(diff.summary).toMatchObject(counted);
    expect(diff.summary.total).toBe(diff.rows.length);
  });
});
