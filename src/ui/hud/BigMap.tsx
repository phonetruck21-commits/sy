import { useMemo } from 'react';
import type { TrackData } from '../../game/track/trackData';
import type { Pickup } from '../../game/race/pickups';
import { useProfile } from '../../store/profileStore';

/**
 * Full-screen GPS map: dark street map, crosshair on your truck and a purple
 * route along the track to the hidden treasure.
 */
export function BigMap({ track, me, pickups, onClose }: { track: TrackData; me: { x: number; z: number; idx: number } | null; pickups: Pickup[]; onClose: () => void }) {
  const stash = pickups.find((p) => p.kind === 'stash' && p.takenAt == null) ?? null;
  const available = useProfile((s) => s.stashAvailable(track.def.id));
  const b = track.bounds;
  const pad = 40;
  const view = `${b.minX - pad} ${b.minZ - pad} ${b.maxX - b.minX + pad * 2} ${b.maxZ - b.minZ + pad * 2}`;
  const roadPts = useMemo(() => track.points.filter((_, i) => i % 2 === 0).map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' '), [track]);

  // purple GPS route: from you, forward along the track, to the treasure
  let route = '';
  if (me && stash) {
    const n = track.count;
    const pts: string[] = [`${me.x.toFixed(1)},${me.z.toFixed(1)}`];
    let i = me.idx;
    for (let guard = 0; guard < n && i !== stash.idx; guard++) {
      i = (i + 1) % n;
      if (i % 2 === 0) pts.push(`${track.points[i].x.toFixed(1)},${track.points[i].z.toFixed(1)}`);
    }
    pts.push(`${stash.x.toFixed(1)},${stash.z.toFixed(1)}`);
    route = pts.join(' ');
  }
  const w = b.maxX - b.minX + pad * 2;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-3 pointer-events-auto" style={{ background: 'rgba(5,8,14,0.92)' }} onClick={onClose} data-testid="big-map">
      <div className="relative w-full h-full max-w-5xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-black text-xl">🗺️ מפה · {track.def.nameHe}</div>
          <button className="glass rounded-xl px-4 py-2 font-bold" onClick={onClose}>✕ סגור (M)</button>
        </div>
        <svg viewBox={view} className="flex-1 min-h-0 w-full rounded-2xl" style={{ background: '#1d2026' }}>
          {/* city-block texture */}
          <defs>
            <pattern id="blocks" width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="#24282f" />
              <rect x="4" y="4" width="32" height="32" fill="#2c3139" />
            </pattern>
          </defs>
          <rect x={b.minX - pad} y={b.minZ - pad} width={w} height={b.maxZ - b.minZ + pad * 2} fill="url(#blocks)" />
          <polygon points={roadPts} fill="none" stroke="#0b0d10" strokeWidth={track.halfWidth * 2 + 10} strokeLinejoin="round" />
          <polygon points={roadPts} fill="none" stroke="#8d939c" strokeWidth={track.halfWidth * 2} strokeLinejoin="round" />
          {pickups.filter((p) => p.kind === 'coin' && p.takenAt == null).map((p) => <circle key={p.id} cx={p.x} cy={p.z} r={3} fill="#ffcc33" />)}
          {route && <polyline points={route} fill="none" stroke="#b44dff" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />}
          {stash && (
            <g>
              <circle cx={stash.x} cy={stash.z} r={16} fill="#b44dff" stroke="#fff" strokeWidth={3} />
              <text x={stash.x} y={stash.z + 7} textAnchor="middle" fontSize={20}>💰</text>
            </g>
          )}
          {me && (
            <g>
              <line x1={me.x - w} y1={me.z} x2={me.x + w} y2={me.z} stroke="#fff" strokeOpacity={0.35} strokeWidth={1.5} />
              <line x1={me.x} y1={me.z - w} x2={me.x} y2={me.z + w} stroke="#fff" strokeOpacity={0.35} strokeWidth={1.5} />
              <circle cx={me.x} cy={me.z} r={12} fill="#35e0ff" stroke="#fff" strokeWidth={4} />
            </g>
          )}
        </svg>
        <div className="mt-2 text-sm text-center">
          {stash ? (
            <span className="text-purple-300 font-bold">💰 מטמון סודי: {track.def.stash.hintHe} — עקוב אחרי הקו הסגול</span>
          ) : available ? (
            <span className="text-slate-300">המטמון לא זמין במירוץ הזה.</span>
          ) : (
            <span className="text-emerald-300">✓ כבר מצאת היום את המטמון של המסלול הזה — הוא יחזור מחר.</span>
          )}
        </div>
      </div>
    </div>
  );
}
