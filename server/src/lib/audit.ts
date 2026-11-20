import type { Queryable } from '../db.js';

export interface AuditEntry {
  tenantId?: string | null;
  userId?: string | null;
  actor?: 'user' | 'viewer' | 'system' | 'media-server';
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  details?: Record<string, unknown>;
}

/** Append-only audit trail. Never store secrets/tokens in details. */
export async function audit(db: Queryable, e: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (tenant_id, user_id, actor, action, target_type, target_id, ip, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [e.tenantId ?? null, e.userId ?? null, e.actor ?? 'user', e.action, e.targetType ?? null, e.targetId ?? null, e.ip ?? null, JSON.stringify(e.details ?? {})],
  );
}
