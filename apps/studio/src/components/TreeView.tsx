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

const NODE_WIDTH = 188;
const NODE_HEIGHT = 72;
const H_SPACING = 288;
const V_SPACING = 118;

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
  const selectedNode = useMemo(
    () => layout.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [layout.nodes, selectedNodeId],
  );

  if (!btDef) {
    return (
      <div className="panel tree-panel tree-panel--empty">
        <div className="empty-tree-state">
          <p className="panel-kicker">inspection tree</p>
          <h2>behaviour tree</h2>
          <p className="panel-copy muted">Load a replay to render the stable tree layout and repaint node state as you scrub through ticks.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel tree-panel focal-panel">
      <div className="panel-heading panel-heading--tree">
        <div>
          <p className="panel-kicker">inspection tree</p>
          <h2>behaviour tree</h2>
          <p className="panel-copy muted">The structure stays fixed while node state repaints by tick, so you can scrub without losing your place.</p>
        </div>
        <div className="tree-summary-badges">
          <span className="status-badge status-badge--subtle">tick {selectedTick}</span>
          {selectedNode ? (
            <span className="status-badge status-badge--subtle">
              {selectedNode.name} · {replay.getNodeStatusAt(selectedNode.id, selectedTick)?.status ?? 'unknown'}
            </span>
          ) : null}
        </div>
      </div>

      <div className="tree-canvas">
        <svg
          className="tree-svg"
          width="100%"
          viewBox={`0 0 ${Math.max(layout.size.width, 820)} ${Math.max(layout.size.height, 340)}`}
          role="img"
          aria-label="Behaviour tree"
        >
          {layout.edges.map((edge) => {
            const from = nodePosition.get(edge.from);
            const to = nodePosition.get(edge.to);
            if (!from || !to) {
              return null;
            }

            const fromX = from.x + NODE_WIDTH;
            const fromY = from.y + NODE_HEIGHT / 2;
            const toX = to.x;
            const toY = to.y + NODE_HEIGHT / 2;
            const controlX = Math.max(32, (toX - fromX) / 2);

            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={`M ${fromX} ${fromY} C ${fromX + controlX} ${fromY}, ${toX - controlX} ${toY}, ${toX} ${toY}`}
                fill="none"
                stroke="#d1d9e2"
                strokeWidth={1.75}
                strokeLinecap="round"
              />
            );
          })}

          {layout.nodes.map((node) => {
            const status = replay.getNodeStatusAt(node.id, selectedTick)?.status ?? 'unknown';
            const statusStyle = styleForStatus(status as NodeStatus);
            const isSelected = node.id === selectedNodeId;
            const shapeStyle: CSSProperties = {
              fill: typeof statusStyle.backgroundColor === 'string' ? statusStyle.backgroundColor : '#eef2f5',
              stroke: isSelected ? '#101925' : '#d7dfe7',
              strokeWidth: isSelected ? 2.5 : 1.5,
              cursor: 'pointer',
            };
            const textColour = typeof statusStyle.color === 'string' ? statusStyle.color : '#263445';

            return (
              <g key={node.id} className="tree-node-group" onClick={() => onSelectNode(node.id)}>
                <rect x={node.x} y={node.y} width={NODE_WIDTH} height={NODE_HEIGHT} rx={16} style={shapeStyle} />
                <circle cx={node.x + 16} cy={node.y + 18} r={4.5} fill={textColour} opacity={0.9} />
                <text x={node.x + 28} y={node.y + 22} className="tree-node-name">
                  {node.name}
                </text>
                <text x={node.x + 16} y={node.y + 44} className="tree-node-kind">
                  {node.kind}
                </text>
                <text x={node.x + 16} y={node.y + 61} className="tree-node-status">
                  {status}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
