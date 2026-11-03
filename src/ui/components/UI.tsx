import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { audio } from '../../game/audio/audio';
import { useProfile } from '../../store/profileStore';
import { useGame } from '../../store/gameStore';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'neon' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' };

export function Button({ variant = 'ghost', size = 'md', className = '', onClick, children, ...rest }: BtnProps) {
  const sizes = { sm: 'px-3 py-1.5 text-sm rounded-lg', md: 'px-5 py-2.5 text-base rounded-xl', lg: 'px-6 py-4 text-xl rounded-2xl' };
  const variants = {
    neon: 'btn-neon text-white font-bold',
    ghost: 'btn-ghost text-white font-semibold',
    danger: 'bg-red-700/80 border border-red-400/60 text-white font-semibold hover:bg-red-600',
  };
  return (
    <button
      {...rest}
      className={`${sizes[size]} ${variants[variant]} transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${className}`}
      onClick={(e) => {
        audio.unlock();
        audio.click();
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-2xl ${className}`}>{children}</div>;
}

export function Coins({ className = '' }: { className?: string }) {
  const coins = useProfile((s) => s.coins);
  return (
    <div className={`glass rounded-full px-4 py-1.5 font-bold flex items-center gap-2 ${className}`} title="מטבעות">
      <span className="text-yellow-300">🪙</span>
      <span dir="ltr">{coins.toLocaleString()}</span>
    </div>
  );
}

/** Standard screen frame with title + back button. */
export function ScreenFrame({ title, icon, children, right }: { title: string; icon: string; children: ReactNode; right?: ReactNode }) {
  const go = useGame((s) => s.go);
  return (
    <div className="absolute inset-0 flex flex-col speed-lines" style={{ background: 'radial-gradient(ellipse at top, #0d2450 0%, #050b18 65%)' }}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button size="sm" onClick={() => go('home')} aria-label="חזרה לתפריט">→ חזרה</Button>
          <h1 className="text-xl md:text-3xl font-black truncate neon-text">{icon} {title}</h1>
        </div>
        <div className="flex items-center gap-2">{right}<Coins /></div>
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 md:px-8">{children}</main>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => { audio.unlock(); audio.click(); onChange(!checked); }}
        className={`w-12 h-7 rounded-full relative transition ${checked ? 'bg-sky-500' : 'bg-slate-600'}`}
      >
        <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ${checked ? 'right-0.5' : 'right-[1.375rem]'}`} />
      </button>
    </label>
  );
}

export function StatBar({ label, value, max, extra }: { label: string; value: number; max: number; extra?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const extraPct = extra ? Math.min(100 - pct, (extra / max) * 100) : 0;
  return (
    <div className="text-sm">
      <div className="flex justify-between mb-1"><span className="text-sky-200">{label}</span></div>
      <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden flex" dir="ltr">
        <div className="h-full bg-gradient-to-r from-sky-500 to-cyan-300" style={{ width: `${pct}%` }} />
        {extraPct > 0 && <div className="h-full bg-emerald-400" style={{ width: `${extraPct}%` }} />}
      </div>
    </div>
  );
}
