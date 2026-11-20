import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { WhepPlayer, type ConnState } from '../lib/webrtc';
import { fmtDateTime, fmtDuration, workSeconds } from '../lib/format';
import { Button, ErrorText, Input, StatusDot } from '../components/ui';
import { Logo, ThemeToggle } from '../components/Layout';

interface ViewSession {
  viewerToken: string;
  expiresIn: number;
  whepUrl: string;
  iceServers: RTCIceServer[];
}
interface ViewStatus {
  job: { job_number: number; device_type: string; issue_description: string; status_label: string; received_at: string; started_at: string | null; closed_at: string | null; business_name: string };
  live: boolean;
  serverTime: string;
}

const CONN_TEXT: Record<ConnState, { text: string; tone: 'live' | 'ok' | 'warn' | 'off' }> = {
  idle: { text: 'ממתין', tone: 'off' },
  connecting: { text: 'מתחבר לשידור…', tone: 'warn' },
  live: { text: 'שידור חי', tone: 'live' },
  reconnecting: { text: 'מתחבר מחדש…', tone: 'warn' },
  offline: { text: 'השידור אינו פעיל כרגע', tone: 'off' },
  failed: { text: 'הצפייה נחסמה', tone: 'off' },
  stopped: { text: 'הצפייה הסתיימה', tone: 'off' },
};

