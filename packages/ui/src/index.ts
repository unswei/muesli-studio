import type { CSSProperties } from 'react';

export type NodeStatus = 'idle' | 'running' | 'success' | 'failure' | 'skipped' | 'unknown';

const statusColours: Record<NodeStatus, CSSProperties> = {
  idle: { backgroundColor: '#eef2f5', color: '#536273' },
  running: { backgroundColor: '#e3f0fb', color: '#19597f' },
  success: { backgroundColor: '#e6f3ea', color: '#2d6a4f' },
  failure: { backgroundColor: '#f9e9eb', color: '#9a3b4d' },
  skipped: { backgroundColor: '#efebfb', color: '#5b4d95' },
  unknown: { backgroundColor: '#eff2f5', color: '#687585' },
};

export function styleForStatus(status: NodeStatus): CSSProperties {
  return statusColours[status] ?? statusColours.unknown;
}
