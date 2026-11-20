import { useEffect, useState, type FormEvent } from 'react';
import { api, type Customer, type Job } from '../lib/api';
import { Button, DemoBadge, ErrorText, Field, Input, Modal, Textarea } from './ui';

/** Customer search + inline create. Used by "בחר לקוח" and the new-job form. */
export function CustomerPicker({ value, onChange }: { value: Customer | null; onChange: (c: Customer | null) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [creating, setCreating] = useState(false);
  const [nc, setNc] = useState({ fullName: '', phone: '', email: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api<Customer[]>(`/api/customers?q=${encodeURIComponent(q)}`).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function create() {
    setError('');
    try {
      const r = await api<{ id: string }>('/api/customers', { body: { fullName: nc.fullName, phone: nc.phone || null, email: nc.email || null } });
      onChange({ id: r.id, fullName: nc.fullName, phone: nc.phone, email: nc.email, isDemo: false });
      setCreating(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (value)
    return (
      <div className="flex items-center justify-between rounded-xl border border-accent/60 bg-accent/10 px-3 py-2">
        <div>
          <div className="font-bold">
            {value.fullName} <DemoBadge show={value.isDemo} />
          </div>
          <div className="text-sm text-muted" dir="ltr">
            {value.phone ?? ''}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          החלף
        </Button>
      </div>
    );

  if (creating)
    return (
      <div className="space-y-2 rounded-xl border border-line p-3">
        <Input placeholder="שם מלא" value={nc.fullName} onChange={(e) => setNc({ ...nc, fullName: e.target.value })} />
        <Input placeholder="טלפון" dir="ltr" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
        <Input placeholder='דוא"ל (לא חובה)' dir="ltr" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={create} disabled={nc.fullName.trim().length < 2}>
            שמור לקוח
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>
            ביטול
          </Button>
        </div>
      </div>
    );

  return (
    <div className="space-y-2">
      <Input placeholder="חיפוש לפי שם או מספר טלפון מלא" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-44 overflow-y-auto rounded-xl border border-line">
        {results.map((c) => (
          <button type="button" key={c.id} onClick={() => onChange(c)} className="flex w-full items-center justify-between border-b border-line px-3 py-2 text-start last:border-0 hover:bg-line/40">
            <span>
              {c.fullName} <DemoBadge show={c.isDemo} />
            </span>
            <span className="text-sm text-muted" dir="ltr">
              {c.phone}
            </span>
          </button>
        ))}
        {!results.length && <div className="px-3 py-2 text-sm text-muted">לא נמצאו לקוחות</div>}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
        + לקוח חדש
      </Button>
    </div>
  );
}

export function NewJobModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (job: Job) => void }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [f, setF] = useState({ deviceType: '', deviceDetails: '', issueDescription: '', consentStreaming: false, consentRecording: false, consentMethod: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const job = await api<Job>('/api/jobs', { body: { ...f, customerId: customer?.id ?? null, consentMethod: f.consentMethod || null } });
      onCreated(job);
      setF({ deviceType: '', deviceDetails: '', issueDescription: '', consentStreaming: false, consentRecording: false, consentMethod: '' });
      setCustomer(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🔧 פתיחת עבודה חדשה" wide>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field label="לקוח">
            <CustomerPicker value={customer} onChange={setCustomer} />
          </Field>
        </div>
        <Field label="סוג מכשיר / ציוד">
          <Input value={f.deviceType} onChange={(e) => setF({ ...f, deviceType: e.target.value })} placeholder="לדוגמה: iPhone 13 / מחשב נייד / רכב" required />
        </Field>
        <Field label="פרטי מכשיר (דגם, מספר סידורי)">
          <Input value={f.deviceDetails} onChange={(e) => setF({ ...f, deviceDetails: e.target.value })} />
        </Field>
        <div className="md:col-span-2">
          <Field label="תיאור התקלה">
            <Textarea value={f.issueDescription} onChange={(e) => setF({ ...f, issueDescription: e.target.value })} required />
          </Field>
        </div>
        <fieldset className="space-y-2 rounded-xl border border-accent/50 bg-accent/5 p-3 md:col-span-2">
          <legend className="px-1 text-sm font-bold">הסכמת הלקוח (חובה לפני צילום/שידור)</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-amber-400" checked={f.consentRecording} onChange={(e) => setF({ ...f, consentRecording: e.target.checked })} />
            הלקוח הסכים לצילום ולהקלטת העבודה
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-amber-400" checked={f.consentStreaming} onChange={(e) => setF({ ...f, consentStreaming: e.target.checked })} />
            הלקוח הסכים לשידור חי ולקבלת קישור צפייה
          </label>
          <Input placeholder="אופן ההסכמה (לדוגמה: חתימה על טופס קבלה / אישור בטלפון)" value={f.consentMethod} onChange={(e) => setF({ ...f, consentMethod: e.target.value })} />
        </fieldset>
        <div className="md:col-span-2">
          <ErrorText>{error}</ErrorText>
        </div>
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" variant="accent" disabled={busy}>
            {busy ? 'שומר…' : 'פתח עבודה'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            ביטול
          </Button>
        </div>
      </form>
    </Modal>
  );
}
