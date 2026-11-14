import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { createSession, principal, requireUser } from '../auth.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { HttpError, forbidden, unauthorized } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { withTx } from '../db.js';
import { createTenant, getPlanForTenant } from '../services/tenants.js';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Dummy hash so that unknown emails take the same time as wrong passwords.
let dummyHash: Promise<string> | null = null;

export const passwordSchema = z.string().min(10, 'סיסמה חייבת להכיל לפחות 10 תווים').max(200);

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const loginLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

  app.get('/api/auth/bootstrap-status', { schema: { tags: ['auth'], summary: 'האם נדרשת הקמה ראשונית' } }, async () => {
    const r = await ctx.db.query('SELECT count(*)::int AS n FROM tenants WHERE NOT is_demo');
    const needsSetup = r.rows[0].n === 0;
    return { needsSetup, signupAllowed: needsSetup || ctx.config.ALLOW_SIGNUP };
  });

  app.post('/api/auth/signup', { config: loginLimit, schema: { tags: ['auth'], summary: 'פתיחת עסק חדש + משתמש בעלים' } }, async (req, reply) => {
    const body = z
      .object({
        businessName: z.string().trim().min(2).max(120),
        slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/, 'מזהה עסק: אותיות באנגלית, ספרות ומקף'),
        fullName: z.string().trim().min(2).max(120),
        email: z.string().trim().toLowerCase().email(),
        password: passwordSchema,
      })
      .parse(req.body);
    const count = await ctx.db.query('SELECT count(*)::int AS n FROM tenants WHERE NOT is_demo');
    if (count.rows[0].n > 0 && !ctx.config.ALLOW_SIGNUP) throw forbidden('פתיחת עסקים חדשים סגורה בשרת זה');
    const { tenantId, userId } = await withTx(ctx.db, (c) =>
      createTenant(c, { businessName: body.businessName, slug: body.slug, ownerEmail: body.email, ownerName: body.fullName, password: body.password }),
    );
    await audit(ctx.db, { tenantId, userId, action: 'tenant.created', targetType: 'tenant', targetId: tenantId, ip: req.ip });
    const session = await createSession(ctx, userId, tenantId, req);
    reply.code(201);
    return { token: session.token, expiresAt: session.expiresAt };
  });

  app.post('/api/auth/login', { config: loginLimit, schema: { tags: ['auth'], summary: 'התחברות' } }, async (req) => {
    const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }).parse(req.body);
    const r = await ctx.db.query(
      'SELECT id, tenant_id, password_hash, is_active, failed_login_count, locked_until FROM users WHERE email = $1',
      [body.email],
    );
    const user = r.rows[0];
    if (!user) {
      dummyHash ??= hashPassword('dummy-password-for-timing');
      await verifyPassword(body.password, await dummyHash);
      throw unauthorized('דוא"ל או סיסמה שגויים');
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await audit(ctx.db, { tenantId: user.tenant_id, userId: user.id, action: 'auth.login_locked', ip: req.ip });
      throw new HttpError(423, 'locked', 'החשבון ננעל זמנית עקב ניסיונות כושלים. נסו שוב מאוחר יותר.');
    }
    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok || !user.is_active) {
      const failed = user.failed_login_count + 1;
      const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
      await ctx.db.query('UPDATE users SET failed_login_count = $2, locked_until = $3 WHERE id = $1', [
        user.id,
        lock ? 0 : failed,
        lock,
      ]);
      await audit(ctx.db, { tenantId: user.tenant_id, userId: user.id, action: 'auth.login_failed', ip: req.ip, details: { locked: !!lock } });
      throw unauthorized('דוא"ל או סיסמה שגויים');
    }
    await ctx.db.query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
    const session = await createSession(ctx, user.id, user.tenant_id, req);
    await audit(ctx.db, { tenantId: user.tenant_id, userId: user.id, action: 'auth.login', ip: req.ip });
    return { token: session.token, expiresAt: session.expiresAt };
  });

  app.post('/api/auth/logout', { preHandler: requireUser(ctx), schema: { tags: ['auth'], summary: 'התנתקות' } }, async (req) => {
    const p = principal(req);
    await ctx.db.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [p.sessionId]);
    await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'auth.logout', ip: req.ip });
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireUser(ctx), schema: { tags: ['auth'], summary: 'פרטי המשתמש המחובר' } }, async (req) => {
    const p = principal(req);
    const t = await ctx.db.query('SELECT name, slug, retention_days, is_demo FROM tenants WHERE id = $1', [p.tenantId]);
    const plan = await getPlanForTenant(ctx.db, p.tenantId);
    return {
      user: { id: p.userId, email: p.email, fullName: p.fullName, role: p.role },
      tenant: { id: p.tenantId, name: t.rows[0].name, slug: t.rows[0].slug, retentionDays: t.rows[0].retention_days, isDemo: t.rows[0].is_demo },
      plan,
    };
  });
}
