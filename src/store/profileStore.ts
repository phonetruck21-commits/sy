import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CameraMode, Difficulty, RaceResult, TrackId, TruckDesign, TruckId, UpgradeKey } from '../types';
import { createDefaultDesign } from '../data/defaultDesign';
import { ACHIEVEMENT_MAP } from '../data/achievements';
import { CHAMPIONSHIP_POINTS, CHAMPIONSHIP_TRACKS } from '../data/tracks';
import { MAX_UPGRADE, TRUCKS, upgradeCost } from '../data/trucks';

export interface Settings {
  volume: number; // 0..1
  quality: 'low' | 'high';
  touchControls: 'auto' | 'on' | 'off';
  camera: CameraMode;
  difficulty: Difficulty;
}

export interface TrackRecord {
  bestLap: number | null;
  bestRace: number | null;
  bestPosition: number | null;
}

export interface ChampionshipState {
  round: number; // index into CHAMPIONSHIP_TRACKS
  points: Record<string, number>; // racer id -> points
  names: Record<string, string>;
  results: { trackId: TrackId; playerPosition: number }[];
  finished: boolean;
}

export interface HistoryEntry {
  date: number;
  trackId: TrackId;
  position: number;
  time: number;
  truckId: TruckId;
  mode: 'quick' | 'championship' | 'online';
}

type Upgrades = Record<UpgradeKey, number>;
const emptyUpgrades = (): Upgrades => ({ engine: 0, acceleration: 0, handling: 0, nitro: 0 });

interface ProfileState {
  playerName: string;
  coins: number;
  achievements: string[];
  selectedTruck: TruckId;
  upgrades: Record<TruckId, Upgrades>;
  designs: TruckDesign[];
  activeDesignId: string;
  settings: Settings;
  records: Partial<Record<TrackId, TrackRecord>>;
  stats: { races: number; wins: number; podiums: number; championships: number };
  championship: ChampionshipState | null;
  history: HistoryEntry[];

  // actions
  setPlayerName: (n: string) => void;
  updateSettings: (s: Partial<Settings>) => void;
  selectTruck: (id: TruckId) => void;
  isTruckUnlocked: (id: TruckId) => boolean;
  buyUpgrade: (truck: TruckId, key: UpgradeKey) => boolean;
  saveDesign: (d: TruckDesign) => void;
  deleteDesign: (id: string) => void;
  setActiveDesign: (id: string) => void;
  activeDesign: () => TruckDesign;
  unlockAchievement: (id: string) => boolean;
  recordRace: (r: RaceResult, extra: { nitroUsed: number; mode: 'quick' | 'championship' | 'online'; playerTime: number; bestLap: number | null }) => string[];
  startChampionship: (names: Record<string, string>) => void;
  applyChampionshipRound: (r: RaceResult) => void;
  abandonChampionship: () => void;
  resetProgress: () => void;
}

const initialDesign = createDefaultDesign();

const initial = () => ({
  playerName: 'PHONE TRUCK',
  coins: 500,
  achievements: [] as string[],
  selectedTruck: 'atleon' as TruckId,
  upgrades: { atleon: emptyUpgrades(), hauler: emptyUpgrades(), phantom: emptyUpgrades() },
  designs: [initialDesign],
  activeDesignId: initialDesign.id,
  settings: {
    volume: 0.7,
    quality: (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 'low' : 'high') as Settings['quality'],
    touchControls: 'auto' as const,
    camera: 'chase' as CameraMode,
    difficulty: 'normal' as Difficulty,
  },
  records: {},
  stats: { races: 0, wins: 0, podiums: 0, championships: 0 },
  championship: null as ChampionshipState | null,
  history: [] as HistoryEntry[],
});

