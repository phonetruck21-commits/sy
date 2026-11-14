import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiBase, getToken, type JobDetail as JD, type JobStatus } from '../lib/api';
import { fmtBytes, fmtDateTime, fmtDuration, workSeconds } from '../lib/format';
import { Badge, Button, Card, DemoBadge, ErrorText, Field, Input, Select, Textarea } from '../components/ui';
import { ShareLinkPanel } from '../components/ShareLinkPanel';

function MediaThumb({ id, kind, mime }: { id: string; kind: string; mime: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let revoke = '';
    // Media is never public: fetch with the session token and show via a blob URL
    fetch(`${apiBase()}/api/media/${id}/content`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        revoke = URL.createObjectURL(b);
        setUrl(revoke);
      })
      .catch(() => undefined);
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [id]);
  if (!url) return <div className="aspect-video animate-pulse rounded-lg bg-line/60" />;
  return kind === 'photo' ? (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="" className="aspect-video w-full rounded-lg object-cover" />
    </a>
  ) : (
    <video src={url} controls className="aspect-video w-full rounded-lg" data-mime={mime} />
  );
}

export default function JobDetail() {
  const { id = '' } = useParams();
  const [job, setJob] = useState<JD | null>(null);
  const [statuses, setStatuses] = useState<JobStatus[]>([]);
  const [notes, setNotes] = useState({ techNotes: '', summary: '' });
  const [consentMethod, setConsentMethod] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const j = await api<JD>(`/api/jobs/${id}`);
      setJob(j);
      setNotes({ techNotes: j.tech_notes ?? '', summary: j.summary ?? '' });
      setConsentMethod(j.consent_method ?? '');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
    api<JobStatus[]>('/api/job-statuses').then(setStatuses).catch(() => undefined);
  }, [load]);

  if (error && !job) return <ErrorText>{error}</ErrorText>;
  if (!job) return <p className="text-muted">טוען…</p>;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError('');
    setMsg('');
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Card
          title={
            <span>
              תיק עבודה #{job.job_number} <DemoBadge show={job.is_demo} />
            </span>
          }
          actions={<Link to="/tech" className="text-sm font-semibold underline">לעמדת הטכנאי</Link>}
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm md:grid-cols-[auto_1fr_auto_1fr]">
            <dt className="text-muted">לקוח</dt>
            <dd>
              {job.customer ? (
                <>
                  {job.customer.fullName} <span dir="ltr" className="text-muted">{job.customer.phone}</span>
                </>
              ) : (
                '—'
              )}
            </dd>
            <dt className="text-muted">מכשיר</dt>
            <dd>
              {job.device_type} {job.device_details && <span className="text-muted">({job.device_details})</span>}
            </dd>
            <dt className="text-muted">טכנאי</dt>
            <dd>{job.technician_name ?? '—'}</dd>
            <dt className="text-muted">סטטוס</dt>
            <dd>
              <Badge tone="info">{job.status_label}</Badge>
            </dd>
            <dt className="text-muted">התקבל</dt>
            <dd>{fmtDateTime(job.received_at)}</dd>
            <dt className="text-muted">תחילת עבודה</dt>
            <dd>{fmtDateTime(job.started_at)}</dd>
            <dt className="text-muted">נסגר</dt>
            <dd>{fmtDateTime(job.closed_at)}</dd>
            <dt className="text-muted">זמן עבודה</dt>
            <dd className="font-mono">{fmtDuration(workSeconds(job.started_at, job.closed_at))}</dd>
            <dt className="text-muted">שידור</dt>
            <dd>{job.stream.live ? <Badge tone="live">LIVE · {job.stream.viewers} צופים</Badge> : 'לא פעיל'}</dd>
          </dl>
          <div className="mt-3 rounded-xl bg-line/30 p-3 text-sm">
            <b>תיאור התקלה: </b>
            {job.issue_description}
          </div>
        </Card>

        <Card title="הערות וסיכום">
          <div className="space-y-3">
            <Field label="הערות טכנאי (פנימי)">
              <Textarea value={notes.techNotes} onChange={(e) => setNotes({ ...notes, techNotes: e.target.value })} />
            </Field>
            <Field label="סיכום עבודה">
              <Textarea value={notes.summary} onChange={(e) => setNotes({ ...notes, summary: e.target.value })} />
            </Field>
            {job.parts_replaced.length > 0 && (
              <div className="text-sm">
                <b>חלקים שהוחלפו:</b> {job.parts_replaced.map((p) => `${p.name} ×${p.qty}`).join(', ')}
              </div>
            )}
            <Button onClick={() => run(() => api(`/api/jobs/${job.id}`, { method: 'PATCH', body: notes }), 'נשמר')}>שמור</Button>
          </div>
        </Card>

        <Card title={`תמונות וסרטונים (${job.media.length})`}>
          {job.media.length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {job.media.map((m) => (
                <div key={m.id} className="space-y-1">
                  <MediaThumb id={m.id} kind={m.kind} mime={m.mime} />
                  <div className="text-xs text-muted">
                    {m.kind === 'photo' ? '📷' : '🎥'} {fmtDateTime(m.captured_at ?? m.created_at)} · {fmtBytes(m.size_bytes)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">אין עדיין מדיה בתיק.</p>
          )}
        </Card>

        <Card title="היסטוריית סטטוסים">
          <ol className="space-y-1 text-sm">
            {job.history.map((h, i) => (
              <li key={i}>
                {fmtDateTime(h.created_at)} · {statuses.find((s) => s.key === h.from_status)?.label ?? (h.from_status ? h.from_status : 'פתיחה')} ← <b>{statuses.find((s) => s.key === h.to_status)?.label ?? h.to_status}</b>{' '}
                {h.user_name && <span className="text-muted">({h.user_name})</span>}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="space-y-4">
        {(msg || error) && (
          <div>
            {msg && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold">{msg}</p>}
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        <Card title="שינוי סטטוס">
          <div className="flex flex-wrap gap-2">
            {statuses.map((s) => (
              <Button
                key={s.key}
                size="sm"
                variant={s.key === job.status_key ? 'accent' : 'outline'}
                disabled={s.key === job.status_key}
                onClick={() => {
                  if (s.is_terminal && !confirm('סגירת העבודה תעצור את השידור ותבטל את כל קישורי הצפייה. להמשיך?')) return;
                  void run(() => api(`/api/jobs/${job.id}/status`, { body: { status: s.key } }), `הסטטוס עודכן ל"${s.label}"`);
                }}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </Card>

        <Card title="📱 קישורי צפייה">
          <ShareLinkPanel jobId={job.id} links={job.shareLinks} onChange={() => void load()} disabled={job.is_terminal ? 'העבודה סגורה' : !job.consent_streaming_at ? 'נדרשת הסכמת לקוח לשידור' : undefined} />
        </Card>

        <Card title="הסכמת לקוח">
          <div className="space-y-2 text-sm">
            <div>שידור: {job.consent_streaming_at ? `✓ ${fmtDateTime(job.consent_streaming_at)}` : '✗ לא ניתנה'}</div>
            <div>צילום/הקלטה: {job.consent_recording_at ? `✓ ${fmtDateTime(job.consent_recording_at)}` : '✗ לא ניתנה'}</div>
            <Field label="אופן ההסכמה">
              <Input value={consentMethod} onChange={(e) => setConsentMethod(e.target.value)} placeholder="לדוגמה: חתימה על טופס" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="success" disabled={consentMethod.trim().length < 2} onClick={() => run(() => api(`/api/jobs/${job.id}/consent`, { body: { streaming: true, recording: true, method: consentMethod } }), 'ההסכמה תועדה')}>
                תעד הסכמה מלאה
              </Button>
              <Button size="sm" variant="danger" disabled={consentMethod.trim().length < 2} onClick={() => run(() => api(`/api/jobs/${job.id}/consent`, { body: { streaming: false, recording: false, method: `ביטול: ${consentMethod}` } }), 'ההסכמה בוטלה, השידור נעצר והקישורים בוטלו')}>
                ביטול הסכמה
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function StatusSelect({ statuses, value, onChange }: { statuses: JobStatus[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {statuses.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label}
        </option>
      ))}
    </Select>
  );
}
