import { parseJsonlEvents, ReplayStore, type JsonlParseError } from '@muesli/replay';
import { create } from 'zustand';

interface StudioState {
  replay: ReplayStore | null;
  selectedTick: number;
  selectedNodeId: string | null;
  parseErrors: JsonlParseError[];
  loadJsonl: (text: string) => void;
  setSelectedTick: (tick: number) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  replay: null,
  selectedTick: 0,
  selectedNodeId: null,
  parseErrors: [],

  loadJsonl: (text) => {
    const result = parseJsonlEvents(text);
    const replay = new ReplayStore();
    replay.appendMany(result.events);

    set({
      replay,
      parseErrors: result.errors,
      selectedTick: replay.maxTick > 0 ? replay.maxTick : 0,
      selectedNodeId: replay.btDef?.data.nodes[0]?.id ?? null,
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
}));
