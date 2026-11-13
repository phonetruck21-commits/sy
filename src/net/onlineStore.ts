import { create } from 'zustand';
import { getRoomApi, lobbyAsRoom, roomIsMock, type NamedRoom, type Peer } from './roomApi';
import type { ThemeId, TrackId, TruckId } from '../types';
import { BRAND_THEMES } from '../data/themes';
import { TRACKS } from '../data/tracks';
import { TRUCKS } from '../data/trucks';
import { AVATARS as AVATAR_SET } from './players';
import { ingestPeers, resetChat } from './chat';

/**
 * Online protocol — everything travels in each player's room *presence*
 * (latest-wins state the platform shares with everyone in the named room):
 *
 *   name, look, truck            who you are and how your truck looks
 *   cfg {track, laps}            host's lobby choice
 *   race {id, track, laps, order} host starts a race (order = peer labels → grid slots)
 *   loaded = raceId              this player finished loading that race
 *   go = raceId                  host: everyone loaded, start the countdown
 *   car {...}                    live truck state during the race (~20 Hz)
 *
 * The host is simply the player with the lowest peer label, so if the host
 * leaves, the next player takes over automatically.
 */
export const PROTOCOL = 1;
export const MAX_ONLINE_PLAYERS = 6;

export interface Look {
  c: string; // cab colour
  b: string; // box colour
  a: string; // accent
  t: ThemeId;
  n: string; // brand title
  av?: string; // account avatar
  pc?: string; // account colour
}

export interface CarState {
  id: string; // race id
  x: number;
  y: number;
  z: number;
  yaw: number;
  sp: number;
  tot: number;
  lap: number;
  fin: boolean;
  ft: number;
  ni: boolean;
}

export interface RaceAnnounce {
  id: string;
  track: TrackId;
  laps: number;
  order: string[];
}

