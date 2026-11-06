import { useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProfile } from '../../store/profileStore';
import { MAX_UPGRADE, TRUCK_LIST, TRUCKS, UPGRADE_INFO, applyUpgrades, upgradeCost } from '../../data/trucks';
import { TruckPreview } from '../../game/truck/TruckPreview';
import { audio } from '../../game/audio/audio';
import { Button, Panel, ScreenFrame, StatBar } from '../components/UI';
import type { TruckId, UpgradeKey } from '../../types';

export function GarageScreen() {
  const go = useGame((s) => s.go);
  const selected = useProfile((s) => s.selectedTruck);
  const selectTruck = useProfile((s) => s.selectTruck);
  const achievements = useProfile((s) => s.achievements);
  const owned = useProfile((s) => s.ownedTrucks ?? []);
  const buyTruck = useProfile((s) => s.buyTruck);
  const isOpen = (id: TruckId) => !TRUCKS[id].unlock.achievement || achievements.includes(TRUCKS[id].unlock.achievement!) || owned.includes(id);
  const upgrades = useProfile((s) => s.upgrades);
  const coins = useProfile((s) => s.coins);
  const buyUpgrade = useProfile((s) => s.buyUpgrade);
  const design = useProfile((s) => s.designs.find((d) => d.id === s.activeDesignId) ?? s.designs[0]);
  const [viewing, setViewing] = useState<TruckId>(selected);

  const def = TRUCKS[viewing];
  const unlocked = isOpen(viewing);
  const up = upgrades[viewing];
  const st = applyUpgrades(def.stats, up);

  return (
    <ScreenFrame title="המוסך שלי" icon="🚚" right={<Button size="sm" onClick={() => go('design')}>🎨 עיצוב</Button>}>
      <div className="grid lg:grid-cols-[1fr_420px] gap-4 h-full">
        <div className="relative rounded-2xl overflow-hidden glass min-h-[300px] lg:min-h-0">
          <TruckPreview design={design} model={def.model} autoRotate />
          <div className="absolute top-3 right-3 left-3 flex justify-between pointer-events-none">
            <div>
              <div className="text-2xl font-black neon-text">{def.nameHe}</div>
              <div className="text-sm text-sky-300" dir="ltr">{def.name}</div>
            </div>
            {!unlocked && <div className="bg-black/70 rounded-xl px-3 py-2 text-amber-300 font-bold">🔒 {def.unlock.textHe}</div>}
          </div>
          <div className="absolute bottom-3 inset-x-3 text-sm text-slate-200 bg-black/40 rounded-xl p-2 pointer-events-none">{def.description}</div>
        </div>

        <div className="flex flex-col gap-3">
          <Panel className="p-3">
            <h3 className="font-bold mb-2 text-sky-200">המשאיות שלי</h3>
            <div className="grid grid-cols-3 gap-2">
              {TRUCK_LIST.map((t) => {
                const un = isOpen(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => { audio.click(); setViewing(t.id); }}
                    className={`rounded-xl p-2 text-center border transition ${viewing === t.id ? 'border-cyan-300 bg-sky-900/50' : 'border-white/10 bg-slate-900/50 hover:border-sky-400/50'}`}
                  >
                    <div className="text-3xl">{un ? '🚚' : '🔒'}</div>
                    <div className="text-xs font-bold leading-tight mt-1">{t.nameHe}</div>
                    {selected === t.id && <div className="text-[10px] text-emerald-300 mt-0.5">✓ בשימוש</div>}
                  </button>
                );
              })}
            </div>
            {unlocked ? (
              <Button variant="neon" className="w-full mt-3" disabled={selected === viewing} onClick={() => selectTruck(viewing)}>
                {selected === viewing ? '✓ המשאית הנבחרת' : 'בחר משאית זו'}
              </Button>
            ) : (
              <div className="mt-3 flex flex-col gap-1.5">
                <Button variant="neon" className="w-full" data-testid="buy-truck" disabled={coins < def.unlock.price} onClick={() => { if (buyTruck(viewing)) audio.coin(); }}>
                  🔓 קנה ב־<span dir="ltr">🪙 {def.unlock.price.toLocaleString()}</span>
                </Button>
                <div className="text-xs text-center text-slate-300">
                  {coins < def.unlock.price ? `חסרים לך 🪙 ${(def.unlock.price - coins).toLocaleString()} · ` : ''}או בחינם: {def.unlock.textHe}
                </div>
              </div>
            )}
          </Panel>

          <Panel className="p-3 flex flex-col gap-2">
            <h3 className="font-bold text-sky-200">ביצועים</h3>
            <StatBar label={`מהירות מרבית · ${Math.round(st.maxSpeed * 3.6)} קמ"ש`} value={def.stats.maxSpeed - 25} extra={st.maxSpeed - def.stats.maxSpeed} max={20} />
            <StatBar label="תאוצה" value={def.stats.accel - 5} extra={st.accel - def.stats.accel} max={12} />
            <StatBar label="היגוי" value={def.stats.handling - 1} extra={st.handling - def.stats.handling} max={1.1} />
            <StatBar label={`ניטרו · ${st.nitroCapacity.toFixed(1)} שנ׳`} value={def.stats.nitroCapacity} extra={st.nitroCapacity - def.stats.nitroCapacity} max={10} />
            <StatBar label="שטח / אופרוד" value={def.stats.offroad} max={1} />
          </Panel>

          <Panel className="p-3">
            <h3 className="font-bold mb-2 text-sky-200">שדרוגים · {def.nameHe}</h3>
            {!unlocked && (
              <div className="mb-2 rounded-xl bg-amber-500/15 border border-amber-400/50 p-2 text-sm" data-testid="locked-note">
                🔒 אי אפשר לשדרג משאית נעולה. קנה אותה למעלה, או שדרג את המשאית שלך —{' '}
                <button className="underline font-bold text-amber-200" onClick={() => setViewing(selected)}>{TRUCKS[selected].nameHe}</button>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {(Object.keys(UPGRADE_INFO) as UpgradeKey[]).map((k) => {
                const lvl = up[k];
                const cost = upgradeCost(lvl);
                const maxed = lvl >= MAX_UPGRADE;
                return (
                  <div key={k} className="flex items-center gap-2 bg-slate-900/50 rounded-xl p-2">
                    <span className="text-2xl">{UPGRADE_INFO[k].icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm">{UPGRADE_INFO[k].nameHe}</div>
                      <div className="flex gap-1 mt-1" dir="ltr">
                        {Array.from({ length: MAX_UPGRADE }).map((_, i) => (
                          <span key={i} className={`h-1.5 flex-1 rounded ${i < lvl ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                        ))}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{UPGRADE_INFO[k].desc}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="neon"
                      disabled={!unlocked || maxed || coins < cost}
                      data-testid={`upgrade-${k}`}
                      onClick={() => { if (buyUpgrade(viewing, k)) audio.coin(); }}
                    >
                      {!unlocked ? '🔒' : maxed ? 'מקס׳' : <span dir="ltr">🪙 {cost}</span>}
                    </Button>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </ScreenFrame>
  );
}
