import type { CSSProperties } from 'react';

export type NodeStatus = 'idle' | 'running' | 'success' | 'failure' | 'skipped' | 'unknown';

const statusColours: Record<NodeStatus, CSSProperties> = {
  idle: { backgroundColor: '#f2f2f2', color: '#303030' },
  running: { backgroundColor: '#d7f0ff', color: '#034f84' },
  success: { backgroundColor: '#d9f7d6', color: '#186b1f' },
  failure: { backgroundColor: '#f9d8d8', color: '#8a1111' },
  skipped: { backgroundColor: '#ece7ff', color: '#443388' },
  unknown: { backgroundColor: '#f0f0f0', color: '#555555' },
};

export function styleForStatus(status: NodeStatus): CSSProperties {
  return statusColours[status] ?? statusColours.unknown;
}
