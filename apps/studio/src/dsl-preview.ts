import type { CompiledBtDefinition } from './dsl-compiler';

export interface PreviewTreeDefinition {
  dsl: string;
  nodes: Array<{ id: string; kind: string; name: string }>;
  edges: Array<{ parent: string; child: string; index: number }>;
}

export type BtStructureDiffRowType = 'added' | 'removed' | 'renamed' | 'reordered' | 'changed';

export interface NodeSnapshot {
  id: string;
  path: string;
  kind: string;
  name: string;
  label: string;
}

export interface BtStructureDiffRow {
  type: BtStructureDiffRowType;
  path: string;
  before?: NodeSnapshot;
  after?: NodeSnapshot;
  parentPath?: string;
  beforeChildren?: string[];
  afterChildren?: string[];
}

export interface BtStructureDiff {
  nodeCount: number;
  edgeCount: number;
  summary: Record<BtStructureDiffRowType, number> & { total: number };
  rows: BtStructureDiffRow[];
}

interface PathNode extends NodeSnapshot {
  parentPath?: string;
  children: string[];
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

function parentPathFor(path: string): string | undefined {
  const lastSeparator = path.lastIndexOf('/');
  return lastSeparator === -1 ? undefined : path.slice(0, lastSeparator);
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

    const children = (childrenByParent.get(nodeId) ?? [])
      .map((edge) => nodesById.get(edge.child))
      .filter((child): child is { id: string; kind: string; name: string } => child !== undefined)
      .map(labelFor);

    pathMap.set(path, {
      id: node.id,
      path,
      parentPath: parentPathFor(path),
      kind: node.kind,
      name: node.name,
      label: labelFor(node),
      children,
    });

    const childEdges = childrenByParent.get(nodeId) ?? [];
    childEdges.forEach((edge, index) => {
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

function hasSameChildrenInDifferentOrder(before: PathNode, after: PathNode): boolean {
  return before.children.length > 1 && before.children.join('\u0000') !== after.children.join('\u0000') && sameSet(before.children, after.children);
}

function hasLikelyChildReorder(before: PathNode, after: PathNode): boolean {
  if (hasSameChildrenInDifferentOrder(before, after)) {
    return true;
  }
  if (before.children.length !== after.children.length || before.children.length < 2) {
    return false;
  }
  return before.children.some((label, index) => after.children.includes(label) && after.children[index] !== label);
}

function snapshotFor(node: PathNode): NodeSnapshot {
  return {
    id: node.id,
    path: node.path,
    kind: node.kind,
    name: node.name,
    label: node.label,
  };
}

function rowForSamePath(before: PathNode, after: PathNode): BtStructureDiffRow[] {
  const rows: BtStructureDiffRow[] = [];
  if (before.kind === after.kind && before.name !== after.name) {
    rows.push({
      type: 'renamed',
      path: after.path,
      before: snapshotFor(before),
      after: snapshotFor(after),
      parentPath: after.parentPath,
      beforeChildren: before.children,
      afterChildren: after.children,
    });
  }

  if (before.kind !== after.kind) {
    rows.push({
      type: 'changed',
      path: after.path,
      before: snapshotFor(before),
      after: snapshotFor(after),
      parentPath: after.parentPath,
      beforeChildren: before.children,
      afterChildren: after.children,
    });
  }

  if (hasLikelyChildReorder(before, after)) {
    rows.push({
      type: 'reordered',
      path: after.path,
      before: snapshotFor(before),
      after: snapshotFor(after),
      parentPath: after.parentPath,
      beforeChildren: before.children,
      afterChildren: after.children,
    });
  }

  return rows;
}

function similarityScore(before: PathNode, after: PathNode): number {
  let score = 0;
  if (before.kind === after.kind) {
    score += 4;
  }
  if (before.name === after.name) {
    score += 3;
  }
  if (before.parentPath === after.parentPath) {
    score += 2;
  }
  if (sameSet(before.children, after.children)) {
    score += 2;
  }
  return score;
}

function matchUnpairedNodes(beforeNodes: PathNode[], afterNodes: PathNode[]): Array<{ before: PathNode; after: PathNode }> {
  const pairs: Array<{ before: PathNode; after: PathNode; score: number }> = [];
  for (const before of beforeNodes) {
    for (const after of afterNodes) {
      const score = similarityScore(before, after);
      if (score >= 6) {
        pairs.push({ before, after, score });
      }
    }
  }

  pairs.sort(
    (a, b) =>
      b.score - a.score ||
      a.before.path.localeCompare(b.before.path, undefined, { numeric: true }) ||
      a.after.path.localeCompare(b.after.path, undefined, { numeric: true }),
  );

  const usedBefore = new Set<string>();
  const usedAfter = new Set<string>();
  const matches: Array<{ before: PathNode; after: PathNode }> = [];

  for (const pair of pairs) {
    if (usedBefore.has(pair.before.path) || usedAfter.has(pair.after.path)) {
      continue;
    }
    usedBefore.add(pair.before.path);
    usedAfter.add(pair.after.path);
    matches.push({ before: pair.before, after: pair.after });
  }

  return matches;
}

function childNodesForParent(paths: Map<string, PathNode>, parentPath: string): PathNode[] {
  return Array.from(paths.values())
    .filter((node) => node.parentPath === parentPath)
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

function createSummary(rows: BtStructureDiffRow[]): BtStructureDiff['summary'] {
  const summary = {
    added: 0,
    removed: 0,
    renamed: 0,
    reordered: 0,
    changed: 0,
    total: rows.length,
  };

  for (const row of rows) {
    summary[row.type] += 1;
  }

  return summary;
}

function sortRows(rows: BtStructureDiffRow[]): BtStructureDiffRow[] {
  const order: Record<BtStructureDiffRowType, number> = {
    added: 0,
    removed: 1,
    renamed: 2,
    reordered: 3,
    changed: 4,
  };
  return rows.slice().sort((a, b) => order[a.type] - order[b.type] || a.path.localeCompare(b.path, undefined, { numeric: true }));
}

export function buildBtStructureDiff(current: PreviewTreeDefinition, preview: PreviewTreeDefinition): BtStructureDiff {
  const currentPaths = toPathMap(current);
  const previewPaths = toPathMap(preview);
  const rows: BtStructureDiffRow[] = [];
  const pairedBefore = new Set<string>();
  const pairedAfter = new Set<string>();

  const samePaths = Array.from(currentPaths.keys())
    .filter((path) => previewPaths.has(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const reorderedParents = new Set<string>();
  for (const path of samePaths) {
    const before = currentPaths.get(path);
    const after = previewPaths.get(path);
    if (before && after && hasSameChildrenInDifferentOrder(before, after)) {
      reorderedParents.add(path);
    } else if (before && after && hasLikelyChildReorder(before, after)) {
      reorderedParents.add(path);
    }
  }

  for (const path of samePaths) {
    const before = currentPaths.get(path);
    const after = previewPaths.get(path);
    if (!before || !after) {
      continue;
    }
    pairedBefore.add(path);
    pairedAfter.add(path);
    if (before.parentPath && reorderedParents.has(before.parentPath) && before.label !== after.label) {
      continue;
    }
    rows.push(...rowForSamePath(before, after));
  }

  for (const parentPath of reorderedParents) {
    const beforeChildren = childNodesForParent(currentPaths, parentPath);
    const afterChildren = childNodesForParent(previewPaths, parentPath);
    for (const match of matchUnpairedNodes(beforeChildren, afterChildren)) {
      if (match.before.name === match.after.name && match.before.kind === match.after.kind) {
        continue;
      }
      rows.push({
        type: match.before.kind === match.after.kind ? 'renamed' : 'changed',
        path: match.after.path,
        before: snapshotFor(match.before),
        after: snapshotFor(match.after),
        parentPath: match.after.parentPath,
        beforeChildren: match.before.children,
        afterChildren: match.after.children,
      });
    }
  }

  const unpairedBefore = Array.from(currentPaths.values()).filter((node) => !pairedBefore.has(node.path));
  const unpairedAfter = Array.from(previewPaths.values()).filter((node) => !pairedAfter.has(node.path));
  const matchedUnpaired = matchUnpairedNodes(unpairedBefore, unpairedAfter);

  for (const match of matchedUnpaired) {
    pairedBefore.add(match.before.path);
    pairedAfter.add(match.after.path);
    if (match.before.kind === match.after.kind && match.before.name !== match.after.name) {
      rows.push({
        type: 'renamed',
        path: match.after.path,
        before: snapshotFor(match.before),
        after: snapshotFor(match.after),
        parentPath: match.after.parentPath,
        beforeChildren: match.before.children,
        afterChildren: match.after.children,
      });
    } else if (match.before.kind !== match.after.kind || match.before.children.join('\u0000') !== match.after.children.join('\u0000')) {
      rows.push({
        type: 'changed',
        path: match.after.path,
        before: snapshotFor(match.before),
        after: snapshotFor(match.after),
        parentPath: match.after.parentPath,
        beforeChildren: match.before.children,
        afterChildren: match.after.children,
      });
    }
  }

  for (const before of currentPaths.values()) {
    if (pairedBefore.has(before.path)) {
      continue;
    }
    rows.push({
      type: 'removed',
      path: before.path,
      before: snapshotFor(before),
      parentPath: before.parentPath,
      beforeChildren: before.children,
    });
  }

  for (const after of previewPaths.values()) {
    if (pairedAfter.has(after.path)) {
      continue;
    }
    rows.push({
      type: 'added',
      path: after.path,
      after: snapshotFor(after),
      parentPath: after.parentPath,
      afterChildren: after.children,
    });
  }

  const sortedRows = sortRows(rows);
  return {
    nodeCount: preview.nodes.length,
    edgeCount: preview.edges.length,
    summary: createSummary(sortedRows),
    rows: sortedRows,
  };
}
