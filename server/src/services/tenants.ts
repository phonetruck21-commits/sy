import type pg from 'pg';
import { hashPassword } from '../lib/crypto.js';
import { conflict } from '../lib/errors.js';

export const DEFAULT_STATUSES: { key: string; label: string; terminal?: boolean }[] = [
  { key: 'pending_check', label: 'ממתין לבדיקה' },
  { key: 'checking', label: 'בבדיקה' },
  { key: 'awaiting_approval', label: 'ממתין לאישור' },
  { key: 'repairing', label: 'בתיקון' },
  { key: 'qa', label: 'בבדיקת תקינות' },
  { key: 'ready', label: 'מוכן למסירה' },
  { key: 'closed', label: 'נסגר', terminal: true },
];

export interface NewTenant {
  businessName: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  password: string;
  planId?: string;
  isDemo?: boolean;
}

/** Creates a business, its owner account and its default workflow statuses. Must run inside a transaction. */
export async function createTenant(c: pg.PoolClient, t: NewTenant): Promise<{ tenantId: string; userId: string }> {
  const exists = await c.query('SELECT 1 FROM users WHERE email = $1', [t.ownerEmail]);
  if (exists.rowCount) throw conflict('כתובת הדוא"ל כבר רשומה במערכת');
  const slugTaken = await c.query('SELECT 1 FROM tenants WHERE slug = $1', [t.slug]);
  if (slugTaken.rowCount) throw conflict('מזהה העסק כבר תפוס');

  const tenant = await c.query(
    'INSERT INTO tenants (name, slug, plan_id, is_demo) VALUES ($1,$2,$3,$4) RETURNING id',
    [t.businessName, t.slug, t.planId ?? 'pilot', t.isDemo ?? false],
  );
  const tenantId: string = tenant.rows[0].id;
  let order = 10;
  for (const s of DEFAULT_STATUSES) {
    await c.query('INSERT INTO job_statuses (tenant_id, key, label, sort_order, is_terminal) VALUES ($1,$2,$3,$4,$5)', [
      tenantId,
      s.key,
      s.label,
      order,
      s.terminal ?? false,
    ]);
    order += 10;
  }
  const user = await c.query(
    `INSERT INTO users (tenant_id, email, full_name, password_hash, role) VALUES ($1,$2,$3,$4,'owner') RETURNING id`,
    [tenantId, t.ownerEmail, t.ownerName, await hashPassword(t.password)],
  );
  return { tenantId, userId: user.rows[0].id };
}

export async function getPlanForTenant(db: pg.Pool | pg.PoolClient, tenantId: string) {
  const r = await db.query(
    `SELECT p.* FROM plans p JOIN tenants t ON t.plan_id = p.id WHERE t.id = $1`,
    [tenantId],
  );
  return r.rows[0] as {
    id: string;
    name: string;
    max_cameras: number;
    max_users: number;
    storage_quota_mb: number;
    max_concurrent_streams: number;
    max_viewers_per_stream: number;
  };
}
