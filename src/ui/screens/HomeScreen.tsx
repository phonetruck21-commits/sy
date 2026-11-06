import { useGame } from '../../store/gameStore';
import { useProfile } from '../../store/profileStore';
import { TRUCKS } from '../../data/trucks';
import { TruckPreview } from '../../game/truck/TruckPreview';
import { Button, Coins } from '../components/UI';
import { AccountBadge } from '../components/AccountBadge';

const MENU = [
  { id: 'race-setup', icon: '🏁', label: 'התחל מירוץ', primary: true },
  { id: 'garage', icon: '🚚', label: 'המוסך שלי' },
  { id: 'design', icon: '🎨', label: 'עיצוב המשאית' },
  { id: 'championship', icon: '🏆', label: 'אליפות המשאיות' },
  { id: 'online', icon: '🌐', label: 'אונליין עם חברים' },
  { id: 'club', icon: '🏅', label: 'מועדון חברים וטורנירים' },
  { id: 'settings', icon: '⚙️', label: 'הגדרות' },
] as const;

export function HomeScreen() {
  const go = useGame((s) => s.go);
  const design = useProfile((s) => s.designs.find((d) => d.id === s.activeDesignId) ?? s.designs[0]);
  const truckId = useProfile((s) => s.selectedTruck);
  const stats = useProfile((s) => s.stats);
  const name = useProfile((s) => s.playerName);
  const champ = useProfile((s) => s.championship);

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'radial-gradient(ellipse at 30% 40%, #12306a 0%, #050b18 70%)' }} data-testid="home-screen">
      <div className="absolute inset-0 speed-lines" />
      {/* 3D truck backdrop */}
      <div className="absolute inset-0 md:left-0 md:right-[34%] short:right-64 opacity-95">
        <TruckPreview design={design} model={TRUCKS[truckId].model} autoRotate interactive />
      </div>

      <div className="absolute top-3 left-3 right-3 flex justify-between items-start pointer-events-none">
        <div className="flex flex-col items-start gap-1.5 pointer-events-auto"><Coins /><AccountBadge /></div>
        <div className="pointer-events-auto text-left" dir="ltr">
          <div className="text-[10px] md:text-sm text-sky-300 tracking-[0.3em] font-bold">PHONE TRUCK PRESENTS</div>
          <h1 className="text-2xl md:text-5xl font-black leading-none neon-text italic short:text-2xl">
            TRUCK RACING<br /><span className="text-cyan-300">CHAMPIONSHIP</span>
          </h1>
          <div className="mt-1 text-sky-200 text-xs md:text-base short:hidden" dir="rtl">אליפות מירוצי המשאיות — S.Y פתרונות טכנולוגיים חכמים</div>
        </div>
      </div>

      <nav className="absolute bottom-0 inset-x-0 p-3 md:p-0 md:inset-y-0 md:left-auto md:right-8 md:w-[30%] md:max-w-sm flex flex-col justify-end md:justify-center gap-2.5 md:gap-3 short:gap-1 short:inset-y-0 short:left-auto short:right-3 short:w-64 short:p-0 short:pt-14 short:pb-2 short:justify-center">
        <div className="glass rounded-2xl px-4 py-2 text-sm flex justify-between items-center mb-1 short:hidden">
          <span>👤 {name}</span>
          <span className="text-sky-300">🏁 {stats.races} · 🥇 {stats.wins} · 🏆 {stats.championships}</span>
        </div>
        {MENU.map((m, i) => (
          <Button
            key={m.id}
            variant={'primary' in m ? 'neon' : 'ghost'}
            size="lg"
            className={`w-full flex items-center justify-between animate-in short:py-1.5 short:text-sm ${'primary' in m ? 'animate-glow' : ''}`}
            style={{ animationDelay: `${i * 70}ms` }}
            onClick={() => go(m.id)}
            data-testid={`menu-${m.id}`}
          >
            <span className="flex items-center gap-3"><span className="text-2xl">{m.icon}</span>{m.label}</span>
            {m.id === 'championship' && champ && !champ.finished && <span className="text-xs bg-amber-500 text-black rounded-full px-2 py-0.5">בתהליך</span>}
            <span className="opacity-60">‹</span>
          </Button>
        ))}
        <p className="text-center text-xs text-slate-400 mt-1 hidden md:block short:hidden">גרור כדי לסובב את המשאית · phonetruck.co.il · 052-546-6304</p>
      </nav>
    </div>
  );
}
