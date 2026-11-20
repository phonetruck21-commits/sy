import { useEffect, useState } from 'react';
import { applyControl, ptzCapabilities } from '../lib/camera';
import { Button } from './ui';

type Axis = 'pan' | 'tilt' | 'zoom';

/**
 * On-screen joystick for motorised PTZ cameras (e.g. EMEET PIXY).
 * Rendered only when the camera actually reports pan/tilt/zoom through the browser.
 */
export function PtzPad({ track, onError }: { track: MediaStreamTrack; onError: (msg: string) => void }) {
  const [caps, setCaps] = useState(() => ptzCapabilities(track));
  useEffect(() => setCaps(ptzCapabilities(track)), [track]);
  if (!caps) return null;

  async function move(axis: Axis, dir: 1 | -1 | 0) {
    const c = caps?.[axis];
    if (!c) return;
    const step = c.step && c.step > 0 ? Math.max(c.step, (c.max - c.min) / 20) : (c.max - c.min) / 20;
    const center = axis === 'zoom' ? c.min : Math.min(c.max, Math.max(c.min, 0));
    const current = (track.getSettings() as Record<string, number>)[axis] ?? c.value;
    const next = dir === 0 ? center : Math.min(c.max, Math.max(c.min, current + dir * step));
    try {
      await applyControl(track, axis, next);
    } catch (err) {
      onError(`שליטה במצלמה (${axis}): ${(err as Error).message}`);
    }
  }

  const btn = 'h-11 w-11 !px-0 text-lg';
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-2 text-sm font-semibold">🕹️ שליטה בכיוון המצלמה (PTZ)</div>
      <div className="flex items-center justify-center gap-4" dir="ltr">
        {(caps.pan || caps.tilt) && (
          <div className="grid grid-cols-3 gap-1">
            <span />
            <Button size="sm" variant="outline" className={btn} disabled={!caps.tilt} onClick={() => move('tilt', 1)} aria-label="למעלה">▲</Button>
            <span />
            <Button size="sm" variant="outline" className={btn} disabled={!caps.pan} onClick={() => move('pan', -1)} aria-label="שמאלה">◀</Button>
            <Button size="sm" variant="ghost" className={btn} onClick={() => (move('pan', 0), move('tilt', 0))} aria-label="מרכז">⦿</Button>
            <Button size="sm" variant="outline" className={btn} disabled={!caps.pan} onClick={() => move('pan', 1)} aria-label="ימינה">▶</Button>
            <span />
            <Button size="sm" variant="outline" className={btn} disabled={!caps.tilt} onClick={() => move('tilt', -1)} aria-label="למטה">▼</Button>
            <span />
          </div>
        )}
        {caps.zoom && (
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="outline" className={btn} onClick={() => move('zoom', 1)} aria-label="זום פנימה">＋</Button>
            <Button size="sm" variant="outline" className={btn} onClick={() => move('zoom', -1)} aria-label="זום החוצה">－</Button>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">כיווני התנועה בפועל תלויים במצלמה. אם הכיוון הפוך, נעדכן בגרסה הבאה. מומלץ לכבות את מעקב ה-AI ב-EMEET Studio בזמן שליטה ידנית.</p>
    </div>
  );
}
