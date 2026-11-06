import type { ReactNode } from 'react';
import { touchInput, type DriveInput } from '../../game/input/input';

type Key = Exclude<keyof DriveInput, 'steer'>;

function Pad({ k, children, className = '', label }: { k: Key; children: ReactNode; className?: string; label: string }) {
  const set = (v: boolean) => (e: React.PointerEvent) => {
    e.preventDefault();
    touchInput[k] = v;
    if (v) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  return (
    <button
      aria-label={label}
      className={`pointer-events-auto touch-none select-none rounded-full glass flex items-center justify-center font-black active:scale-95 active:brightness-150 ${className}`}
      onPointerDown={set(true)}
      onPointerUp={set(false)}
      onPointerCancel={set(false)}
      onLostPointerCapture={() => (touchInput[k] = false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/** On-screen controls for phones / tablets (multi-touch: steer + gas simultaneously). */
export function TouchControls({ onRespawn }: { onRespawn: () => void }) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 pointer-events-none p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-between items-end"
      style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))' }}
      dir="ltr"
      data-testid="touch-controls"
    >
      <div className="flex gap-3">
        <Pad k="left" label="שמאלה" className="w-20 h-20 md:w-24 md:h-24 text-4xl">◀</Pad>
        <Pad k="right" label="ימינה" className="w-20 h-20 md:w-24 md:h-24 text-4xl">▶</Pad>
      </div>
      <div className="flex gap-3 items-end">
        <div className="flex flex-col gap-3 items-center">
          <button className="pointer-events-auto glass rounded-full w-12 h-12 text-xl" onClick={onRespawn} aria-label="חזרה למסלול">↺</button>
          <Pad k="brake" label="בלם" className="w-16 h-16 md:w-20 md:h-20 text-sm bg-red-900/60">בלם</Pad>
        </div>
        <div className="flex flex-col gap-3 items-center">
          <Pad k="nitro" label="ניטרו" className="w-16 h-16 md:w-20 md:h-20 text-2xl bg-orange-700/60">🔥</Pad>
          <Pad k="throttle" label="גז" className="w-24 h-24 md:w-28 md:h-28 text-xl bg-emerald-800/60">גז</Pad>
        </div>
      </div>
    </div>
  );
}
