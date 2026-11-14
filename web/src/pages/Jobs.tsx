import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Job, type JobStatus } from '../lib/api';
import { fmtDateTime, fmtDuration, workSeconds } from '../lib/format';
import { Badge, Button, Card, DemoBadge, Select } from '../components/ui';
import { NewJobModal } from '../components/JobForm';

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [statuses, setStatuses] = useState<JobStatus[]>([]);
  const [filter, setFilter] = useState('open');
  const [error, setError] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api<JobStatus[]>('/api/job-statuses').then(setStatuses).catch(() => undefined);
  }, []);
  useEffect(() => {
    const q = filter === 'open' ? '?open=true' : filter === 'all' ? '' : filter === 'mine' ? '?mine=true&open=true' : `?status=${filter}`;
    api<Job[]>(`/api/jobs${q}`)
      .then(setJobs)
      .catch((e) => setError(e.message));
  }, [filter]);

  return (
    <Card
      title="🔧 עבודות שירות"
      actions={
        <>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-48 !py-1.5">
            <option value="open">פתוחות</option>
            <option value="mine">שלי (פתוחות)</option>
            <option value="all">הכל</option>
            {statuses.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="accent" onClick={() => setNewOpen(true)}>
            + עבודה חדשה
          </Button>
        </>
      }
    >
      {error && <p className="text-live">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-start text-muted">
              <th className="p-2 text-start">#</th>
              <th className="p-2 text-start">לקוח</th>
              <th className="p-2 text-start">מכשיר</th>
              <th className="p-2 text-start">תקלה</th>
              <th className="p-2 text-start">טכנאי</th>
              <th className="p-2 text-start">סטטוס</th>
              <th className="p-2 text-start">התקבל</th>
              <th className="p-2 text-start">זמן עבודה</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="cursor-pointer border-b border-line/60 hover:bg-line/30" onClick={() => nav(`/jobs/${j.id}`)}>
                <td className="p-2 font-bold">
                  <Link to={`/jobs/${j.id}`}>{j.job_number}</Link> <DemoBadge show={j.is_demo} />
                </td>
                <td className="p-2">{j.customer_name ?? '—'}</td>
                <td className="p-2">{j.device_type}</td>
                <td className="max-w-[260px] truncate p-2">{j.issue_description}</td>
                <td className="p-2">{j.technician_name ?? '—'}</td>
                <td className="p-2">
                  <Badge tone={j.is_terminal ? 'neutral' : 'info'}>{j.status_label}</Badge>
                </td>
                <td className="p-2">{fmtDateTime(j.received_at)}</td>
                <td className="p-2 font-mono">{j.started_at ? fmtDuration(workSeconds(j.started_at, j.closed_at)) : '—'}</td>
              </tr>
            ))}
            {!jobs.length && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted">
                  אין עבודות להצגה
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <NewJobModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(j) => {
          setNewOpen(false);
          nav(`/jobs/${j.id}`);
        }}
      />
    </Card>
  );
}
