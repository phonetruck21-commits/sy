import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { principal, requireUser } from '../auth.js';
import { HttpError, badRequest, conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { getPlanForTenant } from '../services/tenants.js';
import { StorageLimitError, type MediaStorage } from '../services/storage.js';
import { loadJob } from './jobs.js';

const ALLOWED: Record<string, { kind: 'photo' | 'video'; ext: string }> = {
  'image/jpeg': { kind: 'photo', ext: 'jpg' },
  'image/png': { kind: 'photo', ext: 'png' },
  'image/webp': { kind: 'photo', ext: 'webp' },
  'video/webm': { kind: 'video', ext: 'webm' },
  'video/mp4': { kind: 'video', ext: 'mp4' },
};

export async function mediaRoutes(app: FastifyInstance, ctx: AppContext, storage: MediaStorage) {
  const anyUser = requireUser(ctx);

  app.post('/api/jobs/:id/media', { preHandler: anyUser, schema: { tags: ['media'], summary: 'העלאת תמונה/סרטון לתיק עבודה (multipart, שדה file)' } }, async (req, reply) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z.object({ clientId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(), capturedAt: z.string().datetime().optional() }).parse(req.query);
    const job = await loadJob(ctx.db, p.tenantId, id);
    if (!job.consent_recording_at) throw new HttpError(412, 'consent_required', 'לא תועדה הסכמת הלקוח לצילום/הקלטה');

    if (q.clientId) {
      // Idempotent offline sync: the same client item uploaded twice is stored once
      const dup = await ctx.db.query('SELECT id FROM media WHERE tenant_id = $1 AND client_id = $2', [p.tenantId, q.clientId]);
      if (dup.rowCount) return { id: dup.rows[0].id, duplicate: true };
    }
    const file = await req.file();
    if (!file) throw badRequest('לא התקבל קובץ');
    const mime = file.mimetype.split(';')[0].trim().toLowerCase();
    const type = ALLOWED[mime];
    if (!type) {
      file.file.resume();
      throw badRequest('סוג קובץ לא נתמך');
    }
    const plan = await getPlanForTenant(ctx.db, p.tenantId);
    const used = await ctx.db.query('SELECT COALESCE(sum(size_bytes),0)::bigint AS b FROM media WHERE tenant_id = $1', [p.tenantId]);
    const remaining = plan.storage_quota_mb * 1024 * 1024 - Number(used.rows[0].b);
    const maxBytes = Math.min(remaining, ctx.config.MAX_UPLOAD_MB * 1024 * 1024);
    if (maxBytes <= 0) {
      file.file.resume();
      throw conflict('מכסת האחסון של החבילה מלאה');
    }
    const key = `${p.tenantId}/${id}/${randomUUID()}.${type.ext}`;
    let stored;
    try {
      stored = await storage.put(key, file.file, maxBytes);
    } catch (err) {
      if (err instanceof StorageLimitError) throw new HttpError(413, 'too_large', 'הקובץ חורג ממכסת האחסון או מגודל הקובץ המותר');
      throw err;
    }
    if (file.file.truncated) {
      await storage.delete(key);
      throw new HttpError(413, 'too_large', 'הקובץ גדול מדי');
    }
    const r = await ctx.db.query(
      `INSERT INTO media (tenant_id, job_id, kind, storage_key, mime, size_bytes, sha256, client_id, created_by, captured_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [p.tenantId, id, type.kind, key, mime, stored.size, stored.sha256, q.clientId ?? null, p.userId, q.capturedAt ?? null],
    );
    await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'media.uploaded', targetType: 'media', targetId: r.rows[0].id, ip: req.ip, details: { jobId: id, kind: type.kind, size: stored.size } });
    reply.code(201);
    return { id: r.rows[0].id, size: stored.size, sha256: stored.sha256 };
  });

  // Media is only served to authenticated staff of the same business. Customers never get direct file URLs.
  app.get('/api/media/:id/content', { preHandler: anyUser, schema: { tags: ['media'], summary: 'הורדת קובץ מדיה (מורשים בלבד)' } }, async (req, reply) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await ctx.db.query('SELECT storage_key, mime, kind FROM media WHERE id = $1 AND tenant_id = $2', [id, p.tenantId]);
    if (!r.rowCount) throw notFound();
    const { stream, size } = await storage.get(r.rows[0].storage_key);
    await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'media.accessed', targetType: 'media', targetId: id, ip: req.ip });
    reply.header('Content-Type', r.rows[0].mime).header('Content-Length', size).header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff');
    return reply.send(stream);
  });

  app.delete('/api/media/:id', { preHandler: requireUser(ctx, ['owner', 'admin']), schema: { tags: ['media'], summary: 'מחיקת קובץ מדיה' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await ctx.db.query('DELETE FROM media WHERE id = $1 AND tenant_id = $2 RETURNING storage_key', [id, p.tenantId]);
    if (!r.rowCount) throw notFound();
    await storage.delete(r.rows[0].storage_key);
    await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'media.deleted', targetType: 'media', targetId: id, ip: req.ip });
    return { ok: true };
  });

  app.get('/api/usage', { preHandler: anyUser, schema: { tags: ['tenant'], summary: 'ניצול מכסות' } }, async (req) => {
    const p = principal(req);
    const plan = await getPlanForTenant(ctx.db, p.tenantId);
    const [storageUsed, users, cameras, streams] = await Promise.all([
      ctx.db.query('SELECT COALESCE(sum(size_bytes),0)::bigint AS b FROM media WHERE tenant_id = $1', [p.tenantId]),
      ctx.db.query('SELECT count(*)::int AS n FROM users WHERE tenant_id = $1 AND is_active', [p.tenantId]),
      ctx.db.query('SELECT count(*)::int AS n FROM cameras WHERE tenant_id = $1', [p.tenantId]),
      ctx.db.query('SELECT count(DISTINCT job_id)::int AS n FROM stream_sessions WHERE tenant_id = $1 AND ended_at IS NULL', [p.tenantId]),
    ]);
    const storageMb = Number(storageUsed.rows[0].b) / 1024 / 1024;
    const warn = (used: number, max: number) => used >= max * 0.8;
    return {
      plan,
      storageMb: Math.round(storageMb * 10) / 10,
      users: users.rows[0].n,
      cameras: cameras.rows[0].n,
      activeStreams: streams.rows[0].n,
      warnings: {
        storage: warn(storageMb, plan.storage_quota_mb),
        users: warn(users.rows[0].n, plan.max_users),
        cameras: warn(cameras.rows[0].n, plan.max_cameras),
      },
    };
  });
}
