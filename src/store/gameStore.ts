import { create } from 'zustand';
import type { RaceResult, TrackId } from '../types';

export type Screen = 'home' | 'race-setup' | 'garage' | 'design' | 'championship' | 'settings' | 'race' | 'results';

export interface RaceConfig {
  trackId: TrackId;
  mode: 'quick' | 'championship';
  laps: number;
  autopilot: boolean; // demo / test mode: player truck driven by AI
}

interface GameState {
  screen: Screen;
  raceConfig: RaceConfig;
  raceKey: number;
  lastResult: RaceResult | null;
  go: (s: Screen) => void;
  startRace: (cfg: Partial<RaceConfig> & { trackId: TrackId }) => void;
  restartRace: () => void;
  finishRace: (r: RaceResult) => void;
}

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();

export const useGame = create<GameState>()((set, get) => ({
  screen: 'home',
  raceConfig: {
    trackId: 'ashdod',
    mode: 'quick',
    laps: Number(params.get('laps')) || 3,
    autopilot: params.get('autopilot') === '1',
  },
  raceKey: 0,
  lastResult: null,
  go: (screen) => set({ screen }),
  startRace: (cfg) =>
    set({
      screen: 'race',
      raceConfig: { ...get().raceConfig, mode: 'quick', ...cfg },
      raceKey: get().raceKey + 1,
    }),
  restartRace: () => set({ screen: 'race', raceKey: get().raceKey + 1 }),
  finishRace: (r) => set({ lastResult: r, screen: 'results' }),
}));
