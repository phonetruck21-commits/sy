import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { principal, requireUser } from '../auth.js';
import { normalizePhone, randomToken } from '../lib/crypto.js';
import { badRequest, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { withTx, type Queryable } from '../db.js';

const JOB_COLUMNS = `
  j.id, j.job_number, j.customer_id, c.full_name AS customer_name, j.device_type, j.device_details, j.issue_description,
  j.technician_id, u.full_name AS technician_name, j.status_key, s.label AS status_label, s.is_terminal,
  j.received_at, j.started_at, j.closed_at, j.parts_replaced, j.tech_notes, j.summary,
  j.consent_streaming_at, j.consent_recording_at, j.consent_method, j.is_demo, j.created_at, j.updated_at`;

const JOB_FROM = `
  FROM jobs j
  LEFT JOIN customers c ON c.id = j.customer_id
  LEFT JOIN users u ON u.id = j.technician_id
  JOIN job_statuses s ON s.tenant_id = j.tenant_id AND s.key = j.status_key`;

export async function loadJob(db: Queryable, tenantId: string, jobId: string) {
  const r = await db.query(`SELECT ${JOB_COLUMNS}, j.stream_path ${JOB_FROM} WHERE j.tenant_id = $1 AND j.id = $2`, [tenantId, jobId]);
  if (!r.rowCount) throw notFound('העבודה לא נמצאה');
  return r.rows[0];
}

function publicJob(row: Record<string, unknown>) {
  // stream_path is an internal routing secret; it is never returned by list/detail APIs
  const { stream_path: _sp, ...rest } = row;
  return rest;
}

export async function jobRoutes(app: FastifyInstance, ctx: AppContext) {
  const anyUser = requireUser(ctx);

  // ---- Customers ---------------------------------------------------------
  app.get('/api/customers', { preHandler: anyUser, schema: { tags: ['customers'], summary: 'חיפוש לקוחות (שם או טלפון מלא)' } }, async (req) => {
    const p = principal(req);
    const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(req.query);
    const phone = normalizePhone(q);
    const r = await ctx.db.query(
      `SELECT id, full_name, phone_enc, email_enc, is_demo, created_at FROM customers
        WHERE tenant_id = $1 AND ($2::text IS NULL OR full_name ILIKE '%' || $2 || '%' OR phone_hash = $3)
        ORDER BY created_at DESC LIMIT 50`,
      [p.tenantId, q || null, phone && phone.length >= 9 ? ctx.keys.blindIndex(phone) : null],
    );
    return r.rows.map((c) => ({
      id: c.id,
      fullName: c.full_name,
      phone: ctx.keys.decrypt(c.phone_enc),
      email: ctx.keys.decrypt(c.email_enc),
      isDemo: c.is_demo,
      createdAt: c.created_at,
    }));
  });

  app.post('/api/customers', { preHandler: anyUser, schema: { tags: ['customers'], summary: 'יצירת לקוח' } }, async (req, reply) => {
    const p = principal(req);
    const body = z
      .object({
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().max(30).optional().nullable(),
        email: z.string().trim().toLowerCase().email().optional().nullable().or(z.literal('')),
      })
      .parse(req.body);
    const phone = normalizePhone(body.phone);
    const email = body.email || null;
    const r = await ctx.db.query(
      `INSERT INTO customers (tenant_id, full_name, phone_enc, phone_hash, email_enc, email_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [p.tenantId, body.fullName, ctx.keys.encrypt(phone), ctx.keys.blindIndex(phone), ctx.keys.encrypt(email), ctx.keys.blindIndex(email)],
    );
    await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'customer.created', targetType: 'customer', targetId: r.rows[0].id, ip: req.ip });
    reply.code(201);
    return { id: r.rows[0].id };
  });

  app.get('/api/customers/:id/jobs', { preHandler: anyUser, schema: { tags: ['customers'], summary: 'היסטוריית שירות של לקוח' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await ctx.db.query(`SELECT ${JOB_COLUMNS} ${JOB_FROM} WHERE j.tenant_id = $1 AND j.customer_id = $2 ORDER BY j.created_at DESC`, [p.tenantId, id]);
    return r.rows;
  });

  // ---- Jobs --------------------------------------------------------------
  app.get('/api/jobs', { preHandler: anyUser, schema: { tags: ['jobs'], summary: 'רשימת עבודות' } }, async (req) => {
    const p = principal(req);
    const q = z
      .object({ status: z.string().max(40).optional(), open: z.enum(['true', 'false']).optional(), mine: z.enum(['true', 'false']).optional() })
      .parse(req.query);
    const r = await ctx.db.query(
      `SELECT ${JOB_COLUMNS} ${JOB_FROM}
        WHERE j.tenant_id = $1
          AND ($2::text IS NULL OR j.status_key = $2)
          AND ($3::boolean IS NULL OR (NOT s.is_terminal) = $3)
          AND ($4::uuid IS NULL OR j.technician_id = $4)
        ORDER BY j.created_at DESC LIMIT 200`,
      [p.tenantId, q.status ?? null, q.open ? q.open === 'true' : null, q.mine === 'true' ? p.userId : null],
    );
    return r.rows;
  });

  app.post('/api/jobs', { preHandler: anyUser, schema: { tags: ['jobs'], summary: 'פתיחת קריאת שירות' } }, async (req, reply) => {
    const p = principal(req);
    const body = z
      .object({
        customerId: z.string().uuid().optional().nullable(),
        deviceType: z.string().trim().min(1).max(120),
        deviceDetails: z.string().trim().max(500).optional().nullable(),
        issueDescription: z.string().trim().min(1).max(4000),
        technicianId: z.string().uuid().optional().nullable(),
        consentStreaming: z.boolean().default(false),
        consentRecording: z.boolean().default(false),
        consentMethod: z.string().trim().max(200).optional().nullable(),
      })
      .parse(req.body);
    const job = await withTx(ctx.db, async (c) => {
      if (body.customerId) {
        const cust = await c.query('SELECT 1 FROM customers WHERE id = $1 AND tenant_id = $2', [body.customerId, p.tenantId]);
        if (!cust.rowCount) throw badRequest('לקוח לא קיים');
      }
      const techId = body.technicianId ?? p.userId;
      const tech = await c.query('SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 AND is_active', [techId, p.tenantId]);
      if (!tech.rowCount) throw badRequest('טכנאי לא קיים');
      const num = await c.query('UPDATE tenants SET next_job_number = next_job_number + 1 WHERE id = $1 RETURNING next_job_number - 1 AS n', [p.tenantId]);
      const first = await c.query('SELECT key FROM job_statuses WHERE tenant_id = $1 ORDER BY sort_order LIMIT 1', [p.tenantId]);
      const consentAny = body.consentStreaming || body.consentRecording;
      const r = await c.query(
        `INSERT INTO jobs (tenant_id, job_number, customer_id, device_type, device_details, issue_description, technician_id, status_key,
                           stream_path, consent_streaming_at, consent_recording_at, consent_method, consent_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $10 THEN now() END, CASE WHEN $11 THEN now() END, $12, $13) RETURNING id`,
        [
          p.tenantId,
          num.rows[0].n,
          body.customerId ?? null,
          body.deviceType,
          body.deviceDetails ?? null,
          body.issueDescription,
          techId,
          first.rows[0].key,
          // MediaMTX path names: alphanumerics, '_', '-'. 128 bits of randomness.
          'j_' + randomToken(16).replace(/[^A-Za-z0-9]/g, 'x'),
          body.consentStreaming,
          body.consentRecording,
          consentAny ? body.consentMethod || 'אישור בעל-פה שתועד ע"י הטכנאי' : null,
          consentAny ? p.userId : null,
        ],
      );
      await c.query('INSERT INTO job_status_history (tenant_id, job_id, to_status, user_id) VALUES ($1,$2,$3,$4)', [p.tenantId, r.rows[0].id, first.rows[0].key, p.userId]);
      await audit(c, { tenantId: p.tenantId, userId: p.userId, action: 'job.created', targetType: 'job', targetId: r.rows[0].id, ip: req.ip, details: { consentStreaming: body.consentStreaming, consentRecording: body.consentRecording } });
      return loadJob(c, p.tenantId, r.rows[0].id);
    });
    reply.code(201);
    return publicJob(job);
  });

  app.get('/api/jobs/:id', { preHandler: anyUser, schema: { tags: ['jobs'], summary: 'תיק עבודה' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const job = await loadJob(ctx.db, p.tenantId, id);
    const [history, media, links] = await Promise.all([
      ctx.db.query(
        `SELECT h.from_status, h.to_status, h.created_at, u.full_name AS user_name FROM job_status_history h
           LEFT JOIN users u ON u.id = h.user_id WHERE h.job_id = $1 AND h.tenant_id = $2 ORDER BY h.id`,
        [id, p.tenantId],
      ),
      ctx.db.query('SELECT id, kind, mime, size_bytes, captured_at, created_at FROM media WHERE job_id = $1 AND tenant_id = $2 ORDER BY created_at', [id, p.tenantId]),
      ctx.db.query(
        `SELECT id, created_at, expires_at, revoked_at, max_viewers, (pin_hash IS NOT NULL) AS has_pin, use_count, last_used_at
           FROM share_links WHERE job_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
        [id, p.tenantId],
      ),
    ]);
    let customer = null;
    if (job.customer_id) {
      const c = await ctx.db.query('SELECT id, full_name, phone_enc, email_enc FROM customers WHERE id = $1 AND tenant_id = $2', [job.customer_id, p.tenantId]);
      if (c.rowCount) customer = { id: c.rows[0].id, fullName: c.rows[0].full_name, phone: ctx.keys.decrypt(c.rows[0].phone_enc), email: ctx.keys.decrypt(c.rows[0].email_enc) };
    }
    const live = await ctx.mtx.getPath(job.stream_path);
    return {
      ...publicJob(job),
      customer,
      history: history.rows,
      media: media.rows,
      shareLinks: links.rows,
      stream: { live: !!live?.ready, viewers: live?.readers.length ?? 0 },
    };
  });

  app.patch('/api/jobs/:id', { preHandler: anyUser, schema: { tags: ['jobs'], summary: 'עדכון פרטי עבודה' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        deviceType: z.string().trim().min(1).max(120).optional(),
        deviceDetails: z.string().trim().max(500).nullable().optional(),
        issueDescription: z.string().trim().min(1).max(4000).optional(),
        techNotes: z.string().max(20000).nullable().optional(),
        summary: z.string().max(20000).nullable().optional(),
        partsReplaced: z.array(z.object({ name: z.string().trim().min(1).max(200), qty: z.number().int().min(1).max(1000).default(1), sku: z.string().max(100).optional() })).max(100).optional(),
        technicianId: z.string().uuid().optional(),
        customerId: z.string().uuid().nullable().optional(),
      })
      .parse(req.body);
    await loadJob(ctx.db, p.tenantId, id);
    if (body.technicianId) {
      const t = await ctx.db.query('SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2', [body.technicianId, p.tenantId]);
      if (!t.rowCount) throw badRequest('טכנאי לא קיים');
    }
    if (body.customerId) {
      const t = await ctx.db.query('SELECT 1 FROM customers WHERE id = $1 AND tenant_id = $2', [body.customerId, p.tenantId]);
      if (!t.rowCount) throw badRequest('לקוח לא קיים');
    }
    const sets: string[] = [];
    const vals: unknown[] = [id, p.tenantId];
    const map: Record<string, string> = {
      deviceType: 'device_type',
      deviceDetails: 'device_details',
      issueDescription: 'issue_description',
      techNotes: 'tech_notes',
      summary: 'summary',
      technicianId: 'technician_id',
      customerId: 'customer_id',
    };
    for (const [k, col] of Object.entries(map)) {
      const v = (body as Record<string, unknown>)[k];
      if (v !== undefined) {
        vals.push(v);
        sets.push(`${col} = $${vals.length}`);
      }
    }
    if (body.partsReplaced) {
      vals.push(JSON.stringify(body.partsReplaced));
      sets.push(`parts_replaced = $${vals.length}`);
    }
    if (sets.length) {
      await ctx.db.query(`UPDATE jobs SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND tenant_id = $2`, vals);
      await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'job.updated', targetType: 'job', targetId: id, ip: req.ip, details: { fields: Object.keys(body) } });
    }
    return publicJob(await loadJob(ctx.db, p.tenantId, id));
  });

  app.post('/api/jobs/:id/status', { preHandler: anyUser, schema: { tags: ['jobs'], summary: 'שינוי סטטוס' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { status } = z.object({ status: z.string().max(40) }).parse(req.body);
    const job = await loadJob(ctx.db, p.tenantId, id);
    const st = await ctx.db.query('SELECT is_terminal FROM job_statuses WHERE tenant_id = $1 AND key = $2', [p.tenantId, status]);
    if (!st.rowCount) throw badRequest('סטטוס לא קיים');
    const terminal: boolean = st.rows[0].is_terminal;
    await withTx(ctx.db, async (c) => {
      await c.query(
        `UPDATE jobs SET status_key = $3, updated_at = now(),
                started_at = COALESCE(started_at, CASE WHEN $4 THEN NULL ELSE now() END),
                closed_at = CASE WHEN $4 THEN now() ELSE NULL END
          WHERE id = $1 AND tenant_id = $2`,
        [id, p.tenantId, status, terminal],
      );
      await c.query('INSERT INTO job_status_history (tenant_id, job_id, from_status, to_status, user_id) VALUES ($1,$2,$3,$4,$5)', [p.tenantId, id, job.status_key, status, p.userId]);
      if (terminal) await closeStreamArtifacts(c, p.tenantId, id);
      await audit(c, { tenantId: p.tenantId, userId: p.userId, action: 'job.status_changed', targetType: 'job', targetId: id, ip: req.ip, details: { from: job.status_key, to: status } });
    });
    if (terminal) await ctx.mtx.kickPublisher(job.stream_path);
    return publicJob(await loadJob(ctx.db, p.tenantId, id));
  });

  app.post('/api/jobs/:id/consent', { preHandler: anyUser, schema: { tags: ['jobs'], summary: 'תיעוד הסכמת לקוח לצילום/שידור' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ streaming: z.boolean(), recording: z.boolean(), method: z.string().trim().min(2).max(200) }).parse(req.body);
    const job = await loadJob(ctx.db, p.tenantId, id);
    await ctx.db.query(
      `UPDATE jobs SET consent_streaming_at = CASE WHEN $3 THEN COALESCE(consent_streaming_at, now()) END,
                       consent_recording_at = CASE WHEN $4 THEN COALESCE(consent_recording_at, now()) END,
                       consent_method = $5, consent_by_user_id = $6, updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [id, p.tenantId, body.streaming, body.recording, body.method, p.userId],
    );
    if (!body.streaming) {
      // consent withdrawn: stop the live stream and invalidate viewing links
      await closeStreamArtifacts(ctx.db, p.tenantId, id);
      await ctx.mtx.kickPublisher(job.stream_path);
    }
    await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'job.consent_updated', targetType: 'job', targetId: id, ip: req.ip, details: body });
    return publicJob(await loadJob(ctx.db, p.tenantId, id));
  });
}

/** Revokes viewing links and ends open stream sessions for a job. */
export async function closeStreamArtifacts(db: Queryable, tenantId: string, jobId: string) {
  await db.query('UPDATE share_links SET revoked_at = now() WHERE job_id = $1 AND tenant_id = $2 AND revoked_at IS NULL', [jobId, tenantId]);
  await db.query('UPDATE stream_sessions SET ended_at = now() WHERE job_id = $1 AND tenant_id = $2 AND ended_at IS NULL', [jobId, tenantId]);
}
