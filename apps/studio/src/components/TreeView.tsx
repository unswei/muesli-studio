import type { CSSProperties } from 'react';
import { useMemo } from 'react';

import { styleForStatus, type NodeStatus } from '@muesli/ui';
import type { ValidatedMbtEvent } from '@muesli/protocol';
import type { ReplayStore } from '@muesli/replay';

type BtDefEvent = Extract<ValidatedMbtEvent, { type: 'bt_def' }>;

interface TreeViewProps {
  replay: ReplayStore;
  selectedTick: number;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

interface PositionedNode {
  id: string;
  x: number;
  y: number;
  name: string;
  kind: string;
}

interface NormalisedBtNode {
  id: string;
  name: string;
  kind: string;
}

interface NormalisedBtEdge {
  from: string;
  to: string;
}

const NODE_WIDTH = 150;
const NODE_HEIGHT = 54;
const H_SPACING = 210;
const V_SPACING = 120;

function normaliseId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function normaliseDefinition(btDef: BtDefEvent): { nodes: NormalisedBtNode[]; edges: NormalisedBtEdge[] } {
  const nodes: NormalisedBtNode[] = [];
  const edges: NormalisedBtEdge[] = [];

  if (Array.isArray(btDef.data.nodes)) {
    for (const node of btDef.data.nodes) {
      if (!node || typeof node !== 'object') {
        continue;
      }

      const record = node as Record<string, unknown>;
      const id = normaliseId(record.id);
      if (!id) {
        continue;
      }

      nodes.push({
        id,
        name: typeof record.name === 'string' && record.name.length > 0 ? record.name : `node-${id}`,
        kind: typeof record.kind === 'string' && record.kind.length > 0 ? record.kind : 'node',
      });
    }
  }

  if (Array.isArray(btDef.data.edges)) {
    for (const edge of btDef.data.edges) {
      if (!edge || typeof edge !== 'object') {
        continue;
      }

      const record = edge as Record<string, unknown>;
      const from = normaliseId(record.from ?? record.parent);
      const to = normaliseId(record.to ?? record.child);
      if (!from || !to) {
        continue;
      }

      edges.push({ from, to });
    }
  }

  return { nodes, edges };
}

export function TreeView({ replay, selectedTick, selectedNodeId, onSelectNode }: TreeViewProps) {
  const btDef = replay.btDef as BtDefEvent | undefined;

  const layout = useMemo(() => {
    if (!btDef) {
      return { nodes: [] as PositionedNode[], edges: [] as Array<{ from: string; to: string }>, size: { width: 0, height: 0 } };
    }

    const normalised = normaliseDefinition(btDef);
    const childSet = new Set(normalised.edges.map((edge) => edge.to));
    const roots = normalised.nodes.filter((node) => !childSet.has(node.id));

    const depthByNode = new Map<string, number>();
    const queue: Array<{ id: string; depth: number }> = roots.map((root) => ({ id: root.id, depth: 0 }));

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (!current) {
        continue;
      }

      if (depthByNode.has(current.id)) {
        continue;
      }

      depthByNode.set(current.id, current.depth);
      for (const edge of normalised.edges) {
        if (edge.from === current.id) {
          queue.push({ id: edge.to, depth: current.depth + 1 });
        }
      }
    }

    for (const node of normalised.nodes) {
      if (!depthByNode.has(node.id)) {
        depthByNode.set(node.id, 0);
      }
    }

    const columns = new Map<number, string[]>();
    for (const node of normalised.nodes) {
      const depth = depthByNode.get(node.id) ?? 0;
      const bucket = columns.get(depth) ?? [];
      bucket.push(node.id);
      columns.set(depth, bucket);
    }

    const byId = new Map(normalised.nodes.map((node) => [node.id, node]));
    const positionedNodes: PositionedNode[] = [];

    const maxColumnSize = Math.max(...Array.from(columns.values()).map((ids) => ids.length), 1);
    const maxDepth = Math.max(...Array.from(columns.keys()), 0);

    for (const [depth, nodeIds] of Array.from(columns.entries()).sort((left, right) => left[0] - right[0])) {
      nodeIds.sort((left, right) => left.localeCompare(right));
      nodeIds.forEach((nodeId, row) => {
        const node = byId.get(nodeId);
        if (!node) {
          return;
        }

        positionedNodes.push({
          id: node.id,
          name: node.name,
          kind: node.kind,
          x: depth * H_SPACING,
          y: row * V_SPACING,
        });
      });
    }

    return {
      nodes: positionedNodes,
      edges: normalised.edges,
      size: {
        width: (maxDepth + 1) * H_SPACING + NODE_WIDTH,
        height: maxColumnSize * V_SPACING + NODE_HEIGHT,
      },
    };
  }, [btDef]);

  const nodePosition = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout.nodes]);

  if (!btDef) {
    return <div className="panel empty">Load a JSONL replay log to render the tree.</div>;
  }

  return (
    <div className="panel tree-panel">
      <h2>tree view</h2>
      <svg width="100%" viewBox={`0 0 ${Math.max(layout.size.width, 600)} ${Math.max(layout.size.height, 320)}`} role="img" aria-label="Behaviour tree">
        {layout.edges.map((edge) => {
          const from = nodePosition.get(edge.from);
          const to = nodePosition.get(edge.to);
          if (!from || !to) {
            return null;
          }

          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={from.x + NODE_WIDTH}
              y1={from.y + NODE_HEIGHT / 2}
              x2={to.x}
              y2={to.y + NODE_HEIGHT / 2}
              stroke="#9ba6b2"
              strokeWidth={2}
            />
          );
        })}

        {layout.nodes.map((node) => {
          const status = replay.getNodeStatusAt(node.id, selectedTick)?.status ?? 'unknown';
          const statusStyle = styleForStatus(status as NodeStatus);
          const isSelected = node.id === selectedNodeId;
          const shapeStyle: CSSProperties = {
            fill: typeof statusStyle.backgroundColor === 'string' ? statusStyle.backgroundColor : '#f2f2f2',
            stroke: isSelected ? '#111827' : '#8ea0b2',
            strokeWidth: isSelected ? 3 : 2,
            cursor: 'pointer',
          };

          return (
            <g key={node.id} onClick={() => onSelectNode(node.id)}>
              <rect x={node.x} y={node.y} width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} style={shapeStyle} />
              <text x={node.x + 10} y={node.y + 22} fontSize={14} fill="#112233">
                {node.name}
              </text>
              <text x={node.x + 10} y={node.y + 40} fontSize={12} fill="#425466">
                {node.kind} · {status}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
