import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { principal, requireUser } from '../auth.js';
import { HttpError, badRequest, conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { withTx } from '../db.js';
import { getPlanForTenant } from '../services/tenants.js';
import type { MediaStorage } from '../services/storage.js';
import { loadJob } from './jobs.js';
import { ALLOWED } from './media.js';

/** Max bytes per chunk. Clients send 4 MB; the limit leaves headroom. */
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

const partKey = (tenantId: string, uploadId: string) => `_uploads/${tenantId}/${uploadId}.part`;

/**
 * Resumable chunked uploads for large recordings (hours of video, flaky networks).
 *
 *   POST /api/jobs/:id/uploads          create (or resume by clientId)  -> { id, received, totalSize }
 *   PUT  /api/uploads/:id?offset=N      append one chunk (raw bytes)     -> { received }
 *   GET  /api/uploads/:id               where to resume                  -> { received, totalSize, completed }
 *   POST /api/uploads/:id/complete      turn the finished file into media
 *   DELETE /api/uploads/:id             abort
 *
 * The size of the file on disk is the source of truth for "received"; chunks are accepted only
 * at exactly that offset, under a row lock, so retries and duplicate requests can never corrupt the file.
 */
export async function uploadRoutes(app: FastifyInstance, ctx: AppContext, storage: MediaStorage) {
  const anyUser = requireUser(ctx);

  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_CHUNK_BYTES }, (_req, body, done) => done(null, body));

  async function loadUpload(tenantId: string, id: string) {
    const r = await ctx.db.query('SELECT * FROM uploads WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!r.rowCount) throw notFound('ההעלאה לא נמצאה');
    return r.rows[0];
  }

  const view = async (u: Record<string, any>) => ({
    id: u.id,
    jobId: u.job_id,
    totalSize: Number(u.total_size),
    received: u.media_id ? Number(u.total_size) : await storage.partSize(partKey(u.tenant_id, u.id)),
    completed: !!u.media_id,
    mediaId: u.media_id,
    chunkSize: 4 * 1024 * 1024,
  });

  app.post('/api/jobs/:id/uploads', { preHandler: anyUser, schema: { tags: ['media'], summary: 'פתיחת העלאה בחלקים (הקלטות גדולות), או המשך העלאה קיימת לפי clientId' } }, async (req, reply) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        mime: z.string().max(100),
        size: z.number().int().positive(),
        clientId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
        capturedAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    const job = await loadJob(ctx.db, p.tenantId, id);
    if (!job.consent_recording_at) throw new HttpError(412, 'consent_required', 'לא תועדה הסכמת הלקוח לצילום/הקלטה');
    const type = ALLOWED[body.mime.split(';')[0].trim().toLowerCase()];
    if (!type) throw badRequest('סוג קובץ לא נתמך');

    const existing = await ctx.db.query('SELECT * FROM uploads WHERE tenant_id = $1 AND client_id = $2', [p.tenantId, body.clientId]);
    if (existing.rowCount) {
      const u = existing.rows[0];
      if (u.job_id !== id || Number(u.total_size) !== body.size) throw conflict('מזהה ההעלאה כבר בשימוש עבור קובץ אחר');
      return view(u);
    }
    if (body.size > ctx.config.MAX_RECORDING_MB * 1024 * 1024) throw new HttpError(413, 'too_large', `הקובץ גדול מהמותר (${ctx.config.MAX_RECORDING_MB}MB)`);
    // Quota counts finished media plus space reserved by unfinished uploads
    const plan = await getPlanForTenant(ctx.db, p.tenantId);
    const used = await ctx.db.query(
      `SELECT (SELECT COALESCE(sum(size_bytes),0) FROM media WHERE tenant_id = $1)
            + (SELECT COALESCE(sum(total_size),0) FROM uploads WHERE tenant_id = $1 AND media_id IS NULL) AS b`,
      [p.tenantId],
    );
    if (Number(used.rows[0].b) + body.size > plan.storage_quota_mb * 1024 * 1024) throw conflict('מכסת האחסון של החבילה אינה מספיקה לקובץ זה');

    const r = await ctx.db.query(
      `INSERT INTO uploads (tenant_id, job_id, kind, mime, total_size, client_id, captured_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [p.tenantId, id, type.kind, body.mime.split(';')[0].trim().toLowerCase(), body.size, body.clientId, body.capturedAt ?? null, p.userId],
    );
    reply.code(201);
    return view(r.rows[0]);
  });

  app.get('/api/uploads/:id', { preHandler: anyUser, schema: { tags: ['media'], summary: 'מצב העלאה (מאיפה להמשיך)' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return view(await loadUpload(p.tenantId, id));
  });

  app.put('/api/uploads/:id', { preHandler: anyUser, bodyLimit: MAX_CHUNK_BYTES, schema: { tags: ['media'], summary: 'שליחת חלק (application/octet-stream) במיקום offset' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { offset } = z.object({ offset: z.coerce.number().int().min(0) }).parse(req.query);
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw badRequest('נדרש גוף application/octet-stream');
    return withTx(ctx.db, async (c) => {
      const r = await c.query('SELECT * FROM uploads WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [id, p.tenantId]);
      if (!r.rowCount) throw notFound('ההעלאה לא נמצאה');
      const u = r.rows[0];
      if (u.media_id) throw conflict('ההעלאה כבר הושלמה');
      const key = partKey(p.tenantId, id);
      const received = await storage.partSize(key);
      if (offset !== received) throw new HttpError(409, 'offset_mismatch', `יש להמשיך ממיקום ${received}`, { received });
      if (received + data.length > Number(u.total_size)) throw badRequest('החלק חורג מגודל הקובץ שהוצהר');
      const now = await storage.appendPart(key, data);
      await c.query('UPDATE uploads SET received = $2, updated_at = now() WHERE id = $1', [id, now]);
      return { received: now, totalSize: Number(u.total_size) };
    });
  });

  app.post('/api/uploads/:id/complete', { preHandler: anyUser, schema: { tags: ['media'], summary: 'סיום העלאה – הקובץ נוסף לתיק העבודה' } }, async (req, reply) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await withTx(ctx.db, async (c) => {
      const r = await c.query('SELECT * FROM uploads WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [id, p.tenantId]);
      if (!r.rowCount) throw notFound('ההעלאה לא נמצאה');
      const u = r.rows[0];
      if (u.media_id) return { mediaId: u.media_id as string, duplicate: true };
      const key = partKey(p.tenantId, id);
      const received = await storage.partSize(key);
      if (received !== Number(u.total_size)) throw new HttpError(409, 'incomplete', `התקבלו ${received} מתוך ${u.total_size} בתים`, { received });
      const ext = ALLOWED[u.mime].ext;
      const finalKey = `${p.tenantId}/${u.job_id}/${randomUUID()}.${ext}`;
      const stored = await storage.finalizePart(key, finalKey);
      const m = await c.query(
        `INSERT INTO media (tenant_id, job_id, kind, storage_key, mime, size_bytes, sha256, client_id, created_by, captured_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [p.tenantId, u.job_id, u.kind, finalKey, u.mime, stored.size, stored.sha256, u.client_id, p.userId, u.captured_at],
      );
      await c.query('UPDATE uploads SET media_id = $2, received = total_size, updated_at = now() WHERE id = $1', [id, m.rows[0].id]);
      await audit(c, { tenantId: p.tenantId, userId: p.userId, action: 'media.uploaded', targetType: 'media', targetId: m.rows[0].id, ip: req.ip, details: { jobId: u.job_id, kind: u.kind, size: stored.size, resumable: true } });
      return { mediaId: m.rows[0].id as string, sha256: stored.sha256, size: stored.size };
    });
    if (!('duplicate' in result)) reply.code(201);
    return result;
  });

  app.delete('/api/uploads/:id', { preHandler: anyUser, schema: { tags: ['media'], summary: 'ביטול העלאה' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const u = await loadUpload(p.tenantId, id);
    if (u.media_id) throw conflict('ההעלאה כבר הושלמה');
    await storage.delete(partKey(p.tenantId, id));
    await ctx.db.query('DELETE FROM uploads WHERE id = $1', [id]);
    return { ok: true };
  });
}

export { partKey };
