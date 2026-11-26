import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ROLE_LABEL } from '../lib/format';
import { Badge, Button, Card, ErrorText, Field, Input } from '../components/ui';

interface Summary {
  range: { from: string; to: string };
  totals: { jobs_created: number; jobs_closed: number; avg_work_minutes: number; streams: number; stream_minutes: number; link_opens: number };
  technicians: { id: string; full_name: string; role: string; is_active: boolean; jobs_closed: number; work_minutes: number; open_jobs: number; streams: number; stream_minutes: number; photos: number; videos: number }[];
  statuses: { key: string; label: string; is_terminal: boolean; jobs: number }[];
  daily: { day: string; created: number; closed: number }[];
  storage: { kind: string; files: number; mb: number }[];
}

const isoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} ש'` : `${m} ד'`);

const PRESETS = [
  { label: 'היום', days: 0 },
  { label: '7 ימים', days: 6 },
  { label: '30 ימים', days: 29 },
  { label: '90 ימים', days: 89 },
];

export default function Reports() {
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 29 * 86400_000)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api<Summary>(`/api/reports/summary?from=${from}&to=${to}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [from, to]);

  const maxDay = Math.max(1, ...(data?.daily.flatMap((d) => [d.created, d.closed]) ?? [1]));
  const tiles = data
    ? [
        { label: 'עבודות שנפתחו', value: data.totals.jobs_created },
        { label: 'עבודות שנסגרו', value: data.totals.jobs_closed },
        { label: 'זמן עבודה ממוצע', value: minutes(data.totals.avg_work_minutes) },
        { label: 'שידורים', value: data.totals.streams },
        { label: 'זמן שידור כולל', value: minutes(data.totals.stream_minutes) },
        { label: 'פתיחות קישורי צפייה', value: data.totals.link_opens },
      ]
    : [];

  return (
    <div className="space-y-4">
      <Card title="📊 דוחות פעילות">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="מתאריך">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="עד תאריך">
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <Button key={p.label} size="sm" variant="outline" onClick={() => (setFrom(isoDay(new Date(Date.now() - p.days * 86400_000))), setTo(isoDay(new Date())))}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        <ErrorText>{error}</ErrorText>
      </Card>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-2xl border border-line bg-panel p-4">
                <div className="text-xs font-semibold text-muted">{t.label}</div>
                <div className="mt-1 text-2xl font-black tabular-nums">{t.value}</div>
              </div>
            ))}
          </div>

          <Card title="👷 לפי טכנאי">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-line text-muted">
                    {['שם', 'תפקיד', 'נסגרו', 'זמן עבודה', 'ממוצע לעבודה', 'פתוחות כעת', 'שידורים', 'זמן שידור', 'תמונות', 'סרטונים'].map((h) => (
                      <th key={h} className="p-2 text-start">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.technicians.map((t) => (
                    <tr key={t.id} className="border-b border-line/60">
                      <td className="p-2 font-semibold">
                        {t.full_name} {!t.is_active && <Badge>מושבת</Badge>}
                      </td>
                      <td className="p-2">{ROLE_LABEL[t.role]}</td>
                      <td className="p-2">{t.jobs_closed}</td>
                      <td className="p-2">{minutes(t.work_minutes)}</td>
                      <td className="p-2">{t.jobs_closed ? minutes(Math.round(t.work_minutes / t.jobs_closed)) : '—'}</td>
                      <td className="p-2">{t.open_jobs}</td>
                      <td className="p-2">{t.streams}</td>
                      <td className="p-2">{minutes(t.stream_minutes)}</td>
                      <td className="p-2">{t.photos}</td>
                      <td className="p-2">{t.videos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">זמן עבודה = מתחילת העבודה (שידור ראשון או שינוי סטטוס) ועד הסגירה, לעבודות שנסגרו בטווח. אין עדיין מנגנון השהיה.</p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card title="📅 עבודות לפי יום">
              <div className="flex h-40 items-end gap-[2px] overflow-x-auto" dir="ltr" role="img" aria-label="עבודות שנפתחו ונסגרו לפי יום">
                {data.daily.map((d) => (
                  <div key={d.day} className="flex h-full min-w-[6px] flex-1 items-end gap-[1px]" title={`${d.day}: נפתחו ${d.created}, נסגרו ${d.closed}`}>
                    <div className="flex-1 rounded-t bg-navy-600 dark:bg-navy-100" style={{ height: `${(d.created / maxDay) * 100}%` }} />
                    <div className="flex-1 rounded-t bg-accent" style={{ height: `${(d.closed / maxDay) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted" dir="ltr">
                <span>{data.range.from}</span>
                <span className="flex gap-3">
                  <span>
                    <span className="inline-block h-2 w-2 rounded-sm bg-navy-600 dark:bg-navy-100" /> נפתחו
                  </span>
                  <span>
                    <span className="inline-block h-2 w-2 rounded-sm bg-accent" /> נסגרו
                  </span>
                  <span>מקסימום ליום: {maxDay}</span>
                </span>
                <span>{data.range.to}</span>
              </div>
            </Card>
            <div className="space-y-4">
              <Card title="מצב עבודות כעת">
                <ul className="space-y-1 text-sm">
                  {data.statuses.map((s) => (
                    <li key={s.key} className="flex justify-between">
                      <span>{s.label}</span>
                      <b className="tabular-nums">{s.jobs}</b>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="אחסון בשרת">
                <ul className="space-y-1 text-sm">
                  {data.storage.map((s) => (
                    <li key={s.kind} className="flex justify-between">
                      <span>{s.kind === 'photo' ? '📷 תמונות' : '🎥 סרטונים'} ({s.files})</span>
                      <b className="tabular-nums">{s.mb} MB</b>
                    </li>
                  ))}
                  {!data.storage.length && <li className="text-muted">אין קבצים</li>}
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