export const useProfile = create<ProfileState>()(
  persist(
    (set, get) => ({
      ...initial(),

      setPlayerName: (n) => set({ playerName: n.slice(0, 24) }),
      updateSettings: (s) => set({ settings: { ...get().settings, ...s } }),
      selectTruck: (id) => {
        if (get().isTruckUnlocked(id)) set({ selectedTruck: id });
      },
      isTruckUnlocked: (id) => {
        const a = TRUCKS[id].unlock.achievement;
        return !a || get().achievements.includes(a);
      },
      buyUpgrade: (truck, key) => {
        const s = get();
        const lvl = s.upgrades[truck][key];
        const cost = upgradeCost(lvl);
        if (lvl >= MAX_UPGRADE || s.coins < cost) return false;
        set({
          coins: s.coins - cost,
          upgrades: { ...s.upgrades, [truck]: { ...s.upgrades[truck], [key]: lvl + 1 } },
        });
        get().unlockAchievement('tuned');
        return true;
      },
      saveDesign: (d) => {
        const designs = get().designs;
        const idx = designs.findIndex((x) => x.id === d.id);
        const next = idx >= 0 ? designs.map((x) => (x.id === d.id ? d : x)) : [...designs, d];
        set({ designs: next.slice(-8), activeDesignId: d.id });
        get().unlockAchievement('designer');
      },
      deleteDesign: (id) => {
        const designs = get().designs.filter((d) => d.id !== id);
        if (designs.length === 0) designs.push(createDefaultDesign());
        set({ designs, activeDesignId: designs.some((d) => d.id === get().activeDesignId) ? get().activeDesignId : designs[0].id });
      },
      setActiveDesign: (id) => set({ activeDesignId: id }),
      activeDesign: () => {
        const s = get();
        return s.designs.find((d) => d.id === s.activeDesignId) ?? s.designs[0] ?? createDefaultDesign();
      },
      unlockAchievement: (id) => {
        const s = get();
        if (s.achievements.includes(id) || !ACHIEVEMENT_MAP[id]) return false;
        set({ achievements: [...s.achievements, id], coins: s.coins + ACHIEVEMENT_MAP[id].reward });
        return true;
      },
      recordRace: (r, extra) => {
        const s = get();
        const pos = r.playerPosition;
        const rec: TrackRecord = s.records[r.trackId] ?? { bestLap: null, bestRace: null, bestPosition: null };
        const newRec: TrackRecord = {
          bestLap: extra.bestLap != null && (rec.bestLap == null || extra.bestLap < rec.bestLap) ? extra.bestLap : rec.bestLap,
          bestRace: rec.bestRace == null || extra.playerTime < rec.bestRace ? extra.playerTime : rec.bestRace,
          bestPosition: rec.bestPosition == null || pos < rec.bestPosition ? pos : rec.bestPosition,
        };
        set({
          coins: s.coins + r.coinsEarned,
          records: { ...s.records, [r.trackId]: newRec },
          stats: {
            ...s.stats,
            races: s.stats.races + 1,
            wins: s.stats.wins + (pos === 1 ? 1 : 0),
            podiums: s.stats.podiums + (pos <= 3 ? 1 : 0),
          },
          history: [
            { date: Date.now(), trackId: r.trackId, position: pos, time: extra.playerTime, truckId: s.selectedTruck, mode: extra.mode },
            ...s.history,
          ].slice(0, 30),
        });
        const unlocked: string[] = [];
        const tryU = (id: string) => get().unlockAchievement(id) && unlocked.push(id);
        tryU('first_race');
        if (pos <= 3) tryU('podium');
        if (pos === 1) {
          tryU('first_win');
          tryU(`win_${r.trackId}`);
        }
        if (extra.nitroUsed >= 10) tryU('nitro_fan');
        return unlocked;
      },
      startChampionship: (names) => {
        const points: Record<string, number> = {};
        Object.keys(names).forEach((k) => (points[k] = 0));
        set({ championship: { round: 0, points, names, results: [], finished: false } });
      },
      applyChampionshipRound: (r) => {
        const c = get().championship;
        if (!c || c.finished) return;
        const points = { ...c.points };
        r.entries.forEach((e) => {
          points[e.id] = (points[e.id] ?? 0) + (CHAMPIONSHIP_POINTS[e.position - 1] ?? 0);
        });
        const round = c.round + 1;
        const finished = round >= CHAMPIONSHIP_TRACKS.length;
        set({ championship: { ...c, points, round, finished, results: [...c.results, { trackId: r.trackId, playerPosition: r.playerPosition }] } });
        if (finished) {
          const standings = Object.entries(points).sort((a, b) => b[1] - a[1]);
          if (standings[0][0] === 'player') {
            get().unlockAchievement('champion');
            set({ stats: { ...get().stats, championships: get().stats.championships + 1 } });
          }
        }
      },
      abandonChampionship: () => set({ championship: null }),
      resetProgress: () => set({ ...initial() }),
    }),
    {
      name: 'truck-racing-profile-v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
