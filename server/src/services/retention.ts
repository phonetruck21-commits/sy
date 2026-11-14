import type pg from 'pg';
import type { MediaStorage } from './storage.js';
import { audit } from '../lib/audit.js';

/**
 * Data-retention sweep:
 *  - deletes media older than the tenant's retention_days (file + row)
 *  - deletes expired sessions and long-expired share links
 * Runs periodically from the server process; safe to run concurrently (row-level DELETE ... RETURNING).
 */
export async function runRetention(db: pg.Pool, storage: MediaStorage, log: (o: object, m: string) => void = () => undefined) {
  const expired = await db.query(
    `DELETE FROM media m USING tenants t
      WHERE m.tenant_id = t.id AND m.created_at < now() - make_interval(days => t.retention_days)
      RETURNING m.id, m.tenant_id, m.storage_key`,
  );
  for (const row of expired.rows) {
    await storage.delete(row.storage_key).catch((err) => log({ err, key: row.storage_key }, 'retention: file delete failed'));
  }
  const perTenant = new Map<string, number>();
  for (const row of expired.rows) perTenant.set(row.tenant_id, (perTenant.get(row.tenant_id) ?? 0) + 1);
  for (const [tenantId, count] of perTenant) {
    await audit(db, { tenantId, actor: 'system', action: 'retention.media_deleted', details: { count } });
  }
  const sessions = await db.query(`DELETE FROM sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'`);
  const links = await db.query(`DELETE FROM share_links WHERE expires_at < now() - interval '30 days'`);
  // Stream sessions left open by a crashed client are closed after 12h
  await db.query(`UPDATE stream_sessions SET ended_at = now() WHERE ended_at IS NULL AND started_at < now() - interval '12 hours'`);
  const result = { media: expired.rowCount ?? 0, sessions: sessions.rowCount ?? 0, links: links.rowCount ?? 0 };
  log(result, 'retention sweep done');
  return result;
}
