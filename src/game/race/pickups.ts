import { create } from 'zustand';
import { COIN_VALUE, STASH_COINS } from '../../data/tracks';
import type { TrackData } from '../track/trackData';
import { wrapIndex } from '../track/trackData';

export interface Pickup {
  id: number;
  kind: 'coin' | 'stash';
  x: number;
  y: number;
  z: number;
  idx: number;
  value: number;
  takenAt: number | null; // race clock time it was collected
}

/** Coin groups along the racing line + the track's hidden treasure. */
export function buildPickups(track: TrackData, withStash: boolean): Pickup[] {
  const out: Pickup[] = [];
  let id = 0;
  const n = track.count;
  // a group of 5 coins every ~150 m, alternating lanes so you have to pick a line
  const lanes = [-5, 0, 5, -2.5, 2.5];
  let g = 0;
  for (let start = 40; start < n - 20; start += 75, g++) {
    const lane = lanes[g % lanes.length];
    for (let k = 0; k < 5; k++) {
      const i = wrapIndex(start + k * 2, n);
      const p = track.points[i], r = track.rights[i];
      out.push({ id: id++, kind: 'coin', x: p.x + r.x * lane, y: 1.3, z: p.z + r.z * lane, idx: i, value: COIN_VALUE, takenAt: null });
    }
  }
  if (withStash) {
    const s = track.def.stash;
    const i = wrapIndex(Math.floor(s.at * n), n);
    const p = track.points[i], r = track.rights[i], t = track.tangents[i];
    const a = s.ahead ?? 0;
    out.push({ id: id++, kind: 'stash', x: p.x + t.x * a + r.x * s.lateral, y: s.height + 1.2, z: p.z + t.z * a + r.z * s.lateral, idx: wrapIndex(i + Math.round(a / track.spacing), n), value: STASH_COINS, takenAt: null });
  }
  return out;
}

/** HUD feedback for collected money (big rolling counter like a cash pop-up). */
interface PickupFx {
  total: number; // coins collected this session
  last: number; // amount of the latest pickup
  stash: boolean;
  key: number;
  push: (amount: number, stash: boolean) => void;
  reset: () => void;
}
export const usePickupFx = create<PickupFx>()((set, get) => ({
  total: 0,
  last: 0,
  stash: false,
  key: 0,
  push: (amount, stash) => set({ total: get().total + amount, last: amount, stash, key: get().key + 1 }),
  reset: () => set({ total: 0, last: 0, stash: false, key: 0 }),
}));