export interface PlayerView {
  peer: string;
  isMe: boolean;
  name: string;
  look: Look;
  truck: TruckId;
  loaded: string | null;
  go: string | null;
  race: RaceAnnounce | null;
  cfg: { track: TrackId; laps: number } | null;
  car: CarState | null;
  guest: boolean;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const str = (v: unknown, max = 24) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Parse another player's presence defensively — it is untrusted input. */
export function readPlayer(p: Peer): PlayerView | null {
  const pr = p.presence as Record<string, unknown>;
  if (pr.v !== PROTOCOL || p.kind !== 'viewer') return null;
  const lk = (pr.look ?? {}) as Record<string, unknown>;
  const look: Look = {
    c: HEX.test(String(lk.c)) ? String(lk.c) : '#f4f6f8',
    b: HEX.test(String(lk.b)) ? String(lk.b) : '#f4f6f8',
    a: HEX.test(String(lk.a)) ? String(lk.a) : '#1e7bff',
    t: (String(lk.t) in BRAND_THEMES ? lk.t : 'tech-blue') as ThemeId,
    n: str(lk.n, 20) || 'TRUCK',
    av: typeof lk.av === 'string' && AVATAR_SET.includes(lk.av) ? lk.av : undefined,
    pc: HEX.test(String(lk.pc)) ? String(lk.pc) : undefined,
  };
  const truck = (String(pr.truck) in TRUCKS ? pr.truck : 'atleon') as TruckId;
  let race: RaceAnnounce | null = null;
  const r = pr.race as Record<string, unknown> | null | undefined;
  if (r && typeof r.id === 'string' && String(r.track) in TRACKS && Array.isArray(r.order)) {
    race = { id: r.id.slice(0, 24), track: r.track as TrackId, laps: Math.max(1, Math.min(5, Math.round(num(r.laps, 3)))), order: r.order.filter((x): x is string => typeof x === 'string').slice(0, MAX_ONLINE_PLAYERS) };
  }
  const c = pr.cfg as Record<string, unknown> | null | undefined;
  const cfg = c && String(c.track) in TRACKS ? { track: c.track as TrackId, laps: Math.max(1, Math.min(5, Math.round(num(c.laps, 3)))) } : null;
  const k = pr.car as Record<string, unknown> | null | undefined;
  const car: CarState | null = k && typeof k.id === 'string'
    ? { id: k.id, x: num(k.x), y: num(k.y), z: num(k.z), yaw: num(k.yaw), sp: num(k.sp), tot: num(k.tot), lap: num(k.lap), fin: k.fin === true, ft: num(k.ft), ni: k.ni === true }
    : null;
  return {
    peer: p.peer,
    isMe: p.isMe && p.sameTab,
    name: str(pr.name) || 'נהג',
    look,
    truck,
    loaded: typeof pr.loaded === 'string' ? pr.loaded : null,
    go: typeof pr.go === 'string' ? pr.go : null,
    race,
    cfg,
    car,
    guest: p.guest,
  };
}

export function readPlayers(peers: readonly Peer[]): PlayerView[] {
  return peers.map(readPlayer).filter((x): x is PlayerView => !!x).sort((a, b) => (a.peer < b.peer ? -1 : 1));
}

export const hostOf = (players: PlayerView[]) => players[0] ?? null;

type Status = 'idle' | 'connecting' | 'connected' | 'unavailable' | 'error';

interface OnlineState {
  status: Status;
  error: string | null;
  code: string | null;
  room: NamedRoom | null;
  peers: readonly Peer[];
  lastRaceId: string | null;
  mock: boolean;
  connect: (code: string, me: { name: string; look: Look; truck: TruckId }) => Promise<void>;
  leave: () => Promise<void>;
  setPresence: (patch: Record<string, unknown>) => void;
  markRaceJoined: (id: string) => void;
}

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const randomCode = () => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
export const normalizeCode = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
export const PUBLIC_ROOM = 'public';

let unsub: (() => void) | null = null;

export const useOnline = create<OnlineState>()((set, get) => ({
  status: 'idle',
  error: null,
  code: null,
  room: null,
  peers: [],
  lastRaceId: null,
  mock: false,
  connect: async (code, me) => {
    if (get().room) await get().leave();
    set({ status: 'connecting', error: null, code });
    const api = await getRoomApi();
    if (!api) {
      set({ status: 'unavailable', mock: false });
      return;
    }
    try {
      // the public room is the page's base room: everyone who can open the game is in it,
      // no named-room permission needed. Private codes get their own named room.
      const withTimeout = <T,>(p: Promise<T>) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej({ code: 'timeout' }), 12000))]);
      const room = code === PUBLIC_ROOM ? lobbyAsRoom(api) : await withTimeout(api.join(`truckrace-${code}`));
      resetChat();
      unsub = room.onPeers(
        (c) => {
          set({ peers: c.peers });
          ingestPeers(c.peers);
        },
        (e) => set({ status: 'error', error: e.code }),
      );
      await withTimeout(room.presence({ v: PROTOCOL, name: me.name.slice(0, 24), look: me.look, truck: me.truck, race: null, go: null, loaded: null, car: null, cfg: null }));
      set({ room, status: 'connected', mock: roomIsMock, peers: room.peers() });
    } catch (e) {
      const errCode = (e as { code?: string })?.code ?? 'error';
      unsub?.();
      unsub = null;
      set({ status: ['not_permitted', 'not_granted', 'revoked'].includes(errCode) ? 'unavailable' : 'error', error: errCode });
    }
  },
  leave: async () => {
    unsub?.();
    unsub = null;
    const r = get().room;
    resetChat();
    set({ room: null, peers: [], status: 'idle', code: null });
    if (r) await r.leave().catch(() => undefined);
  },
  setPresence: (patch) => {
    void get().room?.presence(patch as Record<string, null>).catch(() => undefined);
  },
  markRaceJoined: (id) => set({ lastRaceId: id }),
}));
