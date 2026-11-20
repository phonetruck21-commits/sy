import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { principal, requireUser } from '../auth.js';
import { hashPassword } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { getPlanForTenant } from '../services/tenants.js';
import { passwordSchema } from './auth.js';
import { withTx } from '../db.js';

export async function adminRoutes(app: FastifyInstance, ctx: AppContext) {
  const admins = requireUser(ctx, ['owner', 'admin']);
  const anyUser = requireUser(ctx);

  // ---- Users -------------------------------------------------------------
  app.get('/api/users', { preHandler: anyUser, schema: { tags: ['users'], summary: 'רשימת משתמשי העסק' } }, async (req) => {
    const p = principal(req);
    const r = await ctx.db.query(
      `SELECT id, email, full_name, role, is_active, last_login_at, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at`,
      [p.tenantId],
    );
    return r.rows;
  });

  app.post('/api/users', { preHandler: admins, schema: { tags: ['users'], summary: 'הוספת משתמש (טכנאי/מנהל)' } }, async (req, reply) => {
    const p = principal(req);
    const body = z
      .object({
        email: z.string().trim().toLowerCase().email(),
        fullName: z.string().trim().min(2).max(120),
        role: z.enum(['admin', 'technician']),
        password: passwordSchema,
      })
      .parse(req.body);
    if (body.role === 'admin' && p.role !== 'owner') throw forbidden('רק בעל העסק יכול להוסיף מנהלים');
    const plan = await getPlanForTenant(ctx.db, p.tenantId);
    const n = await ctx.db.query('SELECT count(*)::int AS n FROM users WHERE tenant_id = $1 AND is_active', [p.tenantId]);
    if (n.rows[0].n >= plan.max_users) throw conflict(`הגעתם למכסת המשתמשים בחבילה (${plan.max_users})`);
    const dup = await ctx.db.query('SELECT 1 FROM users WHERE email = $1', [body.email]);
    if (dup.rowCount) throw conflict('כתובת הדוא"ל כבר רשומה');
    const r = await ctx.db.query(
      `INSERT INTO users (tenant_id, email, full_name, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [p.tenantId, body.email, body.fullName, await hashPassword(body.password), body.role],
    );
    await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'user.created', targetType: 'user', targetId: r.rows[0].id, ip: req.ip, details: { role: body.role } });
    reply.code(201);
    return { id: r.rows[0].id };
  });

  app.patch('/api/users/:id', { preHandler: admins, schema: { tags: ['users'], summary: 'עדכון משתמש' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({ isActive: z.boolean().optional(), role: z.enum(['admin', 'technician']).optional(), password: passwordSchema.optional() })
      .parse(req.body);
    const target = await ctx.db.query('SELECT role FROM users WHERE id = $1 AND tenant_id = $2', [id, p.tenantId]);
    if (!target.rowCount) throw notFound();
    if (target.rows[0].role === 'owner' && id !== p.userId) throw forbidden('לא ניתן לשנות את בעל העסק');
    if (body.role === 'admin' && p.role !== 'owner') throw forbidden();
    if (id === p.userId && body.isActive === false) throw badRequest('לא ניתן להשבית את עצמך');
    await withTx(ctx.db, async (c) => {
      if (body.isActive !== undefined) await c.query('UPDATE users SET is_active = $2 WHERE id = $1', [id, body.isActive]);
      if (body.role && target.rows[0].role !== 'owner') await c.query('UPDATE users SET role = $2 WHERE id = $1', [id, body.role]);
      if (body.password) await c.query('UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL WHERE id = $1', [id, await hashPassword(body.password)]);
      // Any security-relevant change revokes the user's existing sessions
      if (body.isActive === false || body.password || body.role) await c.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
    });
    await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'user.updated', targetType: 'user', targetId: id, ip: req.ip, details: { isActive: body.isActive, role: body.role, passwordChanged: !!body.password } });
    return { ok: true };
  });

  // ---- Tenant settings ---------------------------------------------------
  app.patch('/api/tenant', { preHandler: admins, schema: { tags: ['tenant'], summary: 'הגדרות עסק (שם, ימי שמירת הקלטות)' } }, async (req) => {
    const p = principal(req);
    const body = z.object({ name: z.string().trim().min(2).max(120).optional(), retentionDays: z.number().int().min(1).max(3650).optional() }).parse(req.body);
    await ctx.db.query('UPDATE tenants SET name = COALESCE($2, name), retention_days = COALESCE($3, retention_days) WHERE id = $1', [
      p.tenantId,
      body.name ?? null,
      body.retentionDays ?? null,
    ]);
    await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'tenant.updated', ip: req.ip, details: body });
    return { ok: true };
  });

  // ---- Job statuses (customisable per business) ----------------------------
  app.get('/api/job-statuses', { preHandler: anyUser, schema: { tags: ['jobs'], summary: 'סטטוסי עבודה של העסק' } }, async (req) => {
    const p = principal(req);
    const r = await ctx.db.query('SELECT key, label, sort_order, is_terminal FROM job_statuses WHERE tenant_id = $1 ORDER BY sort_order', [p.tenantId]);
    return r.rows;
  });

  app.put('/api/job-statuses', { preHandler: admins, schema: { tags: ['jobs'], summary: 'עדכון/הוספת סטטוסים (מפתחות קיימים לא נמחקים)' } }, async (req) => {
    const p = principal(req);
    const body = z
      .array(z.object({ key: z.string().regex(/^[a-z0-9_]{2,40}$/), label: z.string().trim().min(1).max(60), sortOrder: z.number().int(), isTerminal: z.boolean().default(false) }))
      .min(2)
      .max(30)
      .parse(req.body);
    if (!body.some((s) => s.isTerminal)) throw badRequest('נדרש לפחות סטטוס סגירה אחד');
    await withTx(ctx.db, async (c) => {
      for (const s of body) {
        await c.query(
          `INSERT INTO job_statuses (tenant_id, key, label, sort_order, is_terminal) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (tenant_id, key) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_terminal = EXCLUDED.is_terminal`,
          [p.tenantId, s.key, s.label, s.sortOrder, s.isTerminal],
        );
      }
    });
    await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'job_statuses.updated', ip: req.ip });
    return { ok: true };
  });

  // ---- Audit log ---------------------------------------------------------
  app.get('/api/audit-log', { preHandler: admins, schema: { tags: ['tenant'], summary: 'יומן פעולות' } }, async (req) => {
    const p = principal(req);
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    const r = await ctx.db.query(
      `SELECT a.id, a.actor, a.action, a.target_type, a.target_id, a.ip, a.details, a.created_at, u.full_name AS user_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.tenant_id = $1 ORDER BY a.id DESC LIMIT $2`,
      [p.tenantId, q.limit],
    );
    return r.rows;
  });

  // ---- Workstations (per-station camera settings) -----------------------
  app.put('/api/workstations/:name', { preHandler: anyUser, schema: { tags: ['cameras'], summary: 'שמירת הגדרות עמדת עבודה' } }, async (req) => {
    const p = principal(req);
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.params);
    const settings = z.record(z.unknown()).parse(req.body);
    if (JSON.stringify(settings).length > 20_000) throw badRequest('הגדרות גדולות מדי');
    const r = await ctx.db.query(
      `INSERT INTO workstations (tenant_id, name, settings, last_seen_at) VALUES ($1,$2,$3, now())
       ON CONFLICT (tenant_id, name) DO UPDATE SET settings = EXCLUDED.settings, last_seen_at = now() RETURNING id`,
      [p.tenantId, name, JSON.stringify(settings)],
    );
    return { id: r.rows[0].id };
  });

  app.get('/api/workstations/:name', { preHandler: anyUser, schema: { tags: ['cameras'], summary: 'קריאת הגדרות עמדת עבודה' } }, async (req) => {
    const p = principal(req);
    const { name } = z.object({ name: z.string().min(1).max(80) }).parse(req.params);
    const r = await ctx.db.query('SELECT id, name, settings, last_seen_at FROM workstations WHERE tenant_id = $1 AND name = $2', [p.tenantId, name]);
    if (!r.rowCount) throw notFound();
    return r.rows[0];
  });

  app.post('/api/cameras/report', { preHandler: anyUser, schema: { tags: ['cameras'], summary: 'דיווח מצלמות שזוהו בעמדה (לניטור)' } }, async (req) => {
    const p = principal(req);
    const body = z.object({ workstation: z.string().min(1).max(80), devices: z.array(z.string().max(200)).max(20) }).parse(req.body);
    const plan = await getPlanForTenant(ctx.db, p.tenantId);
    const ws = await ctx.db.query(
      `INSERT INTO workstations (tenant_id, name, last_seen_at) VALUES ($1,$2, now())
       ON CONFLICT (tenant_id, name) DO UPDATE SET last_seen_at = now() RETURNING id`,
      [p.tenantId, body.workstation],
    );
    const registered: string[] = [];
    for (const label of body.devices) {
      const existing = await ctx.db.query('SELECT id FROM cameras WHERE tenant_id = $1 AND workstation_id = $2 AND device_label = $3', [p.tenantId, ws.rows[0].id, label]);
      if (existing.rowCount) {
        await ctx.db.query('UPDATE cameras SET last_seen_at = now() WHERE id = $1', [existing.rows[0].id]);
        registered.push(existing.rows[0].id);
        continue;
      }
      const count = await ctx.db.query('SELECT count(*)::int AS n FROM cameras WHERE tenant_id = $1', [p.tenantId]);
      if (count.rows[0].n >= plan.max_cameras) continue; // quota reached: camera still usable locally, but not registered
      const r = await ctx.db.query(
        `INSERT INTO cameras (tenant_id, workstation_id, label, device_label, last_seen_at) VALUES ($1,$2,$3,$3, now()) RETURNING id`,
        [p.tenantId, ws.rows[0].id, label],
      );
      registered.push(r.rows[0].id);
    }
    return { registered: registered.length, quota: plan.max_cameras };
  });

  app.get('/api/cameras', { preHandler: anyUser, schema: { tags: ['cameras'], summary: 'מצלמות רשומות' } }, async (req) => {
    const p = principal(req);
    const r = await ctx.db.query(
      `SELECT c.id, c.label, c.kind, c.device_label, c.last_seen_at, w.name AS workstation
         FROM cameras c LEFT JOIN workstations w ON w.id = c.workstation_id WHERE c.tenant_id = $1 ORDER BY c.created_at`,
      [p.tenantId],
    );
    return r.rows;
  });
}
