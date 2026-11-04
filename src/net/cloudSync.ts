import { useProfile } from '../store/profileStore';
import { getCloud, useCloud, type Cloud } from './cloud';
import { TRACK_LIST } from '../data/tracks';

/**
 * Keeps the local save (zustand/localStorage) and the cloud save in step.
 * Newest wins, decided by a per-device "last changed" stamp. Local changes are
 * uploaded a few seconds after they stop; changes made on another device
 * arrive live. The public leaderboard entry is derived from the save.
 */
const META_KEY = 'truck-sync-meta-v1';
interface Meta { updatedAt: number; uid: string | null }
const readMeta = (): Meta => {
  try { return { updatedAt: 0, uid: null, ...JSON.parse(localStorage.getItem(META_KEY) || '{}') }; } catch { return { updatedAt: 0, uid: null }; }
};
const writeMeta = (m: Meta) => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* ignore */ } };

const MAX_DOC = 240_000;

function serializeProfile(): Record<string, unknown> {
  const state = JSON.parse(JSON.stringify(useProfile.getState())) as Record<string, unknown>;
  let json = JSON.stringify(state);
  // keep inside the 256 KiB document limit: drop uploaded logos of non-active designs first, then all
  if (json.length > MAX_DOC && Array.isArray(state.designs)) {
    const active = state.activeDesignId;
    state.designs = (state.designs as Record<string, unknown>[]).map((d) => (d.id === active ? d : { ...d, logoDataUrl: null }));
    json = JSON.stringify(state);
    if (json.length > MAX_DOC) state.designs = (state.designs as Record<string, unknown>[]).map((d) => ({ ...d, logoDataUrl: null }));
  }
  return state;
}

function looksLikeProfile(p: unknown): p is Record<string, unknown> {
  const o = p as Record<string, unknown>;
  return !!o && typeof o.coins === 'number' && Array.isArray(o.designs) && o.designs.length > 0 && typeof o.settings === 'object';
}

function scoreEntry() {
  const s = useProfile.getState();
  const best: Record<string, number | null> = {};
  TRACK_LIST.forEach((t) => (best[t.id] = s.records[t.id]?.bestLap ?? null));
  const design = s.activeDesign();
  return {
    name: (s.playerName || 'נהג').slice(0, 24),
    xp: s.xp ?? 0,
    races: s.stats.races,
    wins: s.stats.wins,
    podiums: s.stats.podiums,
    champs: s.stats.championships,
    truck: s.selectedTruck,
    color: design.cabColor,
    best,
  };
}

let started = false;

export async function startCloudSync() {
  if (started) return;
  started = true;
  const cloud = await getCloud();
  if (!cloud) return;
  run(cloud);
}

function run(cloud: Cloud) {
  const profileRef = cloud.db.doc(`data/users/${cloud.uid}/profile`);
  const scoreRef = cloud.db.doc(`scores/${cloud.uid}`);
  let meta = readMeta();
  let applying = false;
  let gotFirst = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();
  let lastScoreJson = '';

  const upload = () => {
    writing = writing.then(async () => {
      try {
        await profileRef.set({ v: 1, updatedAt: meta.updatedAt, profile: serializeProfile() });
        const entry = scoreEntry();
        const j = JSON.stringify(entry);
        if (j !== lastScoreJson && useCloud.getState().canWriteScores) {
          try {
            await scoreRef.set({ ...entry, updatedAt: Date.now() });
            lastScoreJson = j;
          } catch {
            useCloud.setState({ canWriteScores: false });
          }
        }
        useCloud.setState({ lastSync: Date.now(), syncError: null });
      } catch (e) {
        useCloud.setState({ syncError: (e as { code?: string }).code ?? 'error' });
      }
    });
  };
  const schedule = (delay = 3000) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(upload, delay);
  };

  // local change → stamp + upload later
  useProfile.subscribe(() => {
    if (applying) return;
    meta = { updatedAt: Date.now(), uid: cloud.uid };
    writeMeta(meta);
    if (gotFirst) schedule();
  });

  // cloud save (initial + changes made on other devices)
  profileRef.onSnapshot(
    (snap) => {
      const d = snap.data();
      const cloudAt = typeof d?.updatedAt === 'number' ? d.updatedAt : 0;
      const sameAccount = meta.uid === null || meta.uid === cloud.uid;
      if (d && looksLikeProfile(d.profile) && (cloudAt > meta.updatedAt || !sameAccount)) {
        applying = true;
        useProfile.setState(d.profile as never);
        applying = false;
        meta = { updatedAt: cloudAt, uid: cloud.uid };
        writeMeta(meta);
        useCloud.setState({ lastSync: Date.now() });
      } else if (!snap.metadata.hasPendingWrites && (!d || cloudAt < meta.updatedAt)) {
        if (meta.uid !== cloud.uid) { meta = { ...meta, uid: cloud.uid }; writeMeta(meta); }
        schedule(gotFirst ? 3000 : 300);
      }
      if (!gotFirst) {
        gotFirst = true;
        // make sure our leaderboard entry exists even if nothing else changes
        schedule(1500);
      }
    },
    (e) => useCloud.setState({ syncError: e.code }),
  );

  window.addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); upload(); } });
}
