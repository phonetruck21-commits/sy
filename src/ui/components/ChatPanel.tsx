import { useEffect, useRef, useState } from 'react';
import { QUICK, sendChat, setIncomingHandler, useChat, MAX_LEN } from '../../net/chat';
import { useOnline } from '../../net/onlineStore';
import { getDictation, getTts, type Dictation, type Tts } from '../../net/voice';
import { Avatar } from './PlayerUI';

/**
 * Online chat: text, quick phrases, 🎤 speech-to-text and 🔊 read-aloud.
 * `compact` = the in-race overlay version.
 */
export function ChatPanel({ compact = false }: { compact?: boolean }) {
  const messages = useChat((s) => s.messages);
  const ttsOn = useChat((s) => s.ttsOn);
  const setTts = useChat((s) => s.setTts);
  const setPresence = useOnline((s) => s.setPresence);
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [dict, setDict] = useState<Dictation | null>(null);
  const [tts, setTtsNs] = useState<Tts | null>(null);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const dictRef = useRef<Dictation | null>(null);

  useEffect(() => {
    let alive = true;
    void getDictation().then((d) => { if (alive) { setDict(d); dictRef.current = d; } });
    void getTts().then((t) => { if (alive) setTtsNs(t); });
    return () => { alive = false; };
  }, []);

  // speak incoming messages when 🔊 is on
  useEffect(() => {
    if (!tts || !ttsOn) { setIncomingHandler(null); return; }
    setIncomingHandler((m) => { void tts.speak(`${m.name}: ${m.text}`).catch(() => undefined); });
    return () => { setIncomingHandler(null); };
  }, [tts, ttsOn]);

  // dictation → message
  useEffect(() => {
    if (!dict) return;
    const u1 = dict.onPartial(({ text }) => setPartial(text));
    const u2 = dict.onFinal(({ text }) => {
      setPartial('');
      const err = sendChat(setPresence, text);
      if (err) setText((t) => (t + ' ' + text).trim().slice(0, MAX_LEN));
    });
    const u3 = dict.onState(({ state, reason }) => {
      setListening(state !== 'idle');
      if (state === 'idle' && reason && !['stopped', 'viewer_stopped', 'completed', 'hidden'].includes(reason)) setHint('הדיבור לא זמין כרגע במכשיר הזה');
    });
    return () => { u1(); u2(); u3(); };
  }, [dict, setPresence]);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages.length, partial]);

  const send = (t: string) => {
    const err = sendChat(setPresence, t);
    setHint(err);
    if (!err) setText('');
  };

  const toggleMic = () => {
    const d = dictRef.current;
    if (!d) return;
    if (listening) { void d.stop().catch(() => undefined); return; }
    // must be called straight from the click, nothing awaited before it
    d.start().catch((e: { code?: string }) => {
      setListening(false);
      setHint(e?.code === 'not_granted' ? 'לא אישרת גישה למיקרופון' : 'לא הצלחנו להתחיל להקשיב');
    });
  };

  return (
    <div className={`flex flex-col gap-2 ${compact ? 'h-full' : ''}`} data-testid="chat">
      <div ref={list} className={`flex flex-col gap-1.5 overflow-y-auto pr-1 ${compact ? 'flex-1 min-h-0' : 'h-56'}`}>
        {messages.length === 0 && <div className="text-sm text-slate-400 text-center mt-4">עוד אין הודעות — תגיד היי 👋</div>}
        {messages.map((m) => (
          <div key={m.id} className={`flex items-start gap-2 ${m.mine ? 'flex-row-reverse' : ''}`}>
            {m.av ? <Avatar avatar={m.av} color={m.pc ?? '#35e0ff'} size={24} /> : <span className="text-lg">🚚</span>}
            <div className={`rounded-2xl px-3 py-1.5 max-w-[80%] ${m.mine ? 'bg-sky-700/70' : 'bg-slate-800/80'}`}>
              {!m.mine && <div className="text-[11px] text-cyan-300 font-bold" dir="auto">{m.name}</div>}
              <div className="text-sm break-words" dir="auto">{m.text}</div>
            </div>
          </div>
        ))}
        {partial && <div className="text-sm text-slate-400 italic self-end" dir="auto">🎤 {partial}…</div>}
      </div>
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {QUICK.map((q) => (
          <button key={q} type="button" className="shrink-0 rounded-full bg-slate-800/80 border border-white/10 px-2.5 py-1 text-sm hover:border-sky-400" onClick={() => send(q)}>{q}</button>
        ))}
      </div>
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input
          id={compact ? 'chat-input-race' : 'chat-input'}
          className="flex-1 min-w-0 rounded-xl bg-slate-900/80 border border-sky-500/30 px-3 py-2 text-sm outline-none focus:border-cyan-300"
          placeholder={listening ? 'מקשיב… דבר עכשיו' : 'כתוב הודעה…'}
          maxLength={MAX_LEN}
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir="auto"
          autoComplete="off"
        />
        {dict && (
          <button type="button" onClick={toggleMic} aria-label={listening ? 'הפסק להקשיב' : 'דבר במקום להקליד'} data-testid="chat-mic"
            className={`rounded-xl px-3 text-lg ${listening ? 'bg-red-600 animate-pulse' : 'bg-slate-800 border border-white/15'}`}>🎤</button>
        )}
        {tts && (
          <button type="button" onClick={() => { const on = !ttsOn; setTts(on); if (!on) tts.stop(); }} aria-label={ttsOn ? 'הפסק להקריא הודעות' : 'הקרא הודעות בקול'}
            className={`rounded-xl px-3 text-lg ${ttsOn ? 'bg-emerald-700' : 'bg-slate-800 border border-white/15'}`}>{ttsOn ? '🔊' : '🔈'}</button>
        )}
        <button type="submit" className="rounded-xl px-3 btn-neon font-bold text-sm" disabled={!text.trim()} data-testid="chat-send">שלח</button>
      </form>
      {hint && <div className="text-xs text-amber-300">{hint}</div>}
    </div>
  );
}

/** Floating 💬 button + panel used during an online race. */
export function RaceChat() {
  const open = useChat((s) => s.open);
  const setOpen = useChat((s) => s.setOpen);
  const unread = useChat((s) => s.unread);
  const last = useChat((s) => s.messages[s.messages.length - 1]);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!last || last.mine || open) return;
    setToast(`${last.name}: ${last.text}`);
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [last, open]);
  return (
    <>
      <button className="absolute top-[47%] left-2 z-10 glass rounded-full w-12 h-12 text-2xl pointer-events-auto" onClick={() => setOpen(!open)} aria-label="צ׳אט" data-testid="race-chat-btn">
        💬{unread > 0 && <span className="absolute -top-1 -right-1 bg-red-600 rounded-full text-xs w-5 h-5 flex items-center justify-center">{unread}</span>}
      </button>
      {toast && !open && <div className="absolute top-[47%] left-16 z-10 glass rounded-xl px-3 py-1.5 text-sm max-w-[50%] truncate pointer-events-none" dir="auto">{toast}</div>}
      {open && (
        <div className="absolute top-[22%] left-2 z-20 w-[min(22rem,80vw)] h-[55%] glass rounded-2xl p-2 pointer-events-auto">
          <ChatPanel compact />
        </div>
      )}
    </>
  );
}
