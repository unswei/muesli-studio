import type { ValidatedMbtEvent } from '@muesli/protocol';
import { parseJsonlEvents, ReplayStore, type JsonlParseError } from '@muesli/replay';
import { create } from 'zustand';

export type LiveStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface StudioState {
  replay: ReplayStore | null;
  eventCount: number;
  selectedTick: number;
  selectedNodeId: string | null;
  parseErrors: JsonlParseError[];
  mode: 'replay' | 'live';
  liveUrl: string;
  liveStatus: LiveStatus;
  liveAutoFollow: boolean;
  liveLastError: string | null;
  loadJsonl: (text: string) => void;
  appendLiveEvents: (events: ValidatedMbtEvent[]) => void;
  setSelectedTick: (tick: number) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setLiveUrl: (url: string) => void;
  setLiveStatus: (status: LiveStatus, error?: string | null) => void;
  setLiveAutoFollow: (enabled: boolean) => void;
  addParseError: (error: JsonlParseError) => void;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  replay: null,
  eventCount: 0,
  selectedTick: 0,
  selectedNodeId: null,
  parseErrors: [],
  mode: 'replay',
  liveUrl: 'ws://localhost:8765/events',
  liveStatus: 'disconnected',
  liveAutoFollow: true,
  liveLastError: null,

  loadJsonl: (text) => {
    const result = parseJsonlEvents(text);
    const replay = new ReplayStore();
    replay.appendMany(result.events);

    set({
      replay,
      eventCount: replay.getAllEvents().length,
      parseErrors: result.errors,
      selectedTick: replay.maxTick >= 0 ? replay.maxTick : 0,
      selectedNodeId: replay.btDef?.data.nodes[0]?.id ?? null,
      mode: 'replay',
    });
  },

  appendLiveEvents: (events) => {
    if (events.length === 0) {
      return;
    }

    set((state) => {
      const replay = state.replay ?? new ReplayStore();
      replay.appendMany(events);

      const selectedNodeId = state.selectedNodeId ?? replay.btDef?.data.nodes[0]?.id ?? null;
      const maxTick = replay.maxTick >= 0 ? replay.maxTick : 0;

      return {
        replay,
        eventCount: replay.getAllEvents().length,
        selectedNodeId,
        selectedTick: state.liveAutoFollow ? maxTick : Math.max(0, Math.min(state.selectedTick, maxTick)),
        mode: 'live',
      };
    });
  },

  setSelectedTick: (tick) => {
    const replay = get().replay;
    if (!replay || replay.maxTick < 0) {
      set({ selectedTick: 0 });
      return;
    }

    const bounded = Math.max(0, Math.min(tick, replay.maxTick));
    set({ selectedTick: bounded });
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
    set((state) => {
      if (!enabled) {
        return { liveAutoFollow: false };
      }

      const maxTick = state.replay && state.replay.maxTick >= 0 ? state.replay.maxTick : 0;
      return {
        liveAutoFollow: true,
        selectedTick: maxTick,
      };
    });
  },

  addParseError: (error) => {
    set((state) => ({
      parseErrors: [...state.parseErrors, error].slice(-100),
    }));
  },
}));
