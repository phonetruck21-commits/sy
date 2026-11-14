import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Customer, type Job, type JobDetail, type JobStatus } from '../lib/api';
import { STREAM_PROFILES, applyControl, captureStill, describeTrack, ensurePermission, isEmeetPixy, listDevices, openCamera, type DeviceLists } from '../lib/camera';
import { WhipPublisher, readVideoStats, type ConnState } from '../lib/webrtc';
import { LocalRecorder, downloadBlob } from '../lib/recorder';
import { localRecordings, newId, outbox, syncOutbox } from '../lib/storage';
import { desktopInfo, desktopOpenRecordingsFolder, isDesktop } from '../lib/desktop';
import { fmtDateTime, fmtDuration, workSeconds } from '../lib/format';
import { Badge, Button, Card, DemoBadge, ErrorText, Field, Input, Modal, Select, StatusDot, Textarea } from '../components/ui';
import { CustomerPicker, NewJobModal } from '../components/JobForm';
import { ShareLinkPanel } from '../components/ShareLinkPanel';
import { useOnline } from '../components/Layout';

interface StationSettings {
  workstation: string;
  cameraId: string;
  cameraLabel: string;
  micId: string; // '' = default mic, 'none' = no audio
  width: number;
  height: number;
  fps: number;
  profileId: string;
  uploadRecordings: boolean;
}

const STATION_KEY = 'sy.station';
const DEFAULTS: StationSettings = { workstation: 'עמדה-1', cameraId: '', cameraLabel: '', micId: '', width: 1920, height: 1080, fps: 30, profileId: '1080p', uploadRecordings: true };

function loadStation(): StationSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STATION_KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

type Alert = { id: number; tone: 'ok' | 'warn' | 'error' | 'info'; text: string; at: number };
type TrackInfo = ReturnType<typeof describeTrack>;
type Stats = Awaited<ReturnType<typeof readVideoStats>>;

const STREAM_LABEL: Record<ConnState, string> = {
  idle: 'לא משדר',
  connecting: 'מתחבר…',
  live: 'משדר בשידור חי',
  reconnecting: 'מתחבר מחדש…',
  offline: 'ממתין',
  failed: 'השידור נכשל',
  stopped: 'לא משדר',
};

