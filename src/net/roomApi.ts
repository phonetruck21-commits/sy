/**
 * Thin wrapper around the claude.ai artifact `room` capability (live presence
 * shared by everyone who has the page open). When the game runs outside
 * claude.ai (local dev), a BroadcastChannel mock lets several tabs on the same
 * computer play together, so online play can be developed and tested locally.
 */
export type Json = unknown;

export interface Peer {
  peer: string;
  isMe: boolean;
  sameTab: boolean;
  kind: 'viewer' | 'agent';
  guest: boolean;
  presence: Readonly<Record<string, Json>>;
  updatedAt: number;
}

export interface PeersChange {
  peers: readonly Peer[];
}

export interface NamedRoom {
  readonly name: string;
  presence(patch: Record<string, Json | null>): Promise<void>;
  peers(): readonly Peer[];
  onPeers(handler: (c: PeersChange) => void, onError?: (e: { code: string; message: string }) => void): () => void;
  connected(): boolean;
  leave(): Promise<void>;
}

interface RoomNamespace {
  join(name: string): Promise<NamedRoom>;
  // the base room (everyone admitted to the page) — same calls as a named room
  presence(patch: Record<string, Json | null>): Promise<void>;
  peers(): readonly Peer[];
  onPeers(handler: (c: PeersChange) => void, onError?: (e: { code: string; message: string }) => void): () => void;
  connected(): boolean;
}

const OUR_FIELDS = ['v', 'name', 'look', 'truck', 'race', 'go', 'loaded', 'car', 'cfg', 'chat'];

/** The page-wide base room used as a NamedRoom (no extra permission needed beyond the page). */
export function lobbyAsRoom(ns: RoomNamespace): NamedRoom {
  return {
    name: 'lobby',
    presence: (p) => ns.presence(p),
    peers: () => ns.peers(),
    onPeers: (h, e) => ns.onPeers(h, e),
    connected: () => ns.connected(),
    leave: async () => {
      const clear: Record<string, null> = {};
      OUR_FIELDS.forEach((k) => (clear[k] = null));
      await ns.presence(clear).catch(() => undefined);
    },
  };
}

type ClaudeGlobal = { use?: (name: string) => Promise<unknown> };

let roomPromise: Promise<RoomNamespace | null> | null = null;
export let roomIsMock = false;

export function getRoomApi(): Promise<RoomNamespace | null> {
  if (roomPromise) return roomPromise;
  const claude = (window as unknown as { claude?: ClaudeGlobal }).claude;
  if (claude?.use) {
    roomPromise = claude
      .use('room')
      .then((ns) => (ns as RoomNamespace | null) ?? null)
      .catch(() => null);
  } else if (typeof BroadcastChannel !== 'undefined') {
    roomIsMock = true;
    roomPromise = Promise.resolve(createMockRoomApi());
  } else {
    roomPromise = Promise.resolve(null);
  }
  return roomPromise;
}

// ---------------------------------------------------------------------------
// Local mock: same-computer multiplayer between browser tabs.
function createMockRoomApi(): RoomNamespace {
  const me = Math.random().toString(36).slice(2, 10);
  const api: RoomNamespace = {
    presence: (p) => getLobby().then((l) => l.presence(p)),
    peers: () => lobbySync?.peers() ?? [],
    onPeers: (h, e) => { let u: (() => void) | null = null; let off = false; void getLobby().then((l) => { if (!off) u = l.onPeers(h, e); }); return () => { off = true; u?.(); }; },
    connected: () => true,
    async join(name: string): Promise<NamedRoom> {
      const ch = new BroadcastChannel(`truck-room-${name}`);
      let mine: Record<string, Json> = {};
      const others = new Map<string, { presence: Record<string, Json>; seen: number; updatedAt: number }>();
      const handlers = new Set<(c: PeersChange) => void>();
      let snapshot: Peer[] = [];
      let left = false;
      const rebuild = () => {
        const now = Date.now();
        snapshot = [
          { peer: me, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...mine }), updatedAt: now },
          ...[...others.entries()].map(([peer, o]) => ({ peer, isMe: false, sameTab: false, kind: 'viewer' as const, guest: false, presence: Object.freeze({ ...o.presence }), updatedAt: o.updatedAt })),
        ];
        handlers.forEach((h) => h({ peers: snapshot }));
      };
      const send = () => ch.postMessage({ t: 'p', peer: me, presence: mine });
      ch.onmessage = (ev) => {
        const m = ev.data as { t: string; peer: string; presence?: Record<string, Json> };
        if (m.t === 'p' && m.presence) {
          const isNew = !others.has(m.peer);
          others.set(m.peer, { presence: m.presence, seen: Date.now(), updatedAt: Date.now() });
          if (isNew) send();
          rebuild();
        } else if (m.t === 'bye') {
          others.delete(m.peer);
          rebuild();
        }
      };
      const hb = setInterval(() => {
        send();
        const now = Date.now();
        let changed = false;
        for (const [k, o] of others) if (now - o.seen > 3500) { others.delete(k); changed = true; }
        if (changed) rebuild();
      }, 1000);
      window.addEventListener('beforeunload', () => ch.postMessage({ t: 'bye', peer: me }));
      let pending = false;
      setTimeout(() => { send(); rebuild(); }, 0);
      return {
        name,
        async presence(patch) {
          if (left) return;
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) delete mine[k];
            else mine[k] = v;
          }
          mine = { ...mine };
          if (!pending) {
            pending = true;
            setTimeout(() => { pending = false; send(); rebuild(); }, 33);
          }
        },
        peers: () => snapshot,
        onPeers(h) {
          handlers.add(h);
          setTimeout(() => h({ peers: snapshot }), 0);
          return () => handlers.delete(h);
        },
        connected: () => !left,
        async leave() {
          left = true;
          clearInterval(hb);
          ch.postMessage({ t: 'bye', peer: me });
          ch.close();
          handlers.clear();
        },
      };
    },
  };
  let lobbySync: NamedRoom | null = null;
  let lobbyP: Promise<NamedRoom> | null = null;
  const getLobby = () => (lobbyP ??= api.join('__lobby__').then((l) => (lobbySync = l)));
  void getLobby();
  return api;
}
