import { useCloud } from '../../net/cloud';
import { usePlayers } from '../../net/players';
import { useGame } from '../../store/gameStore';
import { Avatar } from './PlayerUI';

/** Account chip: avatar + username (or guest), opens the profile. */
export function AccountBadge({ className = '' }: { className?: string }) {
  const status = useCloud((s) => s.status);
  const err = useCloud((s) => s.syncError);
  const me = usePlayers((s) => s.me);
  const go = useGame((s) => s.go);
  if (status === 'loading') return null;
  return (
    <button className={`glass rounded-full pl-3 pr-1 py-1 text-sm font-bold flex items-center gap-2 ${className}`} onClick={() => go('profile')} data-testid="account-badge" title={err ? 'הסנכרון נכשל' : 'הפרופיל שלי'}>
      {me ? <Avatar avatar={me.avatar} color={me.color} size={26} /> : <span className="text-lg px-1">👤</span>}
      <span className="truncate max-w-32" dir="auto">{me ? me.username : status === 'on' ? 'צור משתמש' : 'אורח'}</span>
      {status === 'on' && <span className="text-xs">{err ? '⚠️' : '☁️'}</span>}
    </button>
  );
}