export default function Viewer() {
  const { token = '' } = useParams();
  const [pinNeeded, setPinNeeded] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState('');
  const [session, setSession] = useState<ViewSession | null>(null);
  const [status, setStatus] = useState<ViewStatus | null>(null);
  const [conn, setConn] = useState<ConnState>('idle');
  const [muted, setMuted] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [clockSkew, setClockSkew] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<ViewSession | null>(null);
  const pinRef = useRef('');
  const player = useRef<WhepPlayer | null>(null);

  const openSession = useCallback(async (): Promise<ViewSession> => {
    const s = await api<ViewSession>('/api/view/session', { body: { token, pin: pinRef.current || undefined }, token: null });
    tokenRef.current = s;
    setSession(s);
    return s;
  }, [token]);

  // first contact
  useEffect(() => {
    openSession().catch((err: ApiError) => {
      if (err.code === 'pin_required') setPinNeeded(true);
      else setFatal(err.message);
    });
  }, [openSession]);

  // refresh viewer token before it expires (also detects revocation)
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => {
      openSession().catch((err: ApiError) => {
        if (err.status === 410 || err.status === 401) {
          player.current?.stop();
          setFatal(err.message);
        }
      });
    }, Math.max(20, session.expiresIn - 60) * 1000);
    return () => clearTimeout(t);
  }, [session, openSession]);

  // job status polling
  useEffect(() => {
    if (!session) return;
    let stop = false;
    const poll = async () => {
      try {
        const s = await api<ViewStatus>('/api/view/status', { token: tokenRef.current?.viewerToken ?? null });
        if (stop) return;
        setStatus(s);
        setClockSkew(new Date(s.serverTime).getTime() - Date.now());
      } catch (err) {
        if ((err as ApiError).status === 410) {
          player.current?.stop();
          setFatal((err as Error).message);
        }
      }
    };
    void poll();
    const t = setInterval(poll, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [session]);

  // player
  useEffect(() => {
    if (!session || player.current) return;
    const p = new WhepPlayer({
      getCredentials: async () => {
        const s = tokenRef.current ?? (await openSession());
        return { url: s.whepUrl, token: s.viewerToken, iceServers: s.iceServers };
      },
      onStream: (s) => {
        if (videoRef.current && videoRef.current.srcObject !== s) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => undefined);
        }
      },
      onState: (s, detail) => {
        setConn(s);
        if (s === 'failed' && detail) setFatal(detail);
      },
    });
    player.current = p;
    p.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(
    () => () => {
      player.current?.stop();
    },
    [],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function submitPin(e: FormEvent) {
    e.preventDefault();
    setError('');
    pinRef.current = pin;
    try {
      await openSession();
      setPinNeeded(false);
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.status === 410) setFatal(e2.message);
      else setError(e2.message);
    }
  }

  function fullscreen() {
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (wrapRef.current?.requestFullscreen) void wrapRef.current.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.());
    else v?.webkitEnterFullscreen?.(); // iOS Safari
  }

  const job = status?.job;
  const c = CONN_TEXT[conn];

  return (
    <div className="min-h-full bg-surface">
      <header className="bg-navy-800 text-white dark:bg-black">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo small />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <div>
          <h1 className="text-xl font-bold">ברוכים הבאים למערכת הצפייה בשירות</h1>
          {job && <p className="text-muted">{job.business_name}</p>}
        </div>

        {fatal ? (
          <div className="rounded-2xl border border-line bg-panel p-6 text-center">
            <div className="mb-2 text-4xl">🔒</div>
            <p className="font-bold" data-testid="viewer-fatal">
              {fatal}
            </p>
          </div>
        ) : pinNeeded ? (
          <form onSubmit={submitPin} className="space-y-3 rounded-2xl border border-line bg-panel p-5">
            <p className="font-semibold">הזינו את קוד האימות שקיבלתם מבית העסק</p>
            <Input dir="ltr" inputMode="numeric" autoComplete="one-time-code" className="text-center text-2xl tracking-[0.4em]" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} maxLength={8} autoFocus />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" variant="accent" size="lg" className="w-full" disabled={pin.length < 4}>
              כניסה לצפייה
            </Button>
          </form>
        ) : (
          <>
            <div ref={wrapRef} className="relative overflow-hidden rounded-2xl bg-black shadow-xl">
              <video ref={videoRef} playsInline autoPlay muted={muted} className="aspect-video w-full object-contain" data-testid="viewer-video" />
              {conn !== 'live' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white">
                  <div className="text-4xl">{conn === 'offline' ? '⏸️' : '📡'}</div>
                  <div className="font-bold">{conn === 'offline' ? 'השידור אינו פעיל כרגע' : c.text}</div>
                  {conn === 'offline' && <div className="text-sm text-white/70">הצפייה תתחיל אוטומטית כשהטכנאי יתחיל לשדר</div>}
                </div>
              )}
              <div className="absolute start-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-sm font-bold text-white" data-testid="viewer-conn">
                <StatusDot tone={c.tone} /> {c.text}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={fullscreen}>
                ⛶ מסך מלא
              </Button>
              <Button variant="outline" onClick={() => setMuted(!muted)}>
                {muted ? '🔇 הפעל קול' : '🔊 השתק'}
              </Button>
              <span className="flex items-center rounded-xl border border-line px-3 text-sm text-muted" title="איכות השידור מותאמת אוטומטית לרוחב הפס של עמדת הטכנאי">
                איכות: אוטומטית
              </span>
            </div>
          </>
        )}

        {job && !fatal && (
          <section className="rounded-2xl border border-line bg-panel p-4">
            <h2 className="mb-3 font-bold">פרטי העבודה</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
              <dt className="text-muted">מספר תיקון</dt>
              <dd className="font-bold">#{job.job_number}</dd>
              <dt className="text-muted">סוג המכשיר</dt>
              <dd>{job.device_type}</dd>
              <dt className="text-muted">תיאור התקלה</dt>
              <dd>{job.issue_description}</dd>
              <dt className="text-muted">מצב התיקון</dt>
              <dd>
                <span className="rounded-full bg-accent/25 px-2.5 py-0.5 text-sm font-bold">{job.status_label}</span>
              </dd>
              <dt className="text-muted">תחילת העבודה</dt>
              <dd>{fmtDateTime(job.started_at)}</dd>
              <dt className="text-muted">זמן עבודה מצטבר</dt>
              <dd className="font-mono">{fmtDuration(workSeconds(job.started_at, job.closed_at, now + clockSkew))}</dd>
            </dl>
          </section>
        )}
        <p className="text-center text-xs text-muted">
          הצפייה אישית ומוגבלת בזמן. השידור מוצפן ומתבצע בהסכמתכם. אין להקליט או להפיץ את השידור. לשאלות פנו לבית העסק.
        </p>
      </main>
    </div>
  );
}
