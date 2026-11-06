/**
 * Friends club + tournaments (claude.ai artifact `db`).
 *
 *   members/<uid>        club membership (everyone reads, each writes own)
 *   tournaments/<tid>    tournament definition + announced winners (owner writes)
 *   tentries/<uid>       a player's best times per tournament (everyone reads, each writes own)
 *   prizes/<uid>         voucher codes issued to that player (owner writes; only that player + owner read)
 */
import { useEffect, useState } from 'react';
import { useCloud, type Cloud } from './cloud';
import { TRACKS } from '../data/tracks';
import type { Difficulty, TrackId } from '../types';

export interface Tournament {
  id: string;
  name: string;
  track: TrackId;
  laps: number;
  difficulty: Difficulty;
  equal: boolean; // everyone races the standard truck, no upgrades
  prizes: string[]; // 1st..3rd
  startsAt: number;
  endsAt: number;
  status: 'active' | 'closed';
  winners: { uid: string; name: string; rank: number; time: number; prize: string }[];
}

export interface EntryRow { uid: string; name: string; color: string; best: number; tries: number }
export interface Member { uid: string; name: string; joinedAt: number }
export interface PrizeItem { tid: string; tname: string; rank: number; prize: string; code: string; issuedAt: number; redeemed: boolean }

const num = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const str = (v: unknown, max = 60, d = '') => (typeof v === 'string' ? v.slice(0, max) : d);
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];

export function parseTournament(id: string, d: Record<string, unknown> | undefined): Tournament | null {
  if (!d || !(String(d.track) in TRACKS)) return null;
  const winners = Array.isArray(d.winners)
    ? (d.winners as Record<string, unknown>[]).slice(0, 3).map((w) => ({ uid: str(w.uid, 80), name: str(w.name, 24, 'נהג'), rank: num(w.rank, 1), time: num(w.time), prize: str(w.prize, 80) }))
    : [];
  return {
    id,
    name: str(d.name, 40, 'טורניר'),
    track: d.track as TrackId,
    laps: Math.max(1, Math.min(5, Math.round(num(d.laps, 3)))),
    difficulty: (DIFFS.includes(d.difficulty as Difficulty) ? d.difficulty : 'normal') as Difficulty,
    equal: d.equal !== false,
    prizes: Array.isArray(d.prizes) ? (d.prizes as unknown[]).slice(0, 3).map((p) => str(p, 80)) : [],
    startsAt: num(d.startsAt),
    endsAt: num(d.endsAt),
    status: d.status === 'closed' ? 'closed' : 'active',
    winners,
  };
}

export const tournamentOpen = (t: Tournament, now = Date.now()) => t.status === 'active' && now < t.endsAt;

/** Rows of one tournament, best time first. */
export function entriesFor(docs: { id: string; data: Record<string, unknown> }[], tid: string): EntryRow[] {
  const rows: EntryRow[] = [];
  for (const { id, data } of docs) {
    const t = (data.t ?? {}) as Record<string, Record<string, unknown>>;
    const e = t[tid];
    if (!e || typeof e !== 'object') continue;
    const best = num(e.best, 0);
    if (best <= 5) continue;
    rows.push({ uid: id, name: str(data.name, 24, 'נהג') || 'נהג', color: /^#[0-9a-fA-F]{6}$/.test(String(data.color)) ? String(data.color) : '#f4f6f8', best, tries: num(e.tries, 1) });
  }
  return rows.sort((a, b) => a.best - b.best);
}

/** Live view of everything the club screen needs. Subscribes once per cloud. */
export function useClubData() {
  const cloud = useCloud((s) => s.cloud);
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [entryDocs, setEntryDocs] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [myPrizes, setMyPrizes] = useState<PrizeItem[]>([]);
  const [allPrizes, setAllPrizes] = useState<{ uid: string; items: PrizeItem[] }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cloud) return;
    const onErr = (e: { code: string }) => setError(e.code);
    const unsubs = [
      cloud.db.collection('tournaments').limit(200).onSnapshot((s) => setTournaments(s.docs.map((d) => parseTournament(d.id, d.data())).filter((x): x is Tournament => !!x).sort((a, b) => b.startsAt - a.startsAt)), onErr),
      cloud.db.collection('tentries').limit(1000).onSnapshot((s) => setEntryDocs(s.docs.filter((d) => d.exists).map((d) => ({ id: d.id, data: d.data() ?? {} }))), onErr),
      cloud.db.collection('members').limit(1000).onSnapshot((s) => setMembers(s.docs.filter((d) => d.exists).map((d) => { const x = d.data() ?? {}; return { uid: d.id, name: str(x.name, 24, 'נהג') || 'נהג', joinedAt: num(x.joinedAt) }; })), onErr),
      cloud.db.doc(`prizes/${cloud.uid}`).onSnapshot((s) => setMyPrizes(parsePrizes(s.data())), onErr),
    ];
    if (cloud.isOwner) {
      unsubs.push(cloud.db.collection('prizes').limit(1000).onSnapshot((s) => setAllPrizes(s.docs.filter((d) => d.exists).map((d) => ({ uid: d.id, items: parsePrizes(d.data()) }))), onErr));
    }
    return () => unsubs.forEach((u) => u());
  }, [cloud]);

  return { cloud, tournaments, entryDocs, members, myPrizes, allPrizes, error };
}

