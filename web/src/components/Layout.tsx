import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSession, useTheme } from '../session';
import { ROLE_LABEL } from '../lib/format';
import { DemoBadge, StatusDot } from './ui';

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className={small ? 'h-8 w-8' : 'h-10 w-10'} />
      <div className="leading-tight" dir="ltr">
        <div className={small ? 'text-base font-black tracking-wide' : 'text-xl font-black tracking-wide'}>
          S.Y <span className="text-accent">LIVE</span> SERVICE
        </div>
        {!small && <div className="text-[11px] text-white/70">Smart Service Monitoring</div>}
      </div>
    </div>
  );
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function ThemeToggle() {
  const [dark, toggle] = useTheme();
  return (
    <button onClick={toggle} className="rounded-lg px-2 py-1.5 text-sm text-white/85 hover:bg-white/10" title="מצב כהה/בהיר">
      {dark ? '☀️ בהיר' : '🌙 כהה'}
    </button>
  );
}

const NAV: { to: string; label: string; roles?: string[] }[] = [
  { to: '/tech', label: '🎥 עמדת טכנאי' },
  { to: '/jobs', label: '🔧 עבודות' },
  { to: '/reports', label: '📊 דוחות', roles: ['owner', 'admin'] },
  { to: '/admin', label: '⚙️ ניהול', roles: ['owner', 'admin'] },
];

export function AppLayout({ children }: { children?: ReactNode }) {
  const { me, logout } = useSession();
  const online = useOnline();
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 bg-navy-800 text-white shadow-md dark:bg-black">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5">
          <Logo small />
          <nav className="flex flex-wrap gap-1 ms-2">
            {NAV.filter((n) => !n.roles || (me && n.roles.includes(me.user.role))).map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-accent text-navy-900' : 'text-white/85 hover:bg-white/10'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5" title={online ? 'מחובר לרשת' : 'אין רשת – עבודה מקומית'}>
              <StatusDot tone={online ? 'ok' : 'warn'} />
              {online ? 'מחובר' : 'לא מקוון'}
            </span>
            {me && (
              <span className="hidden text-white/80 md:inline">
                {me.user.fullName} · {ROLE_LABEL[me.user.role]} · {me.tenant.name} <DemoBadge show={me.tenant.isDemo} />
              </span>
            )}
            <ThemeToggle />
            <button onClick={() => void logout()} className="rounded-lg px-2 py-1.5 text-white/85 hover:bg-white/10">
              יציאה
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 p-3 md:p-5">{children ?? <Outlet />}</main>
    </div>
  );
}
