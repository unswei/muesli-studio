import type { ValidatedMbtEvent } from '@muesli/protocol';
import {
  extractTickEventsBySidecar,
  parseJsonlEvents,
  parseJsonlEventsWithOptionalSidecar,
  parseTickSidecarIndex,
  ReplayStore,
  type JsonlParseError,
  type TickSidecarIndexV1,
} from '@muesli/replay';
import { create } from 'zustand';

import type { CompiledBtDefinition } from './dsl-compiler';

export type LiveStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type LiveHistoryLevel = 'info' | 'warning' | 'error';
export type ReplaySourceKind = 'text' | 'file' | 'url';
export type ReplaySeekMode = 'full-scan' | 'cached' | 'hydrated';

export interface LiveHistoryEntry {
  atUnixMs: number;
  level: LiveHistoryLevel;
  message: string;
}

export interface ReplaySeekStats {
  count: number;
  last_duration_ms: number | null;
  mean_duration_ms: number | null;
  max_duration_ms: number | null;
  last_tick: number | null;
  last_mode: ReplaySeekMode | null;
  last_hydrated_ticks: number;
}

const LARGE_LOG_FALLBACK_THRESHOLD_BYTES = 2 * 1024 * 1024;
const LARGE_LOG_LAZY_THRESHOLD_BYTES = LARGE_LOG_FALLBACK_THRESHOLD_BYTES;
const LAZY_HYDRATION_BATCH_TICK_LIMIT = 32;
const LAZY_HYDRATION_BATCH_BYTE_LIMIT = 256 * 1024;
const LAZY_HYDRATION_LOOKAHEAD_TICKS = 8;
const LAZY_HYDRATION_WINDOW_RADIUS = 24;

type LazySidecarSource =
  | {
      kind: 'text';
      eventsText: string;
    }
  | {
      kind: 'file';
      file: File;
    }
  | {
      kind: 'url';
      jsonlUrl: string;
    };

interface LazySidecarReplayState {
  source: LazySidecarSource;
  index: TickSidecarIndexV1;
  loadedTicks: Set<number>;
  pendingTicks: Set<number>;
}

interface LazySidecarLoad {
  replay: ReplayStore;
  errors: JsonlParseError[];
  selectedTick: number;
  loadedTicks: Set<number>;
  sourceBytes?: number;
  loadedBytesEstimate: number;
}

interface LazyHydrationBatch {
  ticks: number[];
  byteStart: number;
  byteEnd: number;
  lineStart: number;
}

class RangeFallbackToFullTextError extends Error {
  readonly fullText: string;

  readonly sourceBytes: number;

  constructor(message: string, fullText: string, sourceBytes: number) {
    super(message);
    this.name = 'RangeFallbackToFullTextError';
    this.fullText = fullText;
    this.sourceBytes = sourceBytes;
  }
}

function largeLogFallbackWarning(sourceBytes: number, indexUsed: boolean): string | null {
  if (indexUsed || sourceBytes < LARGE_LOG_FALLBACK_THRESHOLD_BYTES) {
    return null;
  }

  return 'This large run opened in standard loading mode and may feel slower. Add an index file next time if you have one.';
}

function shiftJsonlParseErrors(errors: JsonlParseError[], lineOffset: number): JsonlParseError[] {
  if (lineOffset <= 0 || errors.length === 0) {
    return errors;
  }

  return errors.map((error) => ({
    ...error,
    line: error.line + lineOffset,
  }));
}

function mergeParseErrors(existing: JsonlParseError[], incoming: JsonlParseError[]): JsonlParseError[] {
  if (incoming.length === 0) {
    return existing;
  }

  return [...existing, ...incoming].slice(-100);
}

function lazyTicksToHydrate(index: TickSidecarIndexV1, loadedTicks: Set<number>, pendingTicks: Set<number>, targetTick: number): number[] {
  return lazyTicksToHydrateInRange(index, loadedTicks, pendingTicks, 0, targetTick);
}

function lazyTicksToHydrateInRange(
  index: TickSidecarIndexV1,
  loadedTicks: Set<number>,
  pendingTicks: Set<number>,
  startTick: number,
  endTick: number,
): number[] {
  const ticks: number[] = [];
  for (const entry of index.tick_entries) {
    if (entry.tick < startTick) {
      continue;
    }

    if (entry.tick > endTick) {
      break;
    }

    if (!loadedTicks.has(entry.tick) && !pendingTicks.has(entry.tick)) {
      ticks.push(entry.tick);
    }
  }

  return ticks;
}

function buildLazyHydrationBatches(index: TickSidecarIndexV1, ticks: readonly number[]): LazyHydrationBatch[] {
  if (ticks.length === 0) {
    return [];
  }

  const selectedTicks = new Set(ticks);
  const batches: LazyHydrationBatch[] = [];
  let current: LazyHydrationBatch | null = null;

  for (const entry of index.tick_entries) {
    if (!selectedTicks.has(entry.tick)) {
      continue;
    }

    if (!current) {
      current = {
        ticks: [entry.tick],
        byteStart: entry.byte_start,
        byteEnd: entry.byte_end,
        lineStart: entry.line_start,
      };
      continue;
    }

    const nextByteEnd = entry.byte_end;
    const exceedsTickLimit = current.ticks.length >= LAZY_HYDRATION_BATCH_TICK_LIMIT;
    const exceedsByteLimit = nextByteEnd - current.byteStart > LAZY_HYDRATION_BATCH_BYTE_LIMIT;
    if (exceedsTickLimit || exceedsByteLimit) {
      batches.push(current);
      current = {
        ticks: [entry.tick],
        byteStart: entry.byte_start,
        byteEnd: entry.byte_end,
        lineStart: entry.line_start,
      };
      continue;
    }

    current.ticks.push(entry.tick);
    current.byteEnd = nextByteEnd;
  }

  if (current) {
    batches.push(current);
  }

  return batches;
}

