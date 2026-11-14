import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { api, getServerUrl, setServerUrl } from '../lib/api';
import { isDesktop } from '../lib/desktop';
import { useSession } from '../session';
import { Button, ErrorText, Field, Input } from '../components/ui';
import { Logo, ThemeToggle } from '../components/Layout';

export default function Login() {
  const { me, login } = useSession();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [status, setStatus] = useState<{ needsSetup: boolean; signupAllowed: boolean } | null>(null);
  const [server, setServer] = useState(getServerUrl());
  const [form, setForm] = useState({ email: '', password: '', businessName: '', slug: '', fullName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const desktop = isDesktop();

  useEffect(() => {
    if (desktop && !getServerUrl()) return;
    api<{ needsSetup: boolean; signupAllowed: boolean }>('/api/auth/bootstrap-status', { token: null })
      .then((s) => {
        setStatus(s);
        if (s.needsSetup) setMode('signup');
      })
      .catch(() => setStatus(null));
  }, [desktop, server]);

  if (me) return <Navigate to="/tech" replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (desktop) setServerUrl(server);
      const res =
        mode === 'login'
          ? await api<{ token: string }>('/api/auth/login', { body: { email: form.email, password: form.password }, token: null })
          : await api<{ token: string }>('/api/auth/signup', { body: { ...form }, token: null });
      await login(res.token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-black p-4">
      <div className="absolute end-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center text-white">
          <Logo />
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-panel p-6 shadow-2xl">
          <h1 className="text-xl font-bold">{mode === 'login' ? 'כניסה למערכת' : status?.needsSetup ? 'הקמה ראשונית – פתיחת העסק' : 'פתיחת עסק חדש'}</h1>
          {desktop && (
            <Field label="כתובת השרת" hint="לדוגמה: https://live.my-business.co.il">
              <Input dir="ltr" value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://" required />
            </Field>
          )}
          {mode === 'signup' && (
            <>
              <Field label="שם העסק">
                <Input value={form.businessName} onChange={set('businessName')} required />
              </Field>
              <Field label="מזהה עסק (באנגלית)" hint="אותיות קטנות, ספרות ומקף">
                <Input dir="ltr" value={form.slug} onChange={set('slug')} pattern="[a-z0-9-]{3,40}" required />
              </Field>
              <Field label="שם מלא">
                <Input value={form.fullName} onChange={set('fullName')} required />
              </Field>
            </>
          )}
          <Field label='דוא"ל'>
            <Input dir="ltr" type="email" autoComplete="username" value={form.email} onChange={set('email')} required />
          </Field>
          <Field label="סיסמה" hint={mode === 'signup' ? 'לפחות 10 תווים' : undefined}>
            <Input dir="ltr" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} required minLength={mode === 'signup' ? 10 : 1} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="accent" size="lg" className="w-full" disabled={busy}>
            {busy ? 'רגע…' : mode === 'login' ? 'כניסה' : 'פתיחת העסק'}
          </Button>
          {status?.signupAllowed && !status.needsSetup && (
            <button type="button" className="w-full text-center text-sm text-muted underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? 'פתיחת עסק חדש' : 'יש לי חשבון – כניסה'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
