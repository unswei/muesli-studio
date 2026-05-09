import type { PresentationLayout } from './evidence';

export type StudioDeepLinkView = 'overview' | PresentationLayout;

export interface ReplayLinkQuery {
  jsonlUrl: string;
  sidecarUrl: string | null;
}

export interface InspectionStateQuery {
  selectedTick: number | null;
  selectedNodeId: string | null;
  view: StudioDeepLinkView | null;
}

export type ShareableReplaySource =
  | {
      kind: 'demo';
      jsonlPath: string;
      sidecarPath: string | null;
    }
  | {
      kind: 'url';
      jsonlUrl: string;
      sidecarUrl: string | null;
    }
  | {
      kind: 'none';
    };

function sanitisePath(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitiseTick(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function sanitiseNodeId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitiseView(value: string | null): StudioDeepLinkView | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (
    trimmed === 'overview' ||
    trimmed === 'hero' ||
    trimmed === 'summary' ||
    trimmed === 'node' ||
    trimmed === 'diff' ||
    trimmed === 'compare' ||
    trimmed === 'dsl'
  ) {
    return trimmed;
  }

  return null;
}

function clearStudioSourceParams(params: URLSearchParams): void {
  params.delete('demo_fixture');
  params.delete('demo_sidecar');
  params.delete('demo_tick');
  params.delete('demo_node');
  params.delete('demo_capture');
  params.delete('replay_url');
  params.delete('replay_sidecar');
}

function clearStudioStateParams(params: URLSearchParams): void {
  params.delete('tick');
  params.delete('node');
  params.delete('view');
}

export function parseReplayLinkQuery(search: string): ReplayLinkQuery | null {
  const query = new URLSearchParams(search);
  const jsonlUrl = sanitisePath(query.get('replay_url'));
  if (!jsonlUrl) {
    return null;
  }

  return {
    jsonlUrl,
    sidecarUrl: sanitisePath(query.get('replay_sidecar')),
  };
}

export function parseInspectionStateQuery(search: string): InspectionStateQuery {
  const query = new URLSearchParams(search);

  return {
    selectedTick: sanitiseTick(query.get('tick')),
    selectedNodeId: sanitiseNodeId(query.get('node')),
    view: sanitiseView(query.get('view')),
  };
}

export function buildShareableSearch(
  currentSearch: string,
  source: ShareableReplaySource,
  state: {
    selectedTick: number;
    selectedNodeId: string | null;
    view: StudioDeepLinkView;
  },
): string {
  const params = new URLSearchParams(currentSearch);

  clearStudioSourceParams(params);
  clearStudioStateParams(params);

  if (source.kind === 'demo') {
    params.set('demo_fixture', source.jsonlPath);
    if (source.sidecarPath) {
      params.set('demo_sidecar', source.sidecarPath);
    }
  } else if (source.kind === 'url') {
    params.set('replay_url', source.jsonlUrl);
    if (source.sidecarUrl) {
      params.set('replay_sidecar', source.sidecarUrl);
    }
  } else {
    const nextSearch = params.toString();
    return nextSearch.length > 0 ? `?${nextSearch}` : '';
  }

  params.set('tick', String(Math.max(0, Math.trunc(state.selectedTick))));
  if (state.selectedNodeId) {
    params.set('node', state.selectedNodeId);
  }
  params.set('view', state.view);

  const nextSearch = params.toString();
  return nextSearch.length > 0 ? `?${nextSearch}` : '';
}
