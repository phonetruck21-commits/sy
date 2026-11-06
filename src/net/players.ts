/**
 * Player accounts ("users"). Identity = the viewer's claude.ai login (uid);
 * the public profile lives in players/<uid> (everyone reads, each writes own,
 * the game's owner can moderate). Usernames are unique (case-insensitive).
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { getCloud, useCloud, type Cloud } from './cloud';
import { useProfile } from '../store/profileStore';

export interface Player {
  uid: string;
  username: string;
  avatar: string;
  color: string;
  createdAt: number;
}

export const AVATARS = ['🚚', '🏎️', '🦁', '🐯', '🦅', '🔥', '⚡', '👑', '🐉', '🤖', '🦊', '🐼', '🦈', '🐺', '🚀', '⭐'];
export const COLORS = ['#35e0ff', '#1e9bff', '#ff2bd6', '#b44dff', '#3dff6e', '#ffcc33', '#ff6b1a', '#ff3b3b', '#ffffff'];

/** 3–16 chars: Hebrew/English letters, digits, space, _ - . */
export function validateUsername(name: string): string | null {
  const n = name.trim();
  if (n.length < 3) return 'לפחות 3 תווים';
  if (n.length > 16) return 'עד 16 תווים';
  if (!/^[\p{L}\p{N} _.\-]+$/u.test(n)) return 'רק אותיות, ספרות, רווח, _ - .';
  return null;
}
export const usernameKey = (n: string) => n.trim().toLocaleLowerCase('he').replace(/\s+/g, ' ');

export function parsePlayer(uid: string, d: Record<string, unknown> | undefined): Player | null {
  if (!d || typeof d.username !== 'string' || !d.username.trim()) return null;
  return {
    uid,
    username: d.username.slice(0, 16),
    avatar: typeof d.avatar === 'string' && AVATARS.includes(d.avatar) ? d.avatar : '🚚',
    color: typeof d.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : '#35e0ff',
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
  };
}

/** Level from XP: 1, 2 at 50 XP, 3 at 200, 4 at 450 … */
export const levelOf = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
export const xpForLevel = (lvl: number) => 50 * (lvl - 1) * (lvl - 1);

// --------------------------------------------------------------------------
// Live directory of all players (one subscription for the whole app).
interface PlayersState {
  loaded: boolean;
  byUid: Record<string, Player>;
  me: Player | null;
  dismissedSignup: boolean;
}
export const usePlayers = create<PlayersState>()(() => ({ loaded: false, byUid: {}, me: null, dismissedSignup: false }));

let started = false;
export async function startPlayersDirectory() {
  if (started) return;
  started = true;
  const cloud = await getCloud();
  if (!cloud) return;
  cloud.db.collection('players').limit(1000).onSnapshot(
    (s) => {
      const byUid: Record<string, Player> = {};
      s.docs.forEach((d) => {
        const p = d.exists ? parsePlayer(d.id, d.data()) : null;
        if (p) byUid[p.uid] = p;
      });
      const me = byUid[cloud.uid] ?? null;
      usePlayers.setState({ loaded: true, byUid, me });
      // the account's username is the in-game name everywhere
      if (me && useProfile.getState().playerName !== me.username) useProfile.getState().setPlayerName(me.username);
    },
    () => usePlayers.setState({ loaded: true }),
  );
}

export function usernameTaken(name: string, exceptUid?: string) {
  const key = usernameKey(name);
  return Object.values(usePlayers.getState().byUid).some((p) => p.uid !== exceptUid && usernameKey(p.username) === key);
}

/** Create or update my account. Also joins the friends club. */
export async function saveMyPlayer(cloud: Cloud, data: { username: string; avatar: string; color: string }) {
  const err = validateUsername(data.username);
  if (err) throw new Error(err);
  if (usernameTaken(data.username, cloud.uid)) throw new Error('השם הזה כבר תפוס — נסה שם אחר');
  const existing = usePlayers.getState().me;
  const username = data.username.trim();
  await cloud.db.doc(`players/${cloud.uid}`).set({ username, avatar: data.avatar, color: data.color, createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now() });
  await cloud.db.doc(`members/${cloud.uid}`).set({ name: username, joinedAt: Date.now() }).catch(() => undefined);
  useProfile.getState().setPlayerName(username);
}

/** Owner moderation. */
export async function resetPlayerName(cloud: Cloud, p: Player) {
  await cloud.db.doc(`players/${p.uid}`).set({ username: `נהג-${p.uid.slice(-4)}`, avatar: p.avatar, color: p.color, createdAt: p.createdAt, updatedAt: Date.now() });
}
export async function removePlayer(cloud: Cloud, uid: string) {
  await cloud.db.doc(`players/${uid}`).delete();
  await cloud.db.doc(`members/${uid}`).delete().catch(() => undefined);
  await cloud.db.doc(`scores/${uid}`).delete().catch(() => undefined);
}

// --------------------------------------------------------------------------
/** Public stats for a profile card (from the leaderboard entry). */
export interface PublicStats { xp: number; races: number; wins: number; podiums: number; champs: number; truck: string; best: Record<string, number | null> }

export function usePublicStats(uid: string | null) {
  const cloud = useCloud((s) => s.cloud);
  const [stats, setStats] = useState<PublicStats | null>(null);
  useEffect(() => {
    if (!cloud || !uid) return;
    return cloud.db.doc(`scores/${uid}`).onSnapshot((s) => {
      const d = s.data();
      if (!d) return setStats(null);
      const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);
      const best = (d.best ?? {}) as Record<string, unknown>;
      setStats({
        xp: n(d.xp), races: n(d.races), wins: n(d.wins), podiums: n(d.podiums), champs: n(d.champs), truck: String(d.truck ?? 'atleon'),
        best: Object.fromEntries(Object.entries(best).map(([k, v]) => [k, typeof v === 'number' ? v : null])),
      });
    });
  }, [cloud, uid]);
  return stats;
}

export const PLAYER_DB_RULES = [
  { path: 'players', read: 'view', write: 'owner' },
  { path: 'players/{self}', write: 'interact' },
];
