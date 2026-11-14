export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

export function fmtBytes(n: number | string): string {
  const b = Number(n);
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

/** Elapsed work time: from start until close (or now). */
export function workSeconds(startedAt: string | null, closedAt: string | null, now: number = Date.now()): number {
  if (!startedAt) return 0;
  const end = closedAt ? new Date(closedAt).getTime() : now;
  return Math.max(0, (end - new Date(startedAt).getTime()) / 1000);
}

export const ROLE_LABEL: Record<string, string> = { owner: 'בעל העסק', admin: 'מנהל', technician: 'טכנאי' };
