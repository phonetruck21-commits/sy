import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, type JobDetail } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { Badge, Button, ErrorText, Field, Input, Select } from './ui';

const EXPIRY = [
  { m: 60, label: 'שעה' },
  { m: 240, label: '4 שעות' },
  { m: 1440, label: 'יום' },
  { m: 4320, label: '3 ימים' },
];

/** Creates a personal, expiring, revocable viewing link (+ optional PIN) and shows it as a QR code. */
export function ShareLinkPanel({ jobId, links, onChange, disabled }: { jobId: string; links: JobDetail['shareLinks']; onChange: () => void; disabled?: string }) {
  const [expires, setExpires] = useState(240);
  const [pin, setPin] = useState('');
  const [maxViewers, setMaxViewers] = useState(3);
  const [created, setCreated] = useState<{ url: string; hasPin: boolean } | null>(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCreated(null);
  }, [jobId]);

  useEffect(() => {
    if (!created) return setQr('');
    QRCode.toDataURL(created.url, { margin: 1, width: 220, color: { dark: '#0A1F44', light: '#ffffff' } }).then(setQr).catch(() => setQr(''));
  }, [created]);

  async function create() {
    setError('');
    try {
      const r = await api<{ url: string; hasPin: boolean }>(`/api/jobs/${jobId}/share-links`, { body: { expiresInMinutes: expires, pin: pin || null, maxViewers } });
      setCreated(r);
      setCopied(false);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function revoke(id: string) {
    await api(`/api/share-links/${id}/revoke`, { method: 'POST' }).catch((e) => setError(e.message));
    onChange();
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      setError('ההעתקה נחסמה – העתיקו ידנית');
    }
  }

  const active = links.filter((l) => !l.revoked_at && new Date(l.expires_at) > new Date());

  return (
    <div className="space-y-3">
      {disabled ? (
        <p className="text-sm text-muted">{disabled}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Field label="תוקף">
              <Select value={expires} onChange={(e) => setExpires(Number(e.target.value))}>
                {EXPIRY.map((x) => (
                  <option key={x.m} value={x.m}>
                    {x.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="קוד אימות">
              <Input dir="ltr" inputMode="numeric" placeholder="לא חובה" value={pin} maxLength={8} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="צופים">
              <Select value={maxViewers} onChange={(e) => setMaxViewers(Number(e.target.value))}>
                {[1, 2, 3, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button variant="accent" className="w-full" onClick={create} data-testid="create-link">
            🔗 צור קישור צפייה ללקוח
          </Button>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      {created && (
        <div className="space-y-2 rounded-xl border border-accent bg-accent/10 p-3 text-center">
          {qr && <img src={qr} alt="QR לקישור הצפייה" className="mx-auto rounded-lg" />}
          <div className="break-all rounded-lg bg-panel p-2 text-xs" dir="ltr" data-testid="share-url">
            {created.url}
          </div>
          <div className="flex justify-center gap-2">
            <Button size="sm" onClick={copy}>
              {copied ? '✓ הועתק' : 'העתק קישור'}
            </Button>
          </div>
          <p className="text-xs text-muted">הקישור מוצג פעם אחת בלבד. {created.hasPin && 'מסרו ללקוח גם את קוד האימות בנפרד.'}</p>
        </div>
      )}
      {active.length > 0 && (
        <ul className="space-y-1 text-sm">
          {active.map((l) => (
            <li key={l.id} className="flex items-center justify-between rounded-lg border border-line px-2 py-1.5">
              <span>
                <Badge tone="ok">פעיל</Badge> עד {fmtDateTime(l.expires_at)} {l.has_pin && '🔒'} · נפתח {l.use_count}×
              </span>
              <Button size="sm" variant="ghost" onClick={() => revoke(l.id)}>
                בטל
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
