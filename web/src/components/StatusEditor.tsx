import { useEffect, useState } from 'react';
import { api, type JobStatus } from '../lib/api';
import { Button, ErrorText, Input } from './ui';

interface Row {
  key: string;
  label: string;
  isTerminal: boolean;
  isNew?: boolean;
}

/** Rename, reorder and add workflow statuses. Existing statuses are never deleted (jobs may use them). */
export function StatusEditor({ statuses, onSaved }: { statuses: JobStatus[]; onSaved: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => setRows(statuses.map((s) => ({ key: s.key, label: s.label, isTerminal: s.is_terminal }))), [statuses]);

  const update = (i: number, patch: Partial<Row>) => {
    setSaved(false);
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setSaved(false);
    setRows(next);
  };

  async function save() {
    setError('');
    if (rows.some((r) => !r.label.trim())) return setError('לכל סטטוס צריך שם');
    if (!rows.some((r) => r.isTerminal)) return setError('נדרש לפחות סטטוס אחד שסוגר עבודה');
    try {
      await api('/api/job-statuses', { method: 'PUT', body: rows.map((r, i) => ({ key: r.key, label: r.label.trim(), sortOrder: (i + 1) * 10, isTerminal: r.isTerminal })) });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-1">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-1.5">
            <span className="w-5 text-center text-xs text-muted tabular-nums">{i + 1}</span>
            <Input aria-label={`שם הסטטוס ${i + 1}`} value={r.label} maxLength={60} onChange={(e) => update(i, { label: e.target.value })} className="!py-1.5" />
            <label className="flex shrink-0 items-center gap-1 text-xs" title="סטטוס שסוגר את העבודה, עוצר שידור ומבטל קישורים">
              <input type="checkbox" className="h-4 w-4 accent-amber-400" checked={r.isTerminal} onChange={(e) => update(i, { isTerminal: e.target.checked })} />
              סוגר
            </label>
            <Button size="sm" variant="ghost" className="!px-2" onClick={() => move(i, -1)} disabled={i === 0} aria-label="הזז למעלה">
              ▲
            </Button>
            <Button size="sm" variant="ghost" className="!px-2" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="הזז למטה">
              ▼
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={rows.length >= 30} onClick={() => (setSaved(false), setRows([...rows, { key: `custom_${Date.now().toString(36)}`, label: '', isTerminal: false, isNew: true }]))}>
          + סטטוס חדש
        </Button>
        <Button size="sm" onClick={save}>
          {saved ? '✓ נשמר' : 'שמור סטטוסים'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <p className="text-xs text-muted">הסטטוס הראשון ניתן לכל עבודה חדשה. אי אפשר למחוק סטטוס קיים, כי ייתכן שיש עבודות שמשתמשות בו – אפשר לשנות לו שם או להזיז אותו.</p>
    </div>
  );
}
