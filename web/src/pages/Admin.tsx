import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type JobStatus } from '../lib/api';
import { useSession } from '../session';
import { ROLE_LABEL, fmtBytes, fmtDateTime, fmtDuration } from '../lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Select } from '../components/ui';
import { StatusEditor } from '../components/StatusEditor';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
}
interface Usage {
  plan: { name: string; max_users: number; max_cameras: number; storage_quota_mb: number; max_concurrent_streams: number; max_viewers_per_stream: number };
  storageMb: number;
  users: number;
  cameras: number;
  activeStreams: number;
  warnings: Record<string, boolean>;
}
interface ActiveStream {
  id: string;
  job_id: string;
  job_number: number;
  device_type: string;
  started_at: string;
  started_by_name: string;
  live: boolean;
  viewers: number;
  bytesReceived: number;
}
interface Camera {
  id: string;
  label: string;
  workstation: string | null;
  last_seen_at: string | null;
}
interface AuditRow {
  id: number;
  actor: string;
  action: string;
  user_name: string | null;
  ip: string | null;
  created_at: string;
}

function Meter({ label, used, max, unit = '' }: { label: string; used: number; max: number; unit?: string }) {
  const pct = Math.min(100, (used / Math.max(1, max)) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono">
          {used}
          {unit} / {max}
          {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-line">
        <div className={`h-2 rounded-full ${pct >= 80 ? 'bg-live' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Admin() {
  const { me, refresh } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [streams, setStreams] = useState<ActiveStream[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [statuses, setStatuses] = useState<JobStatus[]>([]);
  const [nu, setNu] = useState({ fullName: '', email: '', password: '', role: 'technician' });
  const [retention, setRetention] = useState(me?.tenant.retentionDays ?? 30);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [u, us, st, c, a, s] = await Promise.all([
      api<User[]>('/api/users'),
      api<Usage>('/api/usage'),
      api<ActiveStream[]>('/api/streams/active'),
      api<Camera[]>('/api/cameras'),
      api<AuditRow[]>('/api/audit-log?limit=50'),
      api<JobStatus[]>('/api/job-statuses'),
    ]);
    setUsers(u);
    setUsage(us);
    setStreams(st);
    setCameras(c);
    setAudit(a);
    setStatuses(s);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const t = setInterval(() => api<ActiveStream[]>('/api/streams/active').then(setStreams).catch(() => undefined), 5000);
    return () => clearInterval(t);
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError('');
    setMsg('');
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  function addUser(e: FormEvent) {
    e.preventDefault();
    void run(() => api('/api/users', { body: nu }), 'המשתמש נוסף').then(() => setNu({ fullName: '', email: '', password: '', role: 'technician' }));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        {msg && <p className="mb-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold">{msg}</p>}
        <ErrorText>{error}</ErrorText>
      </div>

      <Card title="📡 שידורים פעילים">
        {streams.length ? (
          <ul className="space-y-2 text-sm">
            {streams.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl border border-line p-2">
                <span>
                  <b>#{s.job_number}</b> · {s.device_type} · {s.started_by_name}
                </span>
                <span className="flex items-center gap-2">
                  {s.live ? <Badge tone="live">LIVE</Badge> : <Badge tone="warn">ממתין לחיבור</Badge>}
                  <span>👁 {s.viewers}</span>
                  <span className="font-mono text-muted">{fmtDuration((Date.now() - new Date(s.started_at).getTime()) / 1000)}</span>
                  <span className="text-muted">{fmtBytes(s.bytesReceived)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">אין שידורים פעילים</p>
        )}
      </Card>

      <Card title={`📦 חבילה: ${usage?.plan.name ?? ''}`}>
        {usage && (
          <div className="space-y-3">
            <Meter label="משתמשים" used={usage.users} max={usage.plan.max_users} />
            <Meter label="מצלמות" used={usage.cameras} max={usage.plan.max_cameras} />
            <Meter label="אחסון" used={usage.storageMb} max={usage.plan.storage_quota_mb} unit="MB" />
            <Meter label="שידורים מקבילים" used={usage.activeStreams} max={usage.plan.max_concurrent_streams} />
            <p className="text-xs text-muted">צופים מרביים לשידור: {usage.plan.max_viewers_per_stream}. ניהול חיובים אמיתי אינו פעיל בשלב זה.</p>
          </div>
        )}
      </Card>

      <Card title="👥 טכנאים ומשתמשים">
        <table className="mb-4 w-full text-sm">
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line/60">
                <td className="py-1.5">{u.full_name}</td>
                <td className="py-1.5 text-muted" dir="ltr">
                  {u.email}
                </td>
                <td className="py-1.5">{ROLE_LABEL[u.role]}</td>
                <td className="py-1.5">{u.is_active ? <Badge tone="ok">פעיל</Badge> : <Badge>מושבת</Badge>}</td>
                <td className="py-1.5 text-end">
                  {u.role !== 'owner' && u.id !== me?.user.id && (
                    <Button size="sm" variant="ghost" onClick={() => run(() => api(`/api/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.is_active } }), 'עודכן')}>
                      {u.is_active ? 'השבת' : 'הפעל'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addUser} className="grid grid-cols-2 gap-2">
          <Input placeholder="שם מלא" value={nu.fullName} onChange={(e) => setNu({ ...nu, fullName: e.target.value })} required />
          <Input placeholder='דוא"ל' dir="ltr" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} required />
          <Input placeholder="סיסמה ראשונית (10+ תווים)" dir="ltr" type="password" value={nu.password} minLength={10} onChange={(e) => setNu({ ...nu, password: e.target.value })} required />
          <Select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
            <option value="technician">טכנאי</option>
            {me?.user.role === 'owner' && <option value="admin">מנהל</option>}
          </Select>
          <Button type="submit" className="col-span-2">
            + הוסף משתמש
          </Button>
        </form>
      </Card>

      <Card title="🎥 מצלמות ועמדות">
        {cameras.length ? (
          <ul className="space-y-1 text-sm">
            {cameras.map((c) => (
              <li key={c.id} className="flex justify-between border-b border-line/60 py-1">
                <span>{c.label}</span>
                <span className="text-muted">
                  {c.workstation} · נראתה {fmtDateTime(c.last_seen_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">מצלמות נרשמות אוטומטית כשעמדת טכנאי מזהה אותן.</p>
        )}
      </Card>

      <Card title="⚙️ הגדרות עסק ופרטיות">
        <div className="space-y-3">
          <Field label="ימי שמירת תמונות והקלטות בשרת" hint="קבצים ישנים יותר נמחקים אוטומטית (בדיקה כל שעה)">
            <Input type="number" min={1} max={3650} value={retention} onChange={(e) => setRetention(Number(e.target.value))} />
          </Field>
          <Button onClick={() => run(() => api('/api/tenant', { method: 'PATCH', body: { retentionDays: retention } }).then(refresh), 'מדיניות השמירה עודכנה')}>שמור</Button>
          <div className="pt-2">
            <div className="mb-1 text-sm font-semibold text-muted">סטטוסי עבודה</div>
            <StatusEditor statuses={statuses} onSaved={() => void load()} />
          </div>
        </div>
      </Card>

      <Card title="📜 יומן פעולות (50 אחרונות)">
        <ul className="max-h-72 space-y-0.5 overflow-y-auto font-mono text-xs">
          {audit.map((a) => (
            <li key={a.id}>
              {fmtDateTime(a.created_at)} · {a.action} · {a.user_name ?? a.actor} {a.ip && <span className="text-muted">({a.ip})</span>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
