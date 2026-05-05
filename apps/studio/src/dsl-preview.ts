import type { CompiledBtDefinition } from './dsl-compiler';

export interface PreviewTreeDefinition {
  dsl: string;
  nodes: Array<{ id: string; kind: string; name: string }>;
  edges: Array<{ parent: string; child: string; index: number }>;
}

export type StructuralPreviewChange =
  | { type: 'added'; path: string; label: string }
  | { type: 'removed'; path: string; label: string }
  | { type: 'changed'; path: string; before: string; after: string }
  | { type: 'reordered'; path: string; before: string; after: string };

export interface StructuralPreview {
  nodeCount: number;
  edgeCount: number;
  changedCount: number;
  changes: StructuralPreviewChange[];
}

interface PathNode {
  path: string;
  label: string;
  childSignature: string;
}

function normaliseId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normaliseText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export function toPreviewTreeDefinition(input: {
  dsl?: unknown;
  nodes?: unknown;
  edges?: unknown;
}): PreviewTreeDefinition | null {
  if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    return null;
  }

  const nodes: PreviewTreeDefinition['nodes'] = [];
  for (const rawNode of input.nodes) {
    if (!rawNode || typeof rawNode !== 'object') {
      continue;
    }
    const node = rawNode as Record<string, unknown>;
    const id = normaliseId(node.id);
    if (!id) {
      continue;
    }
    const kind = normaliseText(node.kind, 'node');
    nodes.push({ id, kind, name: normaliseText(node.name, kind) });
  }

  const edges: PreviewTreeDefinition['edges'] = [];
  for (const rawEdge of input.edges) {
    if (!rawEdge || typeof rawEdge !== 'object') {
      continue;
    }
    const edge = rawEdge as Record<string, unknown>;
    const parent = normaliseId(edge.parent ?? edge.from);
    const child = normaliseId(edge.child ?? edge.to);
    if (!parent || !child) {
      continue;
    }
    const index = typeof edge.index === 'number' && Number.isInteger(edge.index) && edge.index >= 0 ? edge.index : edges.length;
    edges.push({ parent, child, index });
  }

  return {
    dsl: typeof input.dsl === 'string' ? input.dsl : '',
    nodes,
    edges,
  };
}

export function compiledToPreviewTreeDefinition(compiled: CompiledBtDefinition): PreviewTreeDefinition {
  return {
    dsl: compiled.dsl,
    nodes: compiled.nodes.map((node) => ({ id: String(node.id), kind: node.kind, name: node.name })),
    edges: compiled.edges.map((edge) => ({
      parent: String(edge.parent),
      child: String(edge.child),
      index: edge.index,
    })),
  };
}

function labelFor(node: { kind: string; name: string }): string {
  return `${node.kind} ${node.name}`;
}

function toPathMap(definition: PreviewTreeDefinition): Map<string, PathNode> {
  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
  const childIds = new Set(definition.edges.map((edge) => edge.child));
  const childrenByParent = new Map<string, PreviewTreeDefinition['edges']>();

  for (const edge of definition.edges) {
    const existing = childrenByParent.get(edge.parent) ?? [];
    existing.push(edge);
    childrenByParent.set(edge.parent, existing);
  }

  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.index - b.index || a.child.localeCompare(b.child));
  }

  const roots = definition.nodes.filter((node) => !childIds.has(node.id));
  const orderedRoots = roots.length > 0 ? roots : definition.nodes.slice(0, 1);
  const pathMap = new Map<string, PathNode>();
  const visited = new Set<string>();

  function visit(nodeId: string, path: string): void {
    if (visited.has(`${nodeId}:${path}`)) {
      return;
    }
    visited.add(`${nodeId}:${path}`);

    const node = nodesById.get(nodeId);
    if (!node) {
      return;
    }

    const children = childrenByParent.get(nodeId) ?? [];
    const childSignature = children
      .map((edge) => {
        const child = nodesById.get(edge.child);
        return child ? labelFor(child) : edge.child;
      })
      .join(' > ');

    pathMap.set(path, {
      path,
      label: labelFor(node),
      childSignature,
    });

    children.forEach((edge, index) => {
      visit(edge.child, `${path}/${index}`);
    });
  }

  orderedRoots.forEach((root, index) => {
    visit(root.id, String(index));
  });

  return pathMap;
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.slice().sort().join('\u0000') === right.slice().sort().join('\u0000');
}

export function buildStructuralPreview(current: PreviewTreeDefinition, preview: PreviewTreeDefinition): StructuralPreview {
  const currentPaths = toPathMap(current);
  const previewPaths = toPathMap(preview);
  const allPaths = Array.from(new Set([...currentPaths.keys(), ...previewPaths.keys()])).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const changes: StructuralPreviewChange[] = [];

  for (const path of allPaths) {
    const before = currentPaths.get(path);
    const after = previewPaths.get(path);
    if (!before && after) {
      changes.push({ type: 'added', path, label: after.label });
      continue;
    }
    if (before && !after) {
      changes.push({ type: 'removed', path, label: before.label });
      continue;
    }
    if (!before || !after) {
      continue;
    }
    if (before.label !== after.label) {
      changes.push({ type: 'changed', path, before: before.label, after: after.label });
    }

    const beforeChildren = before.childSignature.length > 0 ? before.childSignature.split(' > ') : [];
    const afterChildren = after.childSignature.length > 0 ? after.childSignature.split(' > ') : [];
    if (
      before.childSignature !== after.childSignature &&
      beforeChildren.length > 1 &&
      sameSet(beforeChildren, afterChildren)
    ) {
      changes.push({
        type: 'reordered',
        path,
        before: before.childSignature,
        after: after.childSignature,
      });
    }
  }

  return {
    nodeCount: preview.nodes.length,
    edgeCount: preview.edges.length,
    changedCount: changes.length,
    changes,
  };
}
