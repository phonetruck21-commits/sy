/**
 * Cloud layer on top of the claude.ai artifact `db` + `user` capabilities:
 *  - account = the viewer's claude.ai login (`user.id()`)
 *  - private per-player save:   data/users/<uid>/profile
 *  - global leaderboard entry:  scores/<uid>  (everyone reads, each writes own)
 * Outside claude.ai in dev mode, a localStorage-backed mock stands in so the
 * features can be developed and tested locally (several tabs = one "server").
 */
import { create } from 'zustand';

export type Unsub = () => void;
export interface DocSnap { id: string; exists: boolean; data(): Record<string, unknown> | undefined; metadata: { fromCache: boolean; hasPendingWrites: boolean } }
export interface QuerySnap { docs: DocSnap[] }

export interface DocRef {
  id: string;
  get(): Promise<DocSnap>;
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (s: DocSnap) => void, err?: (e: { code: string }) => void): Unsub;
}
export interface Query {
  limit(n: number): Query;
  onSnapshot(next: (s: QuerySnap) => void, err?: (e: { code: string }) => void): Unsub;
}
export interface CollRef extends Query { doc(id: string): DocRef }
export interface DB { doc(path: string): DocRef; collection(path: string): CollRef }
interface UserNs {
  id(): Promise<string | null>;
  isOwner(): Promise<boolean>;
  name?(): Promise<string>;
  can?(c: string): Promise<boolean | null>;
}

export interface Cloud { db: DB; uid: string; isOwner: boolean; accountName: string; mock: boolean }

type CloudStatus = 'loading' | 'on' | 'off';
interface CloudState {
  status: CloudStatus;
  cloud: Cloud | null;
  lastSync: number | null;
  syncError: string | null;
  canWriteScores: boolean;
}
export const useCloud = create<CloudState>()(() => ({ status: 'loading', cloud: null, lastSync: null, syncError: null, canWriteScores: true }));

let cloudPromise: Promise<Cloud | null> | null = null;

export function getCloud(): Promise<Cloud | null> {
  if (cloudPromise) return cloudPromise;
  cloudPromise = (async () => {
    const claude = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    let cloud: Cloud | null = null;
    if (claude?.use) {
      try {
        // Ask who is viewing first. A signed-out viewer has no account and no
        // cloud data, so the database is never touched for them (no sign-in prompt mid-game).
        const user = (await claude.use('user')) as UserNs | null;
        const uid = user ? await user.id().catch(() => null) : null;
        const db = uid ? ((await claude.use('db')) as DB | null) : null;
        if (db && user && uid) {
          const [isOwner, accountName] = await Promise.all([user.isOwner().catch(() => false), user.name ? user.name().catch(() => '') : Promise.resolve('')]);
          cloud = { db, uid, isOwner, accountName, mock: false };
        }
      } catch {
        cloud = null;
      }
    } else if (import.meta.env.DEV) {
      cloud = createMockCloud();
    }
    useCloud.setState({ status: cloud ? 'on' : 'off', cloud });
    return cloud;
  })();
  return cloudPromise;
}

// ---------------------------------------------------------------------------
// Dev-only mock: localStorage as the "server", storage events as realtime.
function createMockCloud(): Cloud {
  const KEY = 'mock-cloud-db';
  const params = new URLSearchParams(location.search);
  let uid = params.get('uid') ?? sessionStorage.getItem('mock-uid');
  if (!uid) {
    uid = 'u' + Math.random().toString(36).slice(2, 9);
    sessionStorage.setItem('mock-uid', uid);
  }
  const read = (): Record<string, Record<string, unknown>> => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });
  const snap = (path: string, all = read()): DocSnap => {
    const d = all[path];
    return { id: path.split('/').pop()!, exists: !!d, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const doc = (path: string): DocRef => ({
    id: path.split('/').pop()!,
    get: async () => snap(path),
    set: async (d) => { const all = read(); all[path] = JSON.parse(JSON.stringify(d)); localStorage.setItem(KEY, JSON.stringify(all)); notify(); },
    delete: async () => { const all = read(); delete all[path]; localStorage.setItem(KEY, JSON.stringify(all)); notify(); },
    onSnapshot(next) {
      let last = '';
      const fire = () => { const s = snap(path); const j = JSON.stringify(s.data() ?? null); if (j !== last) { last = j; next(s); } };
      listeners.add(fire);
      setTimeout(fire, 0);
      return () => listeners.delete(fire);
    },
  });
  const coll = (path: string, n = 1000): CollRef => ({
    doc: (id: string) => doc(`${path}/${id}`),
    limit: (k: number) => coll(path, k),
    onSnapshot(next) {
      const fire = () => {
        const all = read();
        const docs = Object.keys(all).filter((k) => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1).slice(0, n).map((k) => snap(k, all));
        next({ docs });
      };
      listeners.add(fire);
      setTimeout(fire, 0);
      return () => listeners.delete(fire);
    },
  });
  return { db: { doc, collection: (p) => coll(p) }, uid, isOwner: params.get('owner') === '1', accountName: 'מצב בדיקה', mock: true };
}