export default function TechConsole() {
  const online = useOnline();
  const [station, setStation] = useState<StationSettings>(loadStation);
  const [devices, setDevices] = useState<DeviceLists>({ cameras: [], mics: [] });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [trackInfo, setTrackInfo] = useState<TrackInfo | null>(null);
  const [camState, setCamState] = useState<'starting' | 'ok' | 'error' | 'disconnected'>('starting');
  const [camError, setCamError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [statuses, setStatuses] = useState<JobStatus[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(() => localStorage.getItem('sy.activeJob'));
  const [job, setJob] = useState<JobDetail | null>(null);
  const [modal, setModal] = useState<'new' | 'open' | 'customer' | 'finish' | null>(null);

  const publisher = useRef<WhipPublisher | null>(null);
  const [streamState, setStreamState] = useState<ConnState>('idle');
  const [stats, setStats] = useState<Stats>(null);
  const recorder = useRef(new LocalRecorder());
  const [recording, setRecording] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [pending, setPending] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState(false);

  const alert = useCallback((tone: Alert['tone'], text: string) => {
    setAlerts((a) => [{ id: Date.now() + Math.random(), tone, text, at: Date.now() }, ...a].slice(0, 30));
  }, []);

  // ---- clock ----
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- persist station settings ----
  useEffect(() => {
    try {
      localStorage.setItem(STATION_KEY, JSON.stringify(station));
    } catch {
      /* ignore */
    }
  }, [station]);

  // ---- desktop: default workstation name = computer name ----
  useEffect(() => {
    if (!isDesktop() || localStorage.getItem(STATION_KEY)) return;
    desktopInfo().then((i) => i && setStation((s) => ({ ...s, workstation: i.hostname })));
  }, []);

  // ---- devices ----
  const refreshDevices = useCallback(async () => {
    const d = await listDevices();
    setDevices(d);
    return d;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await ensurePermission();
        if (!perm.audio) alert('warn', 'אין גישה למיקרופון – השידור יהיה ללא קול');
        const d = await refreshDevices();
        if (cancelled) return;
        if (!d.cameras.length) {
          setCamState('error');
          setCamError('לא נמצאה מצלמה מחוברת. חברו מצלמת USB ורעננו.');
          return;
        }
        setStation((s) => {
          const saved = d.cameras.find((c) => c.deviceId === s.cameraId) ?? d.cameras.find((c) => s.cameraLabel && c.label === s.cameraLabel);
          const pick = saved ?? d.cameras.find((c) => isEmeetPixy(c.label)) ?? d.cameras[0];
          return { ...s, cameraId: pick.deviceId, cameraLabel: pick.label };
        });
        api('/api/cameras/report', { body: { workstation: station.workstation, devices: d.cameras.map((c) => c.label || 'מצלמה') } }).catch(() => undefined);
      } catch (err) {
        setCamState('error');
        setCamError(`אין גישה למצלמה: ${(err as Error).message}`);
      }
    })();
    const onChange = () => {
      void refreshDevices().then((d) => {
        if (stream && !d.cameras.some((c) => c.deviceId === station.cameraId)) {
          setCamState('disconnected');
          alert('error', 'המצלמה נותקה מהמחשב');
        }
      });
    };
    navigator.mediaDevices?.addEventListener('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener('devicechange', onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- open camera whenever selection/format changes ----
  useEffect(() => {
    if (!station.cameraId) return;
    let cancelled = false;
    let opened: MediaStream | null = null;
    setCamState('starting');
    openCamera({ cameraId: station.cameraId, micId: station.micId === 'none' ? null : station.micId || undefined, width: station.width, height: station.height, fps: station.fps })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        opened = s;
        const audioError = (s as MediaStream & { audioError?: string }).audioError;
        if (audioError) alert('warn', `המיקרופון לא זמין: ${audioError}`);
        const v = s.getVideoTracks()[0];
        v.addEventListener('ended', () => {
          setCamState('disconnected');
          alert('error', 'המצלמה הפסיקה לשדר (נותקה או נתפסה ע"י תוכנה אחרת)');
        });
        setStream(s);
        setTrackInfo(describeTrack(v));
        setCamState('ok');
        setCamError('');
        if (publisher.current) await publisher.current.replaceTracks(s);
      })
      .catch((err) => {
        if (cancelled) return;
        setCamState('error');
        setCamError(`פתיחת המצלמה נכשלה: ${(err as Error).message}. ייתכן שהמצלמה בשימוש בתוכנה אחרת.`);
      });
    return () => {
      cancelled = true;
      // stop the previous stream once the new one replaced it
      setTimeout(() => opened?.getTracks().forEach((t) => t.stop()), 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station.cameraId, station.micId, station.width, station.height, station.fps]);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  // ---- jobs ----
  const loadJobs = useCallback(async () => {
    try {
      setJobs(await api<Job[]>('/api/jobs?open=true'));
    } catch {
      /* offline */
    }
  }, []);
  const loadJob = useCallback(async () => {
    if (!activeJobId) return setJob(null);
    try {
      setJob(await api<JobDetail>(`/api/jobs/${activeJobId}`));
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        setActiveJobId(null);
        setJob(null);
      }
    }
  }, [activeJobId]);

  useEffect(() => {
    void loadJobs();
    api<JobStatus[]>('/api/job-statuses').then(setStatuses).catch(() => undefined);
  }, [loadJobs]);
  useEffect(() => {
    if (activeJobId) localStorage.setItem('sy.activeJob', activeJobId);
    else localStorage.removeItem('sy.activeJob');
    void loadJob();
  }, [activeJobId, loadJob]);
  // refresh job (viewer count, links) periodically while streaming
  useEffect(() => {
    if (streamState !== 'live') return;
    const t = setInterval(() => void loadJob(), 5000);
    return () => clearInterval(t);
  }, [streamState, loadJob]);

  // ---- offline outbox sync ----
  useEffect(() => {
    const run = () =>
      void syncOutbox(setPending).then((r) => {
        if (r.uploaded) {
          alert('ok', `סונכרנו ${r.uploaded} קבצים לשרת`);
          void loadJob();
        }
      });
    run();
    const t = setInterval(run, 30_000);
    window.addEventListener('online', run);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', run);
    };
  }, [alert, loadJob]);

  // ---- stream stats ----
  useEffect(() => {
    if (streamState !== 'live') return setStats(null);
    let prev: { bytes: number; ts: number } | undefined;
    const t = setInterval(async () => {
      const s = await readVideoStats((await publisher.current?.stats()) ?? null, prev);
      if (s) prev = { bytes: s.bytes, ts: s.ts };
      setStats(s);
    }, 2000);
    return () => clearInterval(t);
  }, [streamState]);

  // stop everything when leaving the page
  useEffect(
    () => () => {
      publisher.current?.stop();
    },
    [],
  );

  // ---- actions ----
  const profile = STREAM_PROFILES.find((p) => p.id === station.profileId) ?? STREAM_PROFILES[0];

  function startStream() {
    if (!job || !stream) return;
    if (!job.consent_streaming_at) return alert('error', 'לא תועדה הסכמת הלקוח לשידור. עדכנו את ההסכמה בתיק העבודה.');
    publisher.current?.stop();
    const jobId = job.id;
    const p = new WhipPublisher({
      stream,
      maxBitrateKbps: profile.maxBitrateKbps,
      targetHeight: profile.height,
      getCredentials: async () => {
        const r = await api<{ whipUrl: string; token: string; iceServers: RTCIceServer[] }>(`/api/jobs/${jobId}/stream/start`, {
          body: { width: trackInfo?.actual.width, height: profile.height, fps: trackInfo?.actual.fps, maxBitrateKbps: profile.maxBitrateKbps, deviceLabel: station.cameraLabel.slice(0, 200) },
        });
        return { url: r.whipUrl, token: r.token, iceServers: r.iceServers };
      },
      onState: (s, detail) => {
        setStreamState(s);
        if (s === 'live') {
          alert('ok', 'השידור החי פעיל');
          void loadJob();
        }
        if (s === 'failed') alert('error', `השידור נכשל: ${detail ?? ''}`);
        if (s === 'reconnecting' && detail) alert('warn', `השידור מתחבר מחדש (${detail})`);
      },
    });
    publisher.current = p;
    p.start();
  }

  async function stopStream() {
    publisher.current?.stop();
    publisher.current = null;
    setStreamState('idle');
    if (job) await api(`/api/jobs/${job.id}/stream/stop`, { method: 'POST' }).catch(() => undefined);
    alert('info', 'השידור הופסק');
    void loadJob();
  }

  async function toggleRecording() {
    if (!stream) return;
    if (recording) {
      try {
        const r = await recorder.current.stop();
        setRecording(false);
        if (r.path) {
          alert('ok', `ההקלטה נשמרה: ${r.path}`);
        } else if (r.blob) {
          await localRecordings.add({ id: newId(), jobId: job?.id ?? null, jobNumber: job?.job_number, fileName: r.fileName, mime: r.mime, blob: r.blob, createdAt: new Date().toISOString(), durationSec: r.durationSec });
          if (job && station.uploadRecordings && job.consent_recording_at) {
            await outbox.add({ id: newId(), jobId: job.id, jobNumber: job.job_number, kind: 'video', mime: r.mime, blob: r.blob, capturedAt: new Date().toISOString(), attempts: 0 });
            void syncOutbox(setPending).then(() => loadJob());
          }
          alert('ok', `ההקלטה נשמרה מקומית (${fmtDuration(r.durationSec)})`);
          downloadBlob(r.blob, r.fileName);
        }
      } catch (err) {
        setRecording(false);
        alert('error', (err as Error).message);
      }
      return;
    }
    if (!job) return alert('warn', 'יש לבחור עבודה לפני הקלטה');
    if (!job.consent_recording_at) return alert('error', 'לא תועדה הסכמת הלקוח להקלטה');
    try {
      recorder.current.start(stream, `job-${job.job_number}`);
      setRecording(true);
      alert('info', 'ההקלטה התחילה');
    } catch (err) {
      alert('error', (err as Error).message);
    }
  }

  async function takePhoto() {
    if (!videoRef.current) return;
    if (!job) return alert('warn', 'יש לבחור עבודה לפני צילום');
    if (!job.consent_recording_at) return alert('error', 'לא תועדה הסכמת הלקוח לצילום');
    try {
      const blob = await captureStill(videoRef.current);
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      await outbox.add({ id: newId(), jobId: job.id, jobNumber: job.job_number, kind: 'photo', mime: 'image/jpeg', blob, capturedAt: new Date().toISOString(), attempts: 0 });
      const r = await syncOutbox(setPending);
      alert(r.pending ? 'warn' : 'ok', r.pending ? 'התמונה נשמרה מקומית ותסונכרן כשיחזור החיבור' : 'התמונה נשמרה בתיק העבודה');
      void loadJob();
    } catch (err) {
      alert('error', (err as Error).message);
    }
  }

  async function saveStationToServer() {
    try {
      await api(`/api/workstations/${encodeURIComponent(station.workstation)}`, { method: 'PUT', body: station });
      alert('ok', `הגדרות העמדה "${station.workstation}" נשמרו בשרת`);
    } catch (err) {
      alert('error', (err as Error).message);
    }
  }

  async function loadStationFromServer() {
    try {
      const r = await api<{ settings: Partial<StationSettings> }>(`/api/workstations/${encodeURIComponent(station.workstation)}`);
      const cam = devices.cameras.find((c) => c.label === r.settings.cameraLabel);
      setStation((s) => ({ ...s, ...r.settings, cameraId: cam?.deviceId ?? s.cameraId }));
      alert('ok', 'הגדרות העמדה נטענו מהשרת');
    } catch (err) {
      alert('error', (err as Error).message);
    }
  }

  const streaming = streamState === 'live' || streamState === 'connecting' || streamState === 'reconnecting';
  const workSec = job ? workSeconds(job.started_at, job.closed_at, now) : 0;
  const emeet = isEmeetPixy(station.cameraLabel);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      {/* ===== Main: video + actions ===== */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={camState === 'ok' ? 'ok' : camState === 'starting' ? 'warn' : 'live'}>
            <StatusDot tone={camState === 'ok' ? 'ok' : camState === 'starting' ? 'warn' : 'live'} /> מצלמה: {camState === 'ok' ? 'מחוברת' : camState === 'starting' ? 'מתחברת…' : camState === 'disconnected' ? 'מנותקת' : 'שגיאה'}
          </Badge>
          <Badge tone={streamState === 'live' ? 'live' : streaming ? 'warn' : 'neutral'} className="min-w-[8rem]">
            <span data-testid="stream-state">{STREAM_LABEL[streamState]}</span>
          </Badge>
          {recording && <Badge tone="live">● REC {fmtDuration(recorder.current.elapsedSec())}</Badge>}
          {job && streamState === 'live' && <Badge tone="info">👁 צופים: {job.stream.viewers}</Badge>}
          {stats && (
            <Badge tone="neutral">
              {stats.width}×{stats.height} · {Math.round(stats.fps ?? 0)}fps · {stats.kbps} kbps
            </Badge>
          )}
          {pending > 0 && <Badge tone="warn">⏳ {pending} ממתינים לסנכרון</Badge>}
          {!online && <Badge tone="warn">עבודה במצב לא מקוון</Badge>}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-line bg-black shadow-lg">
          <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full object-contain" data-testid="preview" />
          {flash && <div className="absolute inset-0 bg-white/80" />}
          {camState !== 'ok' && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-white">
              <div>
                <div className="mb-2 text-4xl">📷</div>
                <div className="font-bold">{camState === 'starting' ? 'מפעיל מצלמה…' : 'המצלמה אינה זמינה'}</div>
                {camError && <div className="mt-1 max-w-md text-sm text-white/75">{camError}</div>}
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 text-white">
            <div className="flex gap-2">
              {streamState === 'live' && <span className="rounded-md bg-live px-2 py-0.5 text-sm font-black">● LIVE</span>}
              {recording && <span className="rounded-md bg-black/70 px-2 py-0.5 text-sm font-bold text-live">● REC</span>}
            </div>
            {job && (
              <div className="rounded-lg bg-black/60 px-3 py-1 text-end text-sm">
                <div className="font-bold">עבודה #{job.job_number}</div>
                <div className="text-white/80">⏱ {fmtDuration(workSec)}</div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {!streaming ? (
            <Button variant="danger" size="lg" onClick={startStream} disabled={!job || camState !== 'ok' || job.is_terminal} data-testid="start-stream">
              🔴 התחל שידור
            </Button>
          ) : (
            <Button variant="outline" size="lg" onClick={stopStream} data-testid="stop-stream">
              ⏹️ עצור שידור
            </Button>
          )}
          <Button variant={recording ? 'danger' : 'primary'} size="lg" onClick={toggleRecording} disabled={camState !== 'ok'}>
            {recording ? '⏹️ עצור הקלטה' : '🎥 התחל הקלטה'}
          </Button>
          <Button variant="primary" size="lg" onClick={takePhoto} disabled={camState !== 'ok'}>
            📷 צלם תמונה
          </Button>
          <Button variant="success" size="lg" onClick={() => setModal('finish')} disabled={!job || job.is_terminal}>
            ✅ סיים תיקון
          </Button>
          <Button variant="accent" size="lg" onClick={() => setModal('new')} data-testid="new-job">
            🔧 פתח עבודה חדשה
          </Button>
          <Button variant="outline" size="lg" onClick={() => setModal('customer')} disabled={!job}>
            👤 בחר לקוח
          </Button>
          <Button variant="outline" size="lg" onClick={() => (loadJobs(), setModal('open'))}>
            📁 פתח תיק עבודה
          </Button>
          {isDesktop() ? (
            <Button variant="outline" size="lg" onClick={() => void desktopOpenRecordingsFolder()}>
              🗂️ תיקיית הקלטות
            </Button>
          ) : (
            <Link to="/jobs" className="contents">
              <Button variant="outline" size="lg" className="w-full">
                📋 כל העבודות
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ===== Side panel ===== */}
      <div className="space-y-4">
        <Card title="עבודה פעילה" actions={job && <Link to={`/jobs/${job.id}`} className="text-sm font-semibold text-navy-600 underline dark:text-accent">לתיק המלא</Link>}>
          {job ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm" data-testid="active-job">
              <dt className="text-muted">מספר קריאה</dt>
              <dd className="font-bold">
                #{job.job_number} <DemoBadge show={job.is_demo} />
              </dd>
              <dt className="text-muted">לקוח</dt>
              <dd>{job.customer?.fullName ?? <span className="text-muted">לא נבחר</span>}</dd>
              <dt className="text-muted">מכשיר</dt>
              <dd>{job.device_type}</dd>
              <dt className="text-muted">תקלה</dt>
              <dd className="line-clamp-2">{job.issue_description}</dd>
              <dt className="text-muted">סטטוס</dt>
              <dd>
                <Badge tone="info">{job.status_label}</Badge>
              </dd>
              <dt className="text-muted">זמן עבודה</dt>
              <dd className="font-mono">{fmtDuration(workSec)}</dd>
              <dt className="text-muted">הסכמה</dt>
              <dd>
                {job.consent_streaming_at ? <Badge tone="ok">שידור ✓</Badge> : <Badge tone="warn">שידור ✗</Badge>}{' '}
                {job.consent_recording_at ? <Badge tone="ok">צילום ✓</Badge> : <Badge tone="warn">צילום ✗</Badge>}
              </dd>
              <dt className="text-muted">מדיה</dt>
              <dd>
                {job.media.filter((m) => m.kind === 'photo').length} תמונות · {job.media.filter((m) => m.kind === 'video').length} סרטונים
              </dd>
            </dl>
          ) : (
            <div className="space-y-2 text-sm text-muted">
              <p>לא נבחרה עבודה. פתחו עבודה חדשה או בחרו עבודה קיימת כדי לשדר ולתעד.</p>
            </div>
          )}
        </Card>

        {job && (
          <Card title="📱 קישור צפייה ללקוח">
            <ShareLinkPanel
              jobId={job.id}
              links={job.shareLinks}
              onChange={() => void loadJob()}
              disabled={job.is_terminal ? 'העבודה סגורה' : !job.consent_streaming_at ? 'לא ניתן ליצור קישור ללא הסכמת הלקוח לשידור' : undefined}
            />
          </Card>
        )}

        <Card title="🎛️ מצלמה ועמדת עבודה">
          <div className="space-y-3">
            {emeet && (
              <p className="rounded-lg bg-navy-50 p-2 text-xs text-navy-800 dark:bg-navy-600/30 dark:text-navy-50">
                זוהתה מצלמת EMEET PIXY. מעקב AI, מחוות והחלפת עדשות נשלטים דרך תוכנת היצרן (EMEET Studio). כאן מוצגות רק בקרות UVC שהמצלמה מדווחת בפועל.
              </p>
            )}
            <Field label="מצלמה">
              <Select value={station.cameraId} disabled={recording} onChange={(e) => setStation({ ...station, cameraId: e.target.value, cameraLabel: devices.cameras.find((c) => c.deviceId === e.target.value)?.label ?? '' })} data-testid="camera-select">
                {devices.cameras.map((c, i) => (
                  <option key={c.deviceId} value={c.deviceId}>
                    {c.label || `מצלמה ${i + 1}`}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="רזולוציית צילום">
                <Select
                  value={`${station.width}x${station.height}`}
                  disabled={recording}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split('x').map(Number);
                    setStation({ ...station, width: w, height: h });
                  }}
                >
                  {(trackInfo?.resolutions.length ? trackInfo.resolutions : [{ width: 1920, height: 1080, label: '1080p' }]).map((r) => (
                    <option key={r.label} value={`${r.width}x${r.height}`}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="קצב פריימים">
                <Select value={station.fps} disabled={recording} onChange={(e) => setStation({ ...station, fps: Number(e.target.value) })}>
                  {[15, 24, 30, 60].filter((f) => !trackInfo || f <= Math.max(trackInfo.maxFps, 15)).map((f) => (
                    <option key={f} value={f}>
                      {f} fps
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {trackInfo?.actual.width && (
              <p className="text-xs text-muted">
                בפועל מהמצלמה: {trackInfo.actual.width}×{trackInfo.actual.height} @ {trackInfo.actual.fps ?? '?'}fps
              </p>
            )}
            <Field label="איכות שידור ללקוח">
              <Select value={station.profileId} disabled={streaming} onChange={(e) => setStation({ ...station, profileId: e.target.value })}>
                {STREAM_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="מיקרופון">
              <Select value={station.micId} disabled={recording} onChange={(e) => setStation({ ...station, micId: e.target.value })}>
                <option value="">ברירת מחדל של המערכת</option>
                {devices.mics.map((m, i) => (
                  <option key={m.deviceId} value={m.deviceId}>
                    {m.label || `מיקרופון ${i + 1}`}
                  </option>
                ))}
                <option value="none">ללא קול</option>
              </Select>
            </Field>
            {trackInfo && trackInfo.controls.length > 0 && stream && (
              <details className="rounded-xl border border-line p-2">
                <summary className="cursor-pointer text-sm font-semibold">בקרות מצלמה נתמכות ({trackInfo.controls.length})</summary>
                <div className="mt-2 space-y-2">
                  {trackInfo.controls.map((c) => (
                    <Field key={c.name} label={c.label}>
                      {c.type === 'range' ? (
                        <input
                          type="range"
                          className="w-full accent-amber-400"
                          min={c.min}
                          max={c.max}
                          step={c.step}
                          defaultValue={c.value as number}
                          onChange={(e) => applyControl(stream.getVideoTracks()[0], c.name, Number(e.target.value)).catch((err) => alert('warn', `${c.label}: ${err.message}`))}
                        />
                      ) : (
                        <Select defaultValue={c.value as string} onChange={(e) => applyControl(stream.getVideoTracks()[0], c.name, e.target.value).catch((err) => alert('warn', `${c.label}: ${err.message}`))}>
                          {c.options!.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  ))}
                </div>
              </details>
            )}
            {!isDesktop() && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-amber-400" checked={station.uploadRecordings} onChange={(e) => setStation({ ...station, uploadRecordings: e.target.checked })} />
                העלאת הקלטות לשרת (בנוסף לשמירה מקומית)
              </label>
            )}
            <div className="flex items-end gap-2">
              <Field label="שם עמדה">
                <Input value={station.workstation} onChange={(e) => setStation({ ...station, workstation: e.target.value })} />
              </Field>
              <Button variant="outline" size="sm" onClick={saveStationToServer}>
                שמור
              </Button>
              <Button variant="ghost" size="sm" onClick={loadStationFromServer}>
                טען
              </Button>
            </div>
          </div>
        </Card>

        <Card title="🔔 התראות מערכת">
          <ul className="max-h-56 space-y-1 overflow-y-auto text-sm" data-testid="alerts">
            {alerts.map((a) => (
              <li key={a.id} className={`rounded-lg px-2 py-1 ${a.tone === 'error' ? 'bg-live/10 text-live' : a.tone === 'warn' ? 'bg-accent/15' : a.tone === 'ok' ? 'bg-emerald-500/10' : 'bg-line/40'}`}>
                <span className="text-xs text-muted">{new Date(a.at).toLocaleTimeString('he-IL')}</span> {a.text}
              </li>
            ))}
            {!alerts.length && <li className="text-muted">אין התראות</li>}
          </ul>
        </Card>
      </div>

      <NewJobModal
        open={modal === 'new'}
        onClose={() => setModal(null)}
        onCreated={(j) => {
          setModal(null);
          setActiveJobId(j.id);
          void loadJobs();
          alert('ok', `נפתחה עבודה #${j.job_number}`);
        }}
      />

      <Modal open={modal === 'open'} title="📁 פתיחת תיק עבודה" onClose={() => setModal(null)} wide>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {jobs.map((j) => (
            <button
              key={j.id}
              onClick={() => {
                setActiveJobId(j.id);
                setModal(null);
              }}
              className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2.5 text-start hover:bg-line/40"
            >
              <span>
                <b>#{j.job_number}</b> · {j.device_type} · {j.customer_name ?? 'ללא לקוח'} <DemoBadge show={j.is_demo} />
              </span>
              <span className="flex items-center gap-2 text-sm">
                <Badge tone="info">{j.status_label}</Badge>
                <span className="text-muted">{fmtDateTime(j.received_at)}</span>
              </span>
            </button>
          ))}
          {!jobs.length && <p className="text-muted">אין עבודות פתוחות</p>}
        </div>
      </Modal>

      <Modal open={modal === 'customer'} title="👤 בחירת לקוח לעבודה" onClose={() => setModal(null)}>
        <CustomerPicker
          value={null}
          onChange={async (c: Customer | null) => {
            if (!c || !job) return;
            try {
              await api(`/api/jobs/${job.id}`, { method: 'PATCH', body: { customerId: c.id } });
              setModal(null);
              alert('ok', `הלקוח ${c.fullName} שויך לעבודה`);
              void loadJob();
            } catch (err) {
              alert('error', (err as Error).message);
            }
          }}
        />
      </Modal>

      {job && (
        <FinishModal
          open={modal === 'finish'}
          job={job}
          statuses={statuses}
          onClose={() => setModal(null)}
          onDone={async () => {
            if (recording) await toggleRecording();
            if (streaming) await stopStream();
            setModal(null);
            alert('ok', `עבודה #${job.job_number} עודכנה`);
            void loadJob();
            void loadJobs();
          }}
        />
      )}
    </div>
  );
}

function FinishModal({ open, job, statuses, onClose, onDone }: { open: boolean; job: JobDetail; statuses: JobStatus[]; onClose: () => void; onDone: () => void }) {
  const defaultStatus = statuses.find((s) => s.key === 'ready')?.key ?? statuses.find((s) => s.is_terminal)?.key ?? '';
  const [status, setStatus] = useState(defaultStatus);
  const [summary, setSummary] = useState(job.summary ?? '');
  const [parts, setParts] = useState(job.parts_replaced.map((p) => `${p.name}${p.qty > 1 ? ` x${p.qty}` : ''}`).join('\n'));
  const [error, setError] = useState('');
  useEffect(() => setStatus(defaultStatus), [defaultStatus]);

  async function submit() {
    setError('');
    try {
      const partsReplaced = parts
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const m = l.match(/^(.*?)\s*x\s*(\d+)$/i);
          return m ? { name: m[1], qty: Number(m[2]) } : { name: l, qty: 1 };
        });
      await api(`/api/jobs/${job.id}`, { method: 'PATCH', body: { summary, partsReplaced } });
      await api(`/api/jobs/${job.id}/status`, { body: { status } });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal open={open} title={`✅ סיום תיקון – עבודה #${job.job_number}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="סיכום עבודה">
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="מה בוצע, מה נבדק, המלצות ללקוח" />
        </Field>
        <Field label="חלקים שהוחלפו (שורה לכל חלק, לדוגמה: מסך OLED x1)">
          <Textarea value={parts} onChange={(e) => setParts(e.target.value)} />
        </Field>
        <Field label="סטטוס חדש">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {statuses.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
                {s.is_terminal ? ' (סוגר את העבודה ומבטל קישורים)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs text-muted">השידור וההקלטה ייעצרו אוטומטית.</p>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button variant="success" onClick={submit}>
            שמור וסיים
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
        </div>
      </div>
    </Modal>
  );
}
