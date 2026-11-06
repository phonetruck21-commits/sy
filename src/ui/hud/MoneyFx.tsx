import { useEffect, useRef, useState } from 'react';
import { usePickupFx } from '../../game/race/pickups';
import { useProfile } from '../../store/profileStore';

/** Big rolling coin counter that pops up whenever money is collected. */
export function MoneyFx() {
  const key = usePickupFx((s) => s.key);
  const last = usePickupFx((s) => s.last);
  const stash = usePickupFx((s) => s.stash);
  const coins = useProfile((s) => s.coins);
  const [shown, setShown] = useState(coins);
  const [visible, setVisible] = useState(false);
  const raf = useRef(0);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!key) return;
    setVisible(true);
    const from = coins - last;
    const start = performance.now();
    const dur = stash ? 1600 : 500;
    cancelAnimationFrame(raf.current);
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      setShown(Math.round(from + last * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    if (hideT.current) clearTimeout(hideT.current);
    hideT.current = setTimeout(() => setVisible(false), stash ? 4500 : 2200);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!visible) return null;
  return (
    <div className="absolute top-[22%] inset-x-0 flex flex-col items-center pointer-events-none" dir="ltr" data-testid="money-fx">
      {stash && <div className="text-2xl md:text-4xl font-black text-yellow-300 neon-text animate-pop mb-1" dir="rtl">💰 מצאת את המטמון הסודי!</div>}
      <div key={`t${key}`} className="font-black tabular-nums text-white text-5xl md:text-7xl" style={{ WebkitTextStroke: '2px #000', textShadow: '0 4px 0 #000, 0 0 24px rgba(255,204,51,0.6)' }}>
        🪙 {shown.toLocaleString('en-US')}
      </div>
      <div key={`g${key}`} className="font-black tabular-nums text-emerald-400 text-3xl md:text-5xl animate-pop" style={{ WebkitTextStroke: '1.5px #000', textShadow: '0 3px 0 #000' }}>
        +{last.toLocaleString('en-US')}
      </div>
    </div>
  );
}