function parsePrizes(d: Record<string, unknown> | undefined): PrizeItem[] {
  if (!d || !Array.isArray(d.items)) return [];
  return (d.items as Record<string, unknown>[]).slice(0, 100).map((p) => ({
    tid: str(p.tid, 40), tname: str(p.tname, 40), rank: num(p.rank, 1), prize: str(p.prize, 80), code: str(p.code, 20), issuedAt: num(p.issuedAt), redeemed: p.redeemed === true,
  }));
}

// ---------------------------------------------------------------- actions

export async function joinClub(cloud: Cloud, name: string) {
  await cloud.db.doc(`members/${cloud.uid}`).set({ name: name.slice(0, 24), joinedAt: Date.now() });
}

export async function leaveClub(cloud: Cloud) {
  await cloud.db.doc(`members/${cloud.uid}`).delete();
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const voucherCode = () => 'PT-' + Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export async function createTournament(cloud: Cloud, t: Omit<Tournament, 'id' | 'status' | 'winners' | 'startsAt'>) {
  const id = 't' + Date.now().toString(36);
  await cloud.db.doc(`tournaments/${id}`).set({ ...t, startsAt: Date.now(), status: 'active', winners: [] });
  return id;
}

export async function deleteTournament(cloud: Cloud, id: string) {
  await cloud.db.doc(`tournaments/${id}`).delete();
}

/** Owner: freeze results, announce top 3 and issue each a personal voucher code. */
export async function closeTournament(cloud: Cloud, t: Tournament, rows: EntryRow[]) {
  const top = rows.slice(0, 3);
  const winners = top.map((r, i) => ({ uid: r.uid, name: r.name, rank: i + 1, time: r.best, prize: t.prizes[i] ?? '' }));
  for (const w of winners) {
    if (!w.prize) continue;
    const ref = cloud.db.doc(`prizes/${w.uid}`);
    const cur = parsePrizes((await ref.get()).data());
    if (cur.some((p) => p.tid === t.id)) continue;
    await ref.set({ items: [...cur, { tid: t.id, tname: t.name, rank: w.rank, prize: w.prize, code: voucherCode(), issuedAt: Date.now(), redeemed: false }] });
  }
  await cloud.db.doc(`tournaments/${t.id}`).set({
    name: t.name, track: t.track, laps: t.laps, difficulty: t.difficulty, equal: t.equal, prizes: t.prizes,
    startsAt: t.startsAt, endsAt: Math.min(t.endsAt, Date.now()), status: 'closed', winners,
  });
}

export async function setRedeemed(cloud: Cloud, uid: string, items: PrizeItem[], code: string, redeemed: boolean) {
  await cloud.db.doc(`prizes/${uid}`).set({ items: items.map((p) => (p.code === code ? { ...p, redeemed } : p)) });
}

/** Save a finished tournament race if it beats the player's best. */
export async function submitTournamentTime(cloud: Cloud, tid: string, time: number, name: string, color: string): Promise<{ improved: boolean; best: number }> {
  const ref = cloud.db.doc(`tentries/${cloud.uid}`);
  const cur = (await ref.get()).data() ?? {};
  const t = { ...((cur.t ?? {}) as Record<string, { best: number; tries: number; at: number }>) };
  const prev = t[tid];
  const improved = !prev || time < prev.best;
  t[tid] = { best: improved ? time : prev.best, tries: (prev?.tries ?? 0) + 1, at: Date.now() };
  await ref.set({ name: name.slice(0, 24), color, t });
  return { improved, best: t[tid].best };
}

/** Rules this feature needs (declared at publish). */
export const CLUB_DB_RULES = [
  { path: 'members', read: 'view', write: 'owner' },
  { path: 'members/{self}', write: 'interact' },
  { path: 'tournaments', read: 'view', write: 'owner' },
  { path: 'tentries', read: 'view', write: 'owner' },
  { path: 'tentries/{self}', write: 'interact' },
  { path: 'prizes', read: 'owner', write: 'owner' },
  { path: 'prizes/{self}', read: 'interact', write: 'owner' },
];
