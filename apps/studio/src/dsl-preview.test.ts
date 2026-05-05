import { describe, expect, it } from 'vitest';

import { compileBtDsl } from './dsl-compiler';
import { buildStructuralPreview, compiledToPreviewTreeDefinition } from './dsl-preview';

function previewBetween(currentDsl: string, nextDsl: string) {
  return buildStructuralPreview(
    compiledToPreviewTreeDefinition(compileBtDsl(currentDsl)),
    compiledToPreviewTreeDefinition(compileBtDsl(nextDsl)),
  );
}

describe('buildStructuralPreview', () => {
  it('reports added nodes', () => {
    const preview = previewBetween('(bt (seq (act a)))', '(bt (seq (act a) (act b)))');

    expect(preview.nodeCount).toBe(3);
    expect(preview.edgeCount).toBe(2);
    expect(preview.changes).toContainEqual({ type: 'added', path: '0/1', label: 'act b' });
  });

  it('reports removed nodes', () => {
    const preview = previewBetween('(bt (seq (act a) (act b)))', '(bt (seq (act a)))');

    expect(preview.nodeCount).toBe(2);
    expect(preview.edgeCount).toBe(1);
    expect(preview.changes).toContainEqual({ type: 'removed', path: '0/1', label: 'act b' });
  });

  it('reports changed nodes at the same structural path', () => {
    const preview = previewBetween('(bt (seq (act a)))', '(bt (seq (act b)))');

    expect(preview.changes).toContainEqual({ type: 'changed', path: '0/0', before: 'act a', after: 'act b' });
  });

  it('reports reordered child signatures', () => {
    const preview = previewBetween('(bt (seq (act a) (act b)))', '(bt (seq (act b) (act a)))');

    expect(preview.changes).toContainEqual({
      type: 'reordered',
      path: '0',
      before: 'act a > act b',
      after: 'act b > act a',
    });
  });
});