function parseHeaderByteCount(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseContentRangeTotal(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = /^bytes\s+\d+-\d+\/(\d+)$/.exec(value);
  if (!match) {
    return null;
  }

  return parseHeaderByteCount(match[1] ?? null);
}

function estimateSourceBytesFromIndex(index: TickSidecarIndexV1): number {
  const lastEntry = index.tick_entries[index.tick_entries.length - 1];
  return lastEntry?.byte_end ?? 0;
}

function textByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function emptyReplaySeekStats(): ReplaySeekStats {
  return {
    count: 0,
    last_duration_ms: null,
    mean_duration_ms: null,
    max_duration_ms: null,
    last_tick: null,
    last_mode: null,
    last_hydrated_ticks: 0,
  };
}

function recordReplaySeek(
  stats: ReplaySeekStats,
  durationMs: number,
  tick: number,
  mode: ReplaySeekMode,
  hydratedTicks: number,
): ReplaySeekStats {
  const safeDurationMs = Math.max(0, durationMs);
  const count = stats.count + 1;
  const meanDurationMs =
    stats.mean_duration_ms === null ? safeDurationMs : ((stats.mean_duration_ms * stats.count) + safeDurationMs) / count;

  return {
    count,
    last_duration_ms: safeDurationMs,
    mean_duration_ms: meanDurationMs,
    max_duration_ms: stats.max_duration_ms === null ? safeDurationMs : Math.max(stats.max_duration_ms, safeDurationMs),
    last_tick: tick,
    last_mode: mode,
    last_hydrated_ticks: hydratedTicks,
  };
}

function appendTickEventsFromText(
  replay: ReplayStore,
  eventsText: string,
  index: TickSidecarIndexV1,
  ticks: Iterable<number>,
): Set<number> {
  const loadedTicks = new Set<number>();
  for (const tick of ticks) {
    const events = extractTickEventsBySidecar(eventsText, index, tick);
    if (events.length > 0) {
      replay.appendMany(events);
    }
    loadedTicks.add(tick);
  }

  return loadedTicks;
}

function initialiseLazySidecarReplay(eventsText: string, index: TickSidecarIndexV1): LazySidecarLoad {
  const replay = new ReplayStore();
  const loadedTicks = new Set<number>();
  const firstTick = index.tick_entries[0];

  const encoded = new TextEncoder().encode(eventsText);
  const bootstrapByteEnd = firstTick?.byte_start ?? encoded.length;
  const bootstrapText = new TextDecoder().decode(encoded.subarray(0, bootstrapByteEnd));
  const bootstrap = parseJsonlEvents(bootstrapText);
  replay.appendMany(bootstrap.events);

  const parseErrors = [...bootstrap.errors];
  if (firstTick) {
    const firstTickEvents = extractTickEventsBySidecar(eventsText, index, firstTick.tick);
    replay.appendMany(firstTickEvents);
    loadedTicks.add(firstTick.tick);
  }

  const selectedTick = firstTick?.tick ?? (replay.maxTick >= 0 ? replay.maxTick : 0);
  return {
    replay,
    errors: parseErrors,
    selectedTick,
    loadedTicks,
    loadedBytesEstimate: encoded.length,
  };
}

async function readFileSliceText(file: File, byteStart: number, byteEnd: number): Promise<string> {
  return file.slice(byteStart, byteEnd).text();
}

async function fetchUrlSliceText(
  jsonlUrl: string,
  byteStart: number,
  byteEnd: number,
): Promise<{ text: string; sourceBytes: number; partial: boolean }> {
  if (byteEnd <= byteStart) {
    return {
      text: '',
      sourceBytes: 0,
      partial: true,
    };
  }

  const response = await fetch(jsonlUrl, {
    headers: {
      Range: `bytes=${byteStart}-${byteEnd - 1}`,
    },
  });

  if (!response.ok) {
    throw new Error(`failed to fetch replay range: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const sourceBytes =
    parseContentRangeTotal(response.headers.get('content-range')) ??
    parseHeaderByteCount(response.headers.get('content-length')) ??
    new TextEncoder().encode(text).byteLength;

  return {
    text,
    sourceBytes,
    partial: response.status === 206,
  };
}

async function initialiseLazySidecarReplayFromFile(
  file: File,
  index: TickSidecarIndexV1,
  onProgress: (percent: number) => void,
): Promise<LazySidecarLoad> {
  const replay = new ReplayStore();
  const loadedTicks = new Set<number>();
  const parseErrors: JsonlParseError[] = [];

  const totalBytes = Math.max(file.size, 1);
  let loadedBytes = 0;

  const firstTick = index.tick_entries[0];
  const bootstrapByteEnd = firstTick?.byte_start ?? file.size;
  if (bootstrapByteEnd > 0) {
    const bootstrapText = await readFileSliceText(file, 0, bootstrapByteEnd);
    loadedBytes += bootstrapByteEnd;
    onProgress(Math.min(95, Math.round((loadedBytes / totalBytes) * 100)));

    const bootstrap = parseJsonlEvents(bootstrapText);
    replay.appendMany(bootstrap.events);
    parseErrors.push(...bootstrap.errors);
  }

  if (firstTick) {
    const firstTickText = await readFileSliceText(file, firstTick.byte_start, firstTick.byte_end);
    loadedBytes += firstTick.byte_end - firstTick.byte_start;
    onProgress(Math.min(99, Math.round((loadedBytes / totalBytes) * 100)));

    const parsed = parseJsonlEvents(firstTickText);
    replay.appendMany(parsed.events.filter((event) => event.tick === firstTick.tick));
    parseErrors.push(...shiftJsonlParseErrors(parsed.errors, firstTick.line_start - 1));
    loadedTicks.add(firstTick.tick);
  }

  onProgress(100);
  const selectedTick = firstTick?.tick ?? (replay.maxTick >= 0 ? replay.maxTick : 0);
  return {
    replay,
    errors: parseErrors.slice(-100),
    selectedTick,
    loadedTicks,
    loadedBytesEstimate: loadedBytes,
  };
}

async function initialiseLazySidecarReplayFromUrl(
  jsonlUrl: string,
  index: TickSidecarIndexV1,
  sourceBytesHint: number,
  onProgress: (percent: number) => void,
): Promise<LazySidecarLoad> {
  const replay = new ReplayStore();
  const loadedTicks = new Set<number>();
  const parseErrors: JsonlParseError[] = [];

  const totalBytes = Math.max(sourceBytesHint, 1);
  let sourceBytes = totalBytes;
  let loadedBytes = 0;

  const firstTick = index.tick_entries[0];
  const bootstrapByteEnd = firstTick?.byte_start ?? totalBytes;
  if (bootstrapByteEnd > 0) {
    const bootstrap = await fetchUrlSliceText(jsonlUrl, 0, bootstrapByteEnd);
    sourceBytes = Math.max(sourceBytes, bootstrap.sourceBytes);
    if (!bootstrap.partial) {
      throw new RangeFallbackToFullTextError('URL range requests unavailable for lazy replay load', bootstrap.text, sourceBytes);
    }

    loadedBytes += bootstrapByteEnd;
    onProgress(Math.min(95, Math.round((loadedBytes / Math.max(sourceBytes, 1)) * 100)));

    const parsed = parseJsonlEvents(bootstrap.text);
    replay.appendMany(parsed.events);
    parseErrors.push(...parsed.errors);
  }

  if (firstTick) {
    const firstTickText = await fetchUrlSliceText(jsonlUrl, firstTick.byte_start, firstTick.byte_end);
    sourceBytes = Math.max(sourceBytes, firstTickText.sourceBytes);
    if (!firstTickText.partial) {
      throw new RangeFallbackToFullTextError(
        'URL range requests unavailable for lazy replay load',
        firstTickText.text,
        sourceBytes,
      );
    }

    loadedBytes += firstTick.byte_end - firstTick.byte_start;
    onProgress(Math.min(99, Math.round((loadedBytes / Math.max(sourceBytes, 1)) * 100)));

    const parsed = parseJsonlEvents(firstTickText.text);
    replay.appendMany(parsed.events.filter((event) => event.tick === firstTick.tick));
    parseErrors.push(...shiftJsonlParseErrors(parsed.errors, firstTick.line_start - 1));
    loadedTicks.add(firstTick.tick);
  }

  onProgress(100);
  const selectedTick = firstTick?.tick ?? (replay.maxTick >= 0 ? replay.maxTick : 0);
  return {
    replay,
    errors: parseErrors.slice(-100),
    selectedTick,
    loadedTicks,
    sourceBytes,
    loadedBytesEstimate: loadedBytes,
  };
}

async function readFileTextWithProgress(file: File, onProgress: (percent: number) => void): Promise<string> {
  if (!file.stream) {
    const text = await file.text();
    onProgress(100);
    return text;
  }

  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let loadedBytes = 0;
  const totalBytes = Math.max(file.size, 1);

  onProgress(0);
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    const value = chunk.value ?? new Uint8Array();
    loadedBytes += value.byteLength;
    parts.push(decoder.decode(value, { stream: true }));
    onProgress(Math.min(99, Math.round((loadedBytes / totalBytes) * 100)));
  }

  parts.push(decoder.decode());
  onProgress(100);
  return parts.join('');
}

interface StudioState {
  replay: ReplayStore | null;
  eventCount: number;
  selectedTick: number;
  selectedNodeId: string | null;
  parseErrors: JsonlParseError[];
  replayLoadProgress: number | null;
  replayIndexed: boolean;
  replayLoadWarning: string | null;
  replaySourceBytes: number;
  replaySourceKind: ReplaySourceKind;
  replaySourceUrl: string | null;
  replaySidecarUrl: string | null;
  replayLoadedBytesEstimate: number;
  replaySeekStats: ReplaySeekStats;
  replayMaxTick: number;
  treeRevision: number;
  lazySidecar: LazySidecarReplayState | null;
  mode: 'replay' | 'live';
  liveUrl: string;
  liveStatus: LiveStatus;
  liveAutoFollow: boolean;
  liveReconnectEnabled: boolean;
  liveLastError: string | null;
  liveLastEventUnixMs: number | null;
  liveHistory: LiveHistoryEntry[];
  loadJsonl: (
    text: string,
    sidecarText?: string | null,
    sourceBytes?: number,
    sourceKind?: ReplaySourceKind,
    sourceUrl?: string | null,
    sidecarUrl?: string | null,
  ) => void;
  loadJsonlFromFiles: (jsonlFile: File, sidecarFile?: File | null) => Promise<void>;
  loadJsonlFromUrl: (jsonlUrl: string, sidecarUrl?: string | null) => Promise<void>;
  hydrateTickWindow: (centreTick: number, radius?: number) => Promise<void>;
  hydrateAllLazyTicks: () => Promise<void>;
  appendLiveEvents: (events: ValidatedMbtEvent[]) => void;
  applyCompiledTree: (compiled: CompiledBtDefinition) => void;
  resetCompiledTree: () => void;
  setSelectedTick: (tick: number) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setLiveUrl: (url: string) => void;
  setLiveStatus: (status: LiveStatus, error?: string | null) => void;
  setLiveAutoFollow: (enabled: boolean) => void;
  setLiveReconnectEnabled: (enabled: boolean) => void;
  addLiveHistory: (entry: Omit<LiveHistoryEntry, 'atUnixMs'> & { atUnixMs?: number }) => void;
  clearLiveHistory: () => void;
  addParseError: (error: JsonlParseError) => void;
}

export const useStudioStore = create<StudioState>((set, get) => {
  const hydrateLazyTextTicks = (ticks: readonly number[]): number => {
    if (ticks.length === 0) {
      return 0;
    }

    const state = get();
    const lazy = state.lazySidecar;
    const replay = state.replay;
    if (!lazy || lazy.source.kind !== 'text' || !replay) {
      return 0;
    }

    const loadedTicks = new Set(lazy.loadedTicks);
    const hydratedTicks = appendTickEventsFromText(replay, lazy.source.eventsText, lazy.index, ticks);
    for (const tick of hydratedTicks) {
      loadedTicks.add(tick);
    }

    set({
      replay,
      eventCount: replay.getAllEvents().length,
      selectedNodeId: state.selectedNodeId ?? replay.getFirstTreeNodeId(),
      lazySidecar: {
        ...lazy,
        loadedTicks,
      },
    });

    return hydratedTicks.size;
  };

  const ensureLazyFileTicksLoaded = async (ticks: readonly number[]): Promise<number> => {
    if (ticks.length === 0) {
      return 0;
    }

    const start = get().lazySidecar;
    if (!start || start.source.kind !== 'file') {
      return 0;
    }

    const batches = buildLazyHydrationBatches(start.index, ticks);
    let loadedTickCount = 0;
    for (const batch of batches) {
      const beforeLoad = get().lazySidecar;
      if (!beforeLoad || beforeLoad.source.kind !== 'file') {
        return loadedTickCount;
      }

      const pendingTicks = new Set(beforeLoad.pendingTicks);
      for (const tick of batch.ticks) {
        pendingTicks.add(tick);
      }
      set({
        lazySidecar: {
          ...beforeLoad,
          pendingTicks,
        },
      });

      try {
        const text = await readFileSliceText(beforeLoad.source.file, batch.byteStart, batch.byteEnd);
        const parsed = parseJsonlEvents(text);
        const tickSet = new Set(batch.ticks);
        const tickEvents = parsed.events.filter((event) => typeof event.tick === 'number' && tickSet.has(event.tick));
        const shiftedErrors = shiftJsonlParseErrors(parsed.errors, batch.lineStart - 1);
        const loadedBytes = Math.max(0, batch.byteEnd - batch.byteStart);

        set((state) => {
          const currentLazy = state.lazySidecar;
          if (!currentLazy || currentLazy.source.kind !== 'file') {
            return state;
          }

          const nextPending = new Set(currentLazy.pendingTicks);
          for (const tick of batch.ticks) {
            nextPending.delete(tick);
          }

          const nextLoaded = new Set(currentLazy.loadedTicks);
          let newlyLoaded = 0;
          for (const tick of batch.ticks) {
            if (!nextLoaded.has(tick)) {
              nextLoaded.add(tick);
              newlyLoaded += 1;
            }
          }

          if (newlyLoaded === 0) {
            return {
              lazySidecar: {
                ...currentLazy,
                pendingTicks: nextPending,
              },
              parseErrors: mergeParseErrors(state.parseErrors, shiftedErrors),
            };
          }

          const replay = state.replay ?? new ReplayStore();
          if (tickEvents.length > 0) {
            replay.appendMany(tickEvents);
          }

          return {
            replay,
            eventCount: replay.getAllEvents().length,
            replayLoadedBytesEstimate: state.replayLoadedBytesEstimate + loadedBytes,
            selectedNodeId: state.selectedNodeId ?? replay.getFirstTreeNodeId(),
            parseErrors: mergeParseErrors(state.parseErrors, shiftedErrors),
            lazySidecar: {
              ...currentLazy,
              loadedTicks: nextLoaded,
              pendingTicks: nextPending,
            },
          };
        });
        loadedTickCount += batch.ticks.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set((state) => {
          const currentLazy = state.lazySidecar;
          if (!currentLazy || currentLazy.source.kind !== 'file') {
            return state;
          }

          const nextPending = new Set(currentLazy.pendingTicks);
          for (const tick of batch.ticks) {
            nextPending.delete(tick);
          }
          return {
            lazySidecar: {
              ...currentLazy,
              pendingTicks: nextPending,
            },
            parseErrors: mergeParseErrors(state.parseErrors, [
              {
                line: batch.lineStart,
                message: `lazy tick load failed: ${message}`,
                raw: `ticks ${batch.ticks[0]}-${batch.ticks[batch.ticks.length - 1]}`,
              },
            ]),
          };
        });
      }
    }

    return loadedTickCount;
  };

  const ensureLazyFileTicksLoadedUpTo = async (targetTick: number): Promise<number> => {
    const start = get().lazySidecar;
    if (!start || start.source.kind !== 'file') {
      return 0;
    }

    return ensureLazyFileTicksLoaded(lazyTicksToHydrate(start.index, start.loadedTicks, start.pendingTicks, targetTick));
  };

  const ensureLazyFileTicksLoadedInRange = async (startTick: number, endTick: number): Promise<number> => {
    const start = get().lazySidecar;
    if (!start || start.source.kind !== 'file') {
      return 0;
    }

    return ensureLazyFileTicksLoaded(
      lazyTicksToHydrateInRange(start.index, start.loadedTicks, start.pendingTicks, startTick, endTick),
    );
  };

  const ensureLazyUrlTicksLoaded = async (ticks: readonly number[]): Promise<number> => {
    if (ticks.length === 0) {
      return 0;
    }

    const start = get().lazySidecar;
    if (!start || start.source.kind !== 'url') {
      return 0;
    }

    const batches = buildLazyHydrationBatches(start.index, ticks);
    let loadedTickCount = 0;
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      if (!batch) {
        continue;
      }
      const beforeLoad = get().lazySidecar;
      if (!beforeLoad || beforeLoad.source.kind !== 'url') {
        return loadedTickCount;
      }

      const pendingTicks = new Set(beforeLoad.pendingTicks);
      for (const tick of batch.ticks) {
        pendingTicks.add(tick);
      }
      set({
        lazySidecar: {
          ...beforeLoad,
          pendingTicks,
        },
      });

      try {
        const range = await fetchUrlSliceText(beforeLoad.source.jsonlUrl, batch.byteStart, batch.byteEnd);
        if (!range.partial) {
          const remainingTicks = batches.slice(batchIndex).flatMap((entry) => entry.ticks);
          set((state) => {
            const currentLazy = state.lazySidecar;
            if (!currentLazy || currentLazy.source.kind !== 'url') {
              return state;
            }

            const nextPending = new Set(currentLazy.pendingTicks);
            for (const tick of remainingTicks) {
              nextPending.delete(tick);
            }

            const replay = state.replay ?? new ReplayStore();
            const nextLoaded = new Set(currentLazy.loadedTicks);
            const hydratedTicks = appendTickEventsFromText(replay, range.text, currentLazy.index, remainingTicks);
            for (const hydratedTick of hydratedTicks) {
              nextLoaded.add(hydratedTick);
            }

            return {
              replay,
              eventCount: replay.getAllEvents().length,
              replaySourceBytes: Math.max(state.replaySourceBytes, range.sourceBytes),
              replayLoadedBytesEstimate: Math.max(state.replayLoadedBytesEstimate, range.sourceBytes),
              selectedNodeId: state.selectedNodeId ?? replay.getFirstTreeNodeId(),
              lazySidecar: {
                source: {
                  kind: 'text',
                  eventsText: range.text,
                },
                index: currentLazy.index,
                loadedTicks: nextLoaded,
                pendingTicks: nextPending,
              },
            };
          });
          loadedTickCount += remainingTicks.length;
          return loadedTickCount;
        }

        const parsed = parseJsonlEvents(range.text);
        const tickSet = new Set(batch.ticks);
        const tickEvents = parsed.events.filter((event) => typeof event.tick === 'number' && tickSet.has(event.tick));
        const shiftedErrors = shiftJsonlParseErrors(parsed.errors, batch.lineStart - 1);
        const loadedBytes = Math.max(0, batch.byteEnd - batch.byteStart);

        set((state) => {
          const currentLazy = state.lazySidecar;
          if (!currentLazy || currentLazy.source.kind !== 'url') {
            return state;
          }

          const nextPending = new Set(currentLazy.pendingTicks);
          for (const tick of batch.ticks) {
            nextPending.delete(tick);
          }

          const nextLoaded = new Set(currentLazy.loadedTicks);
          let newlyLoaded = 0;
          for (const tick of batch.ticks) {
            if (!nextLoaded.has(tick)) {
              nextLoaded.add(tick);
              newlyLoaded += 1;
            }
          }

          if (newlyLoaded === 0) {
            return {
              replaySourceBytes: Math.max(state.replaySourceBytes, range.sourceBytes),
              lazySidecar: {
                ...currentLazy,
                pendingTicks: nextPending,
              },
              parseErrors: mergeParseErrors(state.parseErrors, shiftedErrors),
            };
          }

          const replay = state.replay ?? new ReplayStore();
          if (tickEvents.length > 0) {
            replay.appendMany(tickEvents);
          }

          return {
            replay,
            eventCount: replay.getAllEvents().length,
            replaySourceBytes: Math.max(state.replaySourceBytes, range.sourceBytes),
            replayLoadedBytesEstimate: state.replayLoadedBytesEstimate + loadedBytes,
            selectedNodeId: state.selectedNodeId ?? replay.getFirstTreeNodeId(),
            parseErrors: mergeParseErrors(state.parseErrors, shiftedErrors),
            lazySidecar: {
              ...currentLazy,
              loadedTicks: nextLoaded,
              pendingTicks: nextPending,
            },
          };
        });
        loadedTickCount += batch.ticks.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set((state) => {
          const currentLazy = state.lazySidecar;
          if (!currentLazy || currentLazy.source.kind !== 'url') {
            return state;
          }

          const nextPending = new Set(currentLazy.pendingTicks);
          for (const tick of batch.ticks) {
            nextPending.delete(tick);
          }
          return {
            lazySidecar: {
              ...currentLazy,
              pendingTicks: nextPending,
            },
            parseErrors: mergeParseErrors(state.parseErrors, [
              {
                line: batch.lineStart,
                message: `lazy tick load failed: ${message}`,
                raw: `ticks ${batch.ticks[0]}-${batch.ticks[batch.ticks.length - 1]}`,
              },
            ]),
          };
        });
      }
    }

    return loadedTickCount;
  };

  const ensureLazyUrlTicksLoadedUpTo = async (targetTick: number): Promise<number> => {
    const start = get().lazySidecar;
    if (!start || start.source.kind !== 'url') {
      return 0;
    }

    return ensureLazyUrlTicksLoaded(lazyTicksToHydrate(start.index, start.loadedTicks, start.pendingTicks, targetTick));
  };

  const ensureLazyUrlTicksLoadedInRange = async (startTick: number, endTick: number): Promise<number> => {
    const start = get().lazySidecar;
    if (!start || start.source.kind !== 'url') {
      return 0;
    }

    return ensureLazyUrlTicksLoaded(
      lazyTicksToHydrateInRange(start.index, start.loadedTicks, start.pendingTicks, startTick, endTick),
    );
  };

  return {
    replay: null,
    eventCount: 0,
    selectedTick: 0,
    selectedNodeId: null,
    parseErrors: [],
    replayLoadProgress: null,
    replayIndexed: false,
    replayLoadWarning: null,
    replaySourceBytes: 0,
    replaySourceKind: 'text',
    replaySourceUrl: null,
    replaySidecarUrl: null,
    replayLoadedBytesEstimate: 0,
    replaySeekStats: emptyReplaySeekStats(),
    replayMaxTick: 0,
    treeRevision: 0,
    lazySidecar: null,
    mode: 'replay',
    liveUrl: 'ws://localhost:8765/events',
    liveStatus: 'disconnected',
    liveAutoFollow: true,
    liveReconnectEnabled: true,
    liveLastError: null,
    liveLastEventUnixMs: null,
    liveHistory: [],

    loadJsonl: (text, sidecarText = null, sourceBytes = 0, sourceKind = 'text', sourceUrl = null, sidecarUrl = null) => {
      const effectiveSourceBytes = Math.max(sourceBytes, textByteLength(text));
      const hasSidecarText = Boolean(sidecarText && sidecarText.trim().length > 0);
      const prefersLazySidecar = effectiveSourceBytes >= LARGE_LOG_LAZY_THRESHOLD_BYTES && hasSidecarText;
      if (prefersLazySidecar && sidecarText) {
        try {
          const index = parseTickSidecarIndex(sidecarText);
          if (index.tick_entries.length > 0) {
            const lazy = initialiseLazySidecarReplay(text, index);
            set({
              replay: lazy.replay,
              eventCount: lazy.replay.getAllEvents().length,
              parseErrors: lazy.errors,
              replayLoadProgress: null,
              replayIndexed: true,
              replayLoadWarning: 'This large run loads nearby parts as needed so you can start inspecting sooner.',
              replaySourceBytes: effectiveSourceBytes,
              replaySourceKind: sourceKind,
              replaySourceUrl: sourceUrl,
              replaySidecarUrl: sidecarUrl,
              replayLoadedBytesEstimate: lazy.loadedBytesEstimate,
              replaySeekStats: emptyReplaySeekStats(),
              replayMaxTick: index.max_tick,
              treeRevision: 0,
              selectedTick: lazy.selectedTick,
              selectedNodeId: lazy.replay.getFirstTreeNodeId(),
              lazySidecar: {
                source: {
                  kind: 'text',
                  eventsText: text,
                },
                index,
                loadedTicks: lazy.loadedTicks,
                pendingTicks: new Set<number>(),
              },
              mode: 'replay',
            });
            return;
          }
        } catch {
          // fallback to standard parser path below
        }
      }

      const result = parseJsonlEventsWithOptionalSidecar(text, sidecarText);
      const replay = new ReplayStore();
      replay.appendMany(result.events);

      const warnings = [result.sidecar.warning, largeLogFallbackWarning(effectiveSourceBytes, result.sidecar.index_used)].filter(
        (warning): warning is string => Boolean(warning && warning.length > 0),
      );
      const replayLoadWarning = warnings.length > 0 ? warnings.join(' ') : null;

      set({
        replay,
        eventCount: replay.getAllEvents().length,
        parseErrors: result.errors,
        replayLoadProgress: null,
        replayIndexed: result.sidecar.index_used,
        replayLoadWarning,
        replaySourceBytes: effectiveSourceBytes,
        replaySourceKind: sourceKind,
        replaySourceUrl: sourceUrl,
        replaySidecarUrl: sidecarUrl,
        replayLoadedBytesEstimate: effectiveSourceBytes,
        replaySeekStats: emptyReplaySeekStats(),
        replayMaxTick: result.sidecar.index_used ? result.sidecar.max_tick : Math.max(replay.maxTick, 0),
        treeRevision: 0,
        selectedTick: replay.maxTick >= 0 ? replay.maxTick : 0,
        selectedNodeId: replay.getFirstTreeNodeId(),
        lazySidecar: null,
        mode: 'replay',
      });
    },

    loadJsonlFromFiles: async (jsonlFile, sidecarFile = null) => {
      set({
        replayLoadProgress: 0,
        parseErrors: [],
        replayLoadWarning: null,
      });

      let sidecarText: string | null = null;
      if (sidecarFile) {
        sidecarText = await sidecarFile.text();
      }

      const hasSidecarText = Boolean(sidecarText && sidecarText.trim().length > 0);
      const prefersLazySidecar = jsonlFile.size >= LARGE_LOG_LAZY_THRESHOLD_BYTES && hasSidecarText;
      if (prefersLazySidecar && sidecarText) {
        try {
          const index = parseTickSidecarIndex(sidecarText);
          if (index.tick_entries.length > 0) {
            const lazy = await initialiseLazySidecarReplayFromFile(jsonlFile, index, (percent) => {
              set({ replayLoadProgress: percent });
            });
            set({
              replay: lazy.replay,
              eventCount: lazy.replay.getAllEvents().length,
              parseErrors: lazy.errors,
              replayLoadProgress: null,
              replayIndexed: true,
              replayLoadWarning: 'This large run loads nearby parts as needed so you can start inspecting sooner.',
              replaySourceBytes: jsonlFile.size,
              replaySourceKind: 'file',
              replaySourceUrl: null,
              replaySidecarUrl: null,
              replayLoadedBytesEstimate: lazy.loadedBytesEstimate,
              replaySeekStats: emptyReplaySeekStats(),
              replayMaxTick: index.max_tick,
              treeRevision: 0,
              selectedTick: lazy.selectedTick,
              selectedNodeId: lazy.replay.getFirstTreeNodeId(),
              lazySidecar: {
                source: {
                  kind: 'file',
                  file: jsonlFile,
                },
                index,
                loadedTicks: lazy.loadedTicks,
                pendingTicks: new Set<number>(),
              },
              mode: 'replay',
            });
            return;
          }
        } catch {
          // fallback to standard full-file parse below
        }
      }

      const text = await readFileTextWithProgress(jsonlFile, (percent) => {
        set({ replayLoadProgress: percent });
      });

      get().loadJsonl(text, sidecarText, jsonlFile.size, 'file');
    },

    loadJsonlFromUrl: async (jsonlUrl, sidecarUrl = null) => {
      set({
        replayLoadProgress: 0,
        parseErrors: [],
        replayLoadWarning: null,
      });

      try {
        let sidecarText: string | null = null;
        if (sidecarUrl) {
          const sidecarResponse = await fetch(sidecarUrl);
          if (!sidecarResponse.ok) {
            throw new Error(`failed to fetch sidecar: ${sidecarResponse.status} ${sidecarResponse.statusText}`);
          }
          sidecarText = await sidecarResponse.text();
        }

        if (sidecarText) {
          try {
            const index = parseTickSidecarIndex(sidecarText);
            const estimatedSourceBytes = estimateSourceBytesFromIndex(index);
            const prefersLazySidecar =
              estimatedSourceBytes >= LARGE_LOG_LAZY_THRESHOLD_BYTES && index.tick_entries.length > 0;
            if (prefersLazySidecar) {
              try {
                const lazy = await initialiseLazySidecarReplayFromUrl(jsonlUrl, index, estimatedSourceBytes, (percent) => {
                  set({ replayLoadProgress: percent });
                });
                set({
                  replay: lazy.replay,
                  eventCount: lazy.replay.getAllEvents().length,
                  parseErrors: lazy.errors,
                  replayLoadProgress: null,
                  replayIndexed: true,
                  replayLoadWarning: 'This large run loads nearby parts as needed so you can start inspecting sooner.',
                  replaySourceBytes: lazy.sourceBytes ?? estimatedSourceBytes,
                  replaySourceKind: 'url',
                  replaySourceUrl: jsonlUrl,
                  replaySidecarUrl: sidecarUrl,
                  replayLoadedBytesEstimate: lazy.loadedBytesEstimate,
                  replaySeekStats: emptyReplaySeekStats(),
                  replayMaxTick: index.max_tick,
                  treeRevision: 0,
                  selectedTick: lazy.selectedTick,
                  selectedNodeId: lazy.replay.getFirstTreeNodeId(),
                  lazySidecar: {
                    source: {
                      kind: 'url',
                      jsonlUrl,
                    },
                    index,
                    loadedTicks: lazy.loadedTicks,
                    pendingTicks: new Set<number>(),
                  },
                  mode: 'replay',
                });
                return;
              } catch (error) {
                if (error instanceof RangeFallbackToFullTextError) {
                  get().loadJsonl(error.fullText, sidecarText, error.sourceBytes, 'url', jsonlUrl, sidecarUrl);
                  return;
                }
              }
            }
          } catch {
            // fallback to eager URL fetch below
          }
        }

        const jsonlResponse = await fetch(jsonlUrl);
        if (!jsonlResponse.ok) {
          throw new Error(`failed to fetch replay log: ${jsonlResponse.status} ${jsonlResponse.statusText}`);
        }

        const text = await jsonlResponse.text();
        const sourceBytes =
          parseHeaderByteCount(jsonlResponse.headers.get('content-length')) ?? new TextEncoder().encode(text).byteLength;

        get().loadJsonl(text, sidecarText, sourceBytes, 'url', jsonlUrl, sidecarUrl);
      } catch (error) {
        set({ replayLoadProgress: null });
        throw error;
      }
    },

    hydrateTickWindow: async (centreTick, radius = LAZY_HYDRATION_WINDOW_RADIUS) => {
      const state = get();
      const lazy = state.lazySidecar;
      if (!lazy) {
        return;
      }

      const lower = Math.max(0, centreTick - radius);
      const upper = Math.min(lazy.index.max_tick, centreTick + radius);
      if (upper < lower) {
        return;
      }

      if (lazy.source.kind === 'text') {
        hydrateLazyTextTicks(lazyTicksToHydrateInRange(lazy.index, lazy.loadedTicks, lazy.pendingTicks, lower, upper));
        return;
      }

      if (lazy.source.kind === 'file') {
        await ensureLazyFileTicksLoadedInRange(lower, upper);
        return;
      }

      await ensureLazyUrlTicksLoadedInRange(lower, upper);
    },

    hydrateAllLazyTicks: async () => {
      const state = get();
      const lazy = state.lazySidecar;
      if (!lazy) {
        return;
      }

      if (lazy.source.kind === 'text') {
        hydrateLazyTextTicks(lazyTicksToHydrate(lazy.index, lazy.loadedTicks, lazy.pendingTicks, lazy.index.max_tick));
        return;
      }

      if (lazy.source.kind === 'file') {
        await ensureLazyFileTicksLoadedUpTo(lazy.index.max_tick);
        return;
      }

      await ensureLazyUrlTicksLoadedUpTo(lazy.index.max_tick);
    },

    appendLiveEvents: (events) => {
      if (events.length === 0) {
        return;
      }

      set((state) => {
        const replay = state.replay ?? new ReplayStore();
        replay.appendMany(events);

        const selectedNodeId = state.selectedNodeId ?? replay.getFirstTreeNodeId();
        const maxTick = replay.maxTick >= 0 ? replay.maxTick : 0;
        const liveLastEventUnixMs = events.reduce(
          (latest, event) => Math.max(latest, event.unix_ms),
          state.liveLastEventUnixMs ?? 0,
        );

        return {
          replay,
          eventCount: replay.getAllEvents().length,
          selectedNodeId,
          selectedTick: state.liveAutoFollow ? maxTick : Math.max(0, Math.min(state.selectedTick, maxTick)),
          liveLastEventUnixMs,
          replayMaxTick: maxTick,
          lazySidecar: null,
          mode: 'live',
        };
      });
    },

    applyCompiledTree: (compiled) => {
      set((state) => {
        if (!state.replay) {
          return state;
        }

        state.replay.setBtDefOverride({
          dsl: compiled.dsl,
          nodes: compiled.nodes,
          edges: compiled.edges,
        });

        return {
          replay: state.replay,
          selectedNodeId: state.replay.getFirstTreeNodeId(),
          treeRevision: state.treeRevision + 1,
        };
      });
    },

    resetCompiledTree: () => {
      set((state) => {
        if (!state.replay) {
          return state;
        }

        state.replay.clearBtDefOverride();
        return {
          replay: state.replay,
          selectedNodeId: state.replay.getFirstTreeNodeId(),
          treeRevision: state.treeRevision + 1,
        };
      });
    },

    setSelectedTick: (tick) => {
      const state = get();
      const replay = state.replay;
      if (!replay) {
        set({ selectedTick: 0 });
        return;
      }

      const seekStartedAt = nowMs();
      const maxTick = Math.max(state.replayMaxTick, replay.maxTick, 0);
      const bounded = Math.max(0, Math.min(tick, maxTick));
      const lazy = state.lazySidecar;
      if (!lazy || lazy.loadedTicks.has(bounded)) {
        set((current) => ({
          selectedTick: bounded,
          replaySeekStats: recordReplaySeek(
            current.replaySeekStats,
            nowMs() - seekStartedAt,
            bounded,
            current.replayIndexed ? 'cached' : 'full-scan',
            0,
          ),
        }));
        return;
      }

      const hydrateTarget = Math.min(lazy.index.max_tick, bounded + LAZY_HYDRATION_LOOKAHEAD_TICKS);
      const ticksToHydrate = lazyTicksToHydrate(lazy.index, lazy.loadedTicks, lazy.pendingTicks, hydrateTarget);
      if (lazy.source.kind === 'text') {
        const hydratedTickCount = hydrateLazyTextTicks(ticksToHydrate);

        set({
          selectedTick: bounded,
          replaySeekStats: recordReplaySeek(
            state.replaySeekStats,
            nowMs() - seekStartedAt,
            bounded,
            hydratedTickCount > 0 ? 'hydrated' : 'cached',
            hydratedTickCount,
          ),
        });
        return;
      }

      set({ selectedTick: bounded });
      if (lazy.source.kind === 'file') {
        void ensureLazyFileTicksLoadedUpTo(hydrateTarget)
          .then((hydratedTickCount) => {
            set((current) => ({
              replaySeekStats: recordReplaySeek(
                current.replaySeekStats,
                nowMs() - seekStartedAt,
                bounded,
                hydratedTickCount > 0 ? 'hydrated' : 'cached',
                hydratedTickCount,
              ),
            }));
          })
          .catch(() => {
            set((current) => ({
              replaySeekStats: recordReplaySeek(current.replaySeekStats, nowMs() - seekStartedAt, bounded, 'cached', 0),
            }));
          });
        return;
      }

      void ensureLazyUrlTicksLoadedUpTo(hydrateTarget)
        .then((hydratedTickCount) => {
          set((current) => ({
            replaySeekStats: recordReplaySeek(
              current.replaySeekStats,
              nowMs() - seekStartedAt,
              bounded,
              hydratedTickCount > 0 ? 'hydrated' : 'cached',
              hydratedTickCount,
            ),
          }));
        })
        .catch(() => {
          set((current) => ({
            replaySeekStats: recordReplaySeek(current.replaySeekStats, nowMs() - seekStartedAt, bounded, 'cached', 0),
          }));
        });
    },

    setSelectedNodeId: (nodeId) => {
      set({ selectedNodeId: nodeId });
    },

    setLiveUrl: (url) => {
      set({ liveUrl: url });
    },

    setLiveStatus: (status, error = null) => {
      set({
        liveStatus: status,
        liveLastError: error,
      });
    },

    setLiveAutoFollow: (enabled) => {
      set((current) => {
        if (!enabled) {
          return { liveAutoFollow: false };
        }

        const maxTick = current.replay && current.replay.maxTick >= 0 ? current.replay.maxTick : 0;
        return {
          liveAutoFollow: true,
          selectedTick: maxTick,
        };
      });
    },

    setLiveReconnectEnabled: (enabled) => {
      set({ liveReconnectEnabled: enabled });
    },

    addLiveHistory: (entry) => {
      set((current) => ({
        liveHistory: [
          ...current.liveHistory,
          {
            atUnixMs: entry.atUnixMs ?? Date.now(),
            level: entry.level,
            message: entry.message,
          },
        ].slice(-200),
      }));
    },

    clearLiveHistory: () => {
      set({ liveHistory: [] });
    },

    addParseError: (error) => {
      set((current) => ({
        parseErrors: [...current.parseErrors, error].slice(-100),
      }));
    },
  };
});
