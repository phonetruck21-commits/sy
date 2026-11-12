/**
 * Online chat. Messages ride in each player's room *presence* (everyone may set
 * presence, even view-only players): every player keeps their last 4 messages
 * in `chat`, and the others pick up any new id. Messages are not stored —
 * whoever is in the room right now sees them.
 *
 * Voice: claude.ai pages can't open a raw microphone or a live call, so 🎤 uses
 * the platform's `dictation` (speech → text) and 🔊 reads incoming messages
 * aloud with `tts`. Both are optional and hidden where the device lacks them.
 */
import { create } from 'zustand';
import type { Peer } from './roomApi';

export interface ChatMsg { id: string; peer: string; name: string; av?: string; pc?: string; text: string; at: number; mine: boolean }
interface OutMsg { id: string; t: string; at: number }

export const MAX_LEN = 160;
export const QUICK = ['👋 היי!', '🏁 בהצלחה!', '😂', '🔥 תפסו אותי!', '😎', 'GG 🏆', '🚚💨', 'עוד מירוץ?'];

interface ChatState {
  messages: ChatMsg[];
  unread: number;
  open: boolean;
  ttsOn: boolean;
  setOpen: (o: boolean) => void;
  setTts: (o: boolean) => void;
  reset: () => void;
}
export const useChat = create<ChatState>()((set) => ({
  messages: [],
  unread: 0,
  open: false,
  ttsOn: false,
  setOpen: (open) => set((s) => ({ open, unread: open ? 0 : s.unread })),
  setTts: (ttsOn) => set({ ttsOn }),
  reset: () => set({ messages: [], unread: 0 }),
}));

const seen = new Set<string>();
let outbox: OutMsg[] = [];
let lastSent = 0;
let onIncoming: ((m: ChatMsg) => void) | null = null;
export const setIncomingHandler = (fn: ((m: ChatMsg) => void) | null) => (onIncoming = fn);

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, MAX_LEN);

/** Pull new messages out of everyone's presence. Called on every room update. */
export function ingestPeers(peers: readonly Peer[]) {
  const fresh: ChatMsg[] = [];
  for (const p of peers) {
    const pr = p.presence as Record<string, unknown>;
    if (!Array.isArray(pr.chat)) continue;
    const look = (pr.look ?? {}) as Record<string, unknown>;
    const name = typeof pr.name === 'string' && pr.name.trim() ? pr.name.slice(0, 24) : 'נהג';
    for (const raw of (pr.chat as unknown[]).slice(-4)) {
      const m = raw as Record<string, unknown>;
      if (typeof m?.id !== 'string' || typeof m.t !== 'string') continue;
      const key = `${p.peer}:${m.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const text = clean(m.t);
      if (!text) continue;
      fresh.push({
        id: key, peer: p.peer, name, text,
        av: typeof look.av === 'string' ? look.av : undefined,
        pc: typeof look.pc === 'string' && /^#[0-9a-fA-F]{6}$/.test(look.pc) ? look.pc : undefined,
        at: typeof m.at === 'number' ? m.at : Date.now(),
        mine: p.isMe && p.sameTab,
      });
    }
  }
  if (!fresh.length) return;
  fresh.sort((a, b) => a.at - b.at);
  const st = useChat.getState();
  const incoming = fresh.filter((m) => !m.mine);
  useChat.setState({
    messages: [...st.messages, ...fresh].slice(-80),
    unread: st.open ? 0 : st.unread + incoming.length,
  });
  incoming.forEach((m) => onIncoming?.(m));
}

/** Send a message: becomes part of my presence. Returns an error text or null. */
export function sendChat(setPresence: (patch: Record<string, unknown>) => void, text: string): string | null {
  const t = clean(text);
  if (!t) return null;
  const now = Date.now();
  if (now - lastSent < 700) return 'רגע… לאט יותר 🙂';
  lastSent = now;
  outbox = [...outbox, { id: now.toString(36) + Math.random().toString(36).slice(2, 5), t, at: now }].slice(-4);
  setPresence({ chat: outbox });
  return null;
}

export function resetChat() {
  seen.clear();
  outbox = [];
  useChat.getState().reset();
}
