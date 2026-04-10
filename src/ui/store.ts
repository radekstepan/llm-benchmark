import { create } from 'zustand';
import type { ModelInfo } from '../cli/lms.js';
import type { ModelSettings } from '../utils/config.js';

// ---------------------------------------------------------------------------
// Screen enum
// ---------------------------------------------------------------------------

export type Screen =
  | 'init'
  | 'model-select'
  | 'benchmarking'
  | 'summary';

// ---------------------------------------------------------------------------
// Live benchmark state (shown during Screen 3)
// ---------------------------------------------------------------------------

export interface LiveBenchmarkState {
  currentModel: string;
  phase: 'context-search' | 'speed-test' | 'done';
  /** 0-100 */
  progress: number;
  currentContext: number;
  currentTtft: number;
  currentTps: number;
  logs: string[];
}

// ---------------------------------------------------------------------------
// App store
// ---------------------------------------------------------------------------

export interface AppStore {
  screen: Screen;
  models: ModelInfo[];
  selectedModels: Set<string>;
  hardwareFingerprint: string;
  cpuModel: string;
  gpuModel: string;
  gpuVram: number;
  ramGb: number;
  live: LiveBenchmarkState;
  completedModels: ModelSettings[];
  isShuttingDown: boolean;

  // Actions
  setScreen: (screen: Screen) => void;
  setModels: (models: ModelInfo[]) => void;
  toggleModelSelection: (id: string) => void;
  setHardware: (info: {
    fingerprint: string;
    cpuModel: string;
    gpuModel: string;
    gpuVram: number;
    ramGb: number;
  }) => void;
  updateLive: (patch: Partial<LiveBenchmarkState>) => void;
  appendLog: (msg: string) => void;
  addCompletedModel: (settings: ModelSettings) => void;
  setShuttingDown: (v: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  screen: 'init',
  models: [],
  selectedModels: new Set(),
  hardwareFingerprint: '',
  cpuModel: '',
  gpuModel: '',
  gpuVram: 0,
  ramGb: 0,
  live: {
    currentModel: '',
    phase: 'context-search',
    progress: 0,
    currentContext: 0,
    currentTtft: 0,
    currentTps: 0,
    logs: [],
  },
  completedModels: [],
  isShuttingDown: false,

  setScreen: (screen) => set({ screen }),

  setModels: (models) => set({ models }),

  toggleModelSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedModels);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedModels: next };
    }),

  setHardware: (info) =>
    set({
      hardwareFingerprint: info.fingerprint,
      cpuModel: info.cpuModel,
      gpuModel: info.gpuModel,
      gpuVram: info.gpuVram,
      ramGb: info.ramGb,
    }),

  updateLive: (patch) =>
    set((state) => ({
      live: { ...state.live, ...patch },
    })),

  appendLog: (msg) =>
    set((state) => ({
      live: { ...state.live, logs: [...state.live.logs, msg] },
    })),

  addCompletedModel: (settings) =>
    set((state) => ({
      completedModels: [...state.completedModels, settings],
    })),

  setShuttingDown: (v) => set({ isShuttingDown: v }),
}));
