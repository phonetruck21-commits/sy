import { useCloud } from '../../net/cloud';

/** Small cloud/account status chip. */
export function AccountBadge({ className = '' }: { className?: string }) {
  const status = useCloud((s) => s.status);
  const cloud = useCloud((s) => s.cloud);
  const err = useCloud((s) => s.syncError);
  if (status !== 'on' || !cloud) return null;
  return (
    <div className={`glass rounded-full px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 ${className}`} title={err ? 'הסנכרון נכשל' : 'ההתקדמות נשמרת בחשבון שלך'}>
      <span>{err ? '⚠️' : '☁️'}</span>
      <span className="truncate max-w-32" dir="auto">{cloud.accountName || 'מחובר'}</span>
    </div>
  );
}
