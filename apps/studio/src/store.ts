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

export interface LiveHistoryEntry {
  atUnixMs: number;
  level: LiveHistoryLevel;
  message: string;
}

const LARGE_LOG_FALLBACK_THRESHOLD_BYTES = 2 * 1024 * 1024;
const LARGE_LOG_LAZY_THRESHOLD_BYTES = LARGE_LOG_FALLBACK_THRESHOLD_BYTES;

type LazySidecarSource =
  | {
      kind: 'text';
      eventsText: string;
    }
  | {
      kind: 'file';
      file: File;
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
}

function largeLogFallbackWarning(sourceBytes: number, indexUsed: boolean): string | null {
  if (indexUsed || sourceBytes < LARGE_LOG_FALLBACK_THRESHOLD_BYTES) {
    return null;
  }

  return 'large log loaded without sidecar index; full-scan fallback is active and may be slow.';
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
  const ticks: number[] = [];
  for (const entry of index.tick_entries) {
    if (entry.tick > targetTick) {
      break;
    }

    if (!loadedTicks.has(entry.tick) && !pendingTicks.has(entry.tick)) {
      ticks.push(entry.tick);
    }
  }

  return ticks;
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
  };
}

async function readFileSliceText(file: File, byteStart: number, byteEnd: number): Promise<string> {
  return file.slice(byteStart, byteEnd).text();
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
  loadJsonl: (text: string, sidecarText?: string | null, sourceBytes?: number) => void;
  loadJsonlFromFiles: (jsonlFile: File, sidecarFile?: File | null) => Promise<void>;
  loadJsonlFromUrl: (jsonlUrl: string, sidecarUrl?: string | null) => Promise<void>;
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
  const ensureLazyFileTicksLoadedUpTo = async (targetTick: number): Promise<void> => {
    const start = get().lazySidecar;
    if (!start || start.source.kind !== 'file') {
      return;
    }

    const ticks = lazyTicksToHydrate(start.index, start.loadedTicks, start.pendingTicks, targetTick);
    for (const tick of ticks) {
      const beforeLoad = get().lazySidecar;
      if (!beforeLoad || beforeLoad.source.kind !== 'file') {
        return;
      }

      const entry = beforeLoad.index.tick_entries.find((candidate) => candidate.tick === tick);
      if (!entry) {
        continue;
      }

      const pendingTicks = new Set(beforeLoad.pendingTicks);
      pendingTicks.add(tick);
      set({
        lazySidecar: {
          ...beforeLoad,
          pendingTicks,
        },
      });

      try {
        const text = await readFileSliceText(beforeLoad.source.file, entry.byte_start, entry.byte_end);
        const parsed = parseJsonlEvents(text);
        const tickEvents = parsed.events.filter((event) => event.tick === tick);
        const shiftedErrors = shiftJsonlParseErrors(parsed.errors, entry.line_start - 1);

        set((state) => {
          const currentLazy = state.lazySidecar;
          if (!currentLazy || currentLazy.source.kind !== 'file') {
            return state;
          }

          const nextPending = new Set(currentLazy.pendingTicks);
          nextPending.delete(tick);

          if (currentLazy.loadedTicks.has(tick)) {
            return {
              lazySidecar: {
                ...currentLazy,
                pendingTicks: nextPending,
              },
              parseErrors: mergeParseErrors(state.parseErrors, shiftedErrors),
            };
          }

          const nextLoaded = new Set(currentLazy.loadedTicks);
          nextLoaded.add(tick);

          const replay = state.replay ?? new ReplayStore();
          if (tickEvents.length > 0) {
            replay.appendMany(tickEvents);
          }

          return {
            replay,
            eventCount: replay.getAllEvents().length,
            selectedNodeId: state.selectedNodeId ?? replay.getFirstTreeNodeId(),
            parseErrors: mergeParseErrors(state.parseErrors, shiftedErrors),
            lazySidecar: {
              ...currentLazy,
              loadedTicks: nextLoaded,
              pendingTicks: nextPending,
            },
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set((state) => {
          const currentLazy = state.lazySidecar;
          if (!currentLazy || currentLazy.source.kind !== 'file') {
            return state;
          }

          const nextPending = new Set(currentLazy.pendingTicks);
          nextPending.delete(tick);
          return {
            lazySidecar: {
              ...currentLazy,
              pendingTicks: nextPending,
            },
            parseErrors: mergeParseErrors(state.parseErrors, [
              {
                line: entry.line_start,
                message: `lazy tick load failed: ${message}`,
                raw: `tick ${tick}`,
              },
            ]),
          };
        });
      }
    }
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

    loadJsonl: (text, sidecarText = null, sourceBytes = 0) => {
      const hasSidecarText = Boolean(sidecarText && sidecarText.trim().length > 0);
      const prefersLazySidecar = sourceBytes >= LARGE_LOG_LAZY_THRESHOLD_BYTES && hasSidecarText;
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
              replayLoadWarning: 'large log lazy loading is active; sidecar ranges are parsed on tick demand.',
              replaySourceBytes: sourceBytes,
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

      const warnings = [result.sidecar.warning, largeLogFallbackWarning(sourceBytes, result.sidecar.index_used)].filter(
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
        replaySourceBytes: sourceBytes,
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
              replayLoadWarning: 'large log lazy loading is active; sidecar ranges are parsed on tick demand.',
              replaySourceBytes: jsonlFile.size,
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

      get().loadJsonl(text, sidecarText, jsonlFile.size);
    },

    loadJsonlFromUrl: async (jsonlUrl, sidecarUrl = null) => {
      set({
        replayLoadProgress: 0,
        parseErrors: [],
        replayLoadWarning: null,
      });

      try {
        const jsonlResponse = await fetch(jsonlUrl);
        if (!jsonlResponse.ok) {
          throw new Error(`failed to fetch replay log: ${jsonlResponse.status} ${jsonlResponse.statusText}`);
        }

        const text = await jsonlResponse.text();
        const headerBytes = Number.parseInt(jsonlResponse.headers.get('content-length') ?? '', 10);
        const sourceBytes =
          Number.isFinite(headerBytes) && headerBytes > 0 ? headerBytes : new TextEncoder().encode(text).byteLength;

        let sidecarText: string | null = null;
        if (sidecarUrl) {
          const sidecarResponse = await fetch(sidecarUrl);
          if (!sidecarResponse.ok) {
            throw new Error(`failed to fetch sidecar: ${sidecarResponse.status} ${sidecarResponse.statusText}`);
          }
          sidecarText = await sidecarResponse.text();
        }

        get().loadJsonl(text, sidecarText, sourceBytes);
      } catch (error) {
        set({ replayLoadProgress: null });
        throw error;
      }
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

      const maxTick = Math.max(state.replayMaxTick, replay.maxTick, 0);
      const bounded = Math.max(0, Math.min(tick, maxTick));
      const lazy = state.lazySidecar;
      if (!lazy || lazy.loadedTicks.has(bounded)) {
        set({ selectedTick: bounded });
        return;
      }

      const ticksToHydrate = lazyTicksToHydrate(lazy.index, lazy.loadedTicks, lazy.pendingTicks, bounded);
      if (lazy.source.kind === 'text') {
        const loadedTicks = new Set(lazy.loadedTicks);
        for (const tickValue of ticksToHydrate) {
          const events = extractTickEventsBySidecar(lazy.source.eventsText, lazy.index, tickValue);
          if (events.length > 0) {
            replay.appendMany(events);
          }
          loadedTicks.add(tickValue);
        }

        set({
          replay,
          eventCount: replay.getAllEvents().length,
          selectedTick: bounded,
          selectedNodeId: state.selectedNodeId ?? replay.getFirstTreeNodeId(),
          lazySidecar: {
            ...lazy,
            loadedTicks,
          },
        });
        return;
      }

      set({ selectedTick: bounded });
      void ensureLazyFileTicksLoadedUpTo(bounded);
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
