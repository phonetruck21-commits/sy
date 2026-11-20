import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { principal, requireUser } from '../auth.js';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto.js';
import { HttpError, badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { signStreamToken, verifyStreamToken, type StreamClaims } from '../lib/streamTokens.js';
import { getPlanForTenant } from '../services/tenants.js';
import { loadJob } from './jobs.js';

const PUBLISH_TOKEN_TTL = 15 * 60; // only needs to be valid when the WebRTC session is negotiated
const VIEW_TOKEN_TTL = 15 * 60; // viewer page silently refreshes it
const MAX_PIN_FAILURES = 5;

/** Checks that a share link (by id) is still usable. Returns link + job metadata or null. */
async function activeLink(ctx: AppContext, linkId: string) {
  const r = await ctx.db.query(
    `SELECT l.id, l.tenant_id, l.job_id, l.max_viewers, l.expires_at, j.stream_path, s.is_terminal, j.consent_streaming_at
       FROM share_links l JOIN jobs j ON j.id = l.job_id
       JOIN job_statuses s ON s.tenant_id = j.tenant_id AND s.key = j.status_key
      WHERE l.id = $1 AND l.revoked_at IS NULL AND l.expires_at > now()`,
    [linkId],
  );
  const row = r.rows[0];
  if (!row || row.is_terminal || !row.consent_streaming_at) return null;
  return row as { id: string; tenant_id: string; job_id: string; max_viewers: number; expires_at: Date; stream_path: string };
}

/** Business rules for "may this token publish to this path right now". */
async function canPublish(ctx: AppContext, claims: StreamClaims, path: string): Promise<boolean> {
  if (claims.path !== path) return false;
  const r = await ctx.db.query(
    `SELECT j.consent_streaming_at, s.is_terminal, u.is_active FROM jobs j
       JOIN job_statuses s ON s.tenant_id = j.tenant_id AND s.key = j.status_key
       JOIN users u ON u.id = $3
      WHERE j.id = $1 AND j.tenant_id = $2 AND j.stream_path = $4 AND u.tenant_id = j.tenant_id`,
    [claims.jid, claims.tid, claims.sub, path],
  );
  const row = r.rows[0];
  return !!row && !!row.consent_streaming_at && !row.is_terminal && row.is_active;
}

/** Business rules for "may this viewer token read this path right now" (incl. viewer limit). */
async function canRead(ctx: AppContext, claims: StreamClaims, path: string): Promise<{ ok: boolean; reason?: string }> {
  if (claims.path !== path) return { ok: false, reason: 'path_mismatch' };
  const link = await activeLink(ctx, claims.sub);
  if (!link || link.stream_path !== path || link.tenant_id !== claims.tid) return { ok: false, reason: 'link_inactive' };
  const plan = await getPlanForTenant(ctx.db, link.tenant_id);
  const limit = Math.min(link.max_viewers, plan.max_viewers_per_stream);
  const info = await ctx.mtx.getPath(path);
  if (info && info.readers.length >= limit) return { ok: false, reason: 'viewer_limit' };
  return { ok: true };
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

export async function streamRoutes(app: FastifyInstance, ctx: AppContext) {
  const anyUser = requireUser(ctx);
  const iceServers = JSON.parse(ctx.config.ICE_SERVERS) as RTCIceServerLike[];

  // SDP bodies for WHIP/WHEP
  for (const type of ['application/sdp', 'application/trickle-ice-sdpfrag']) {
    app.addContentTypeParser(type, { parseAs: 'string', bodyLimit: 256 * 1024 }, (_req, body, done) => done(null, body));
  }

  // ---- Technician: start / stop stream ----------------------------------
  app.post('/api/jobs/:id/stream/start', { preHandler: anyUser, schema: { tags: ['stream'], summary: 'קבלת אסימון שידור (WHIP) לעבודה' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const profile = z
      .object({ width: z.number().int().optional(), height: z.number().int().optional(), fps: z.number().optional(), maxBitrateKbps: z.number().int().optional(), deviceLabel: z.string().max(200).optional() })
      .default({})
      .parse(req.body ?? {});
    const job = await loadJob(ctx.db, p.tenantId, id);
    if (job.is_terminal) throw conflict('העבודה סגורה');
    if (!job.consent_streaming_at) throw new HttpError(412, 'consent_required', 'לא תועדה הסכמת הלקוח לשידור');

    const plan = await getPlanForTenant(ctx.db, p.tenantId);
    const active = await ctx.db.query(
      'SELECT count(DISTINCT job_id)::int AS n FROM stream_sessions WHERE tenant_id = $1 AND ended_at IS NULL AND job_id <> $2',
      [p.tenantId, id],
    );
    if (active.rows[0].n >= plan.max_concurrent_streams) throw conflict(`הגעתם למכסת השידורים המקבילים בחבילה (${plan.max_concurrent_streams})`);

    const open = await ctx.db.query('SELECT id FROM stream_sessions WHERE job_id = $1 AND ended_at IS NULL', [id]);
    let streamSessionId: string = open.rows[0]?.id;
    if (!streamSessionId) {
      const s = await ctx.db.query('INSERT INTO stream_sessions (tenant_id, job_id, started_by, profile) VALUES ($1,$2,$3,$4) RETURNING id', [
        p.tenantId,
        id,
        p.userId,
        JSON.stringify(profile),
      ]);
      streamSessionId = s.rows[0].id;
      await ctx.db.query('UPDATE jobs SET started_at = COALESCE(started_at, now()), updated_at = now() WHERE id = $1', [id]);
      await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'stream.started', targetType: 'job', targetId: id, ip: req.ip, details: profile });
    }
    const token = await signStreamToken(ctx.keys.jwtKey, { aud: 'publish', path: job.stream_path, tid: p.tenantId, jid: id, sub: p.userId }, PUBLISH_TOKEN_TTL);
    return { streamSessionId, whipUrl: `/api/stream/${job.stream_path}/whip`, token, iceServers };
  });

  app.post('/api/jobs/:id/stream/stop', { preHandler: anyUser, schema: { tags: ['stream'], summary: 'עצירת שידור' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const job = await loadJob(ctx.db, p.tenantId, id);
    const r = await ctx.db.query('UPDATE stream_sessions SET ended_at = now() WHERE job_id = $1 AND tenant_id = $2 AND ended_at IS NULL', [id, p.tenantId]);
    await ctx.mtx.kickPublisher(job.stream_path);
    if (r.rowCount) await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'stream.stopped', targetType: 'job', targetId: id, ip: req.ip });
    return { ok: true };
  });

  app.get('/api/streams/active', { preHandler: anyUser, schema: { tags: ['stream'], summary: 'שידורים פעילים של העסק' } }, async (req) => {
    const p = principal(req);
    const r = await ctx.db.query(
      `SELECT s.id, s.job_id, s.started_at, s.profile, j.job_number, j.stream_path, j.device_type, u.full_name AS started_by_name
         FROM stream_sessions s JOIN jobs j ON j.id = s.job_id LEFT JOIN users u ON u.id = s.started_by
        WHERE s.tenant_id = $1 AND s.ended_at IS NULL ORDER BY s.started_at DESC`,
      [p.tenantId],
    );
    const out = [];
    for (const row of r.rows) {
      const info = await ctx.mtx.getPath(row.stream_path);
      const { stream_path: _sp, ...rest } = row;
      out.push({ ...rest, live: !!info?.ready, viewers: info?.readers.length ?? 0, bytesReceived: info?.bytesReceived ?? 0, bytesSent: info?.bytesSent ?? 0 });
    }
    return out;
  });

  // ---- Share links -------------------------------------------------------
  app.post('/api/jobs/:id/share-links', { preHandler: anyUser, schema: { tags: ['share'], summary: 'יצירת קישור צפייה אישי ללקוח' } }, async (req, reply) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        expiresInMinutes: z.number().int().min(5).max(7 * 24 * 60).default(240),
        pin: z.string().regex(/^\d{4,8}$/, 'קוד אימות: 4-8 ספרות').optional().nullable(),
        maxViewers: z.number().int().min(1).max(50).default(3),
      })
      .parse(req.body ?? {});
    const job = await loadJob(ctx.db, p.tenantId, id);
    if (job.is_terminal) throw conflict('העבודה סגורה');
    if (!job.consent_streaming_at) throw new HttpError(412, 'consent_required', 'לא תועדה הסכמת הלקוח לשידור');
    const token = randomToken(32);
    const r = await ctx.db.query(
      `INSERT INTO share_links (tenant_id, job_id, token_hash, pin_hash, max_viewers, created_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6, now() + make_interval(mins => $7)) RETURNING id, expires_at`,
      [p.tenantId, id, sha256(token), body.pin ? await hashPassword(body.pin) : null, body.maxViewers, p.userId, body.expiresInMinutes],
    );
    await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'share_link.created', targetType: 'job', targetId: id, ip: req.ip, details: { linkId: r.rows[0].id, expiresInMinutes: body.expiresInMinutes, pin: !!body.pin } });
    reply.code(201);
    // The raw token is returned exactly once and is never stored.
    return { id: r.rows[0].id, url: `${ctx.config.PUBLIC_BASE_URL.replace(/\/$/, '')}/v/${token}`, expiresAt: r.rows[0].expires_at, hasPin: !!body.pin };
  });

  app.post('/api/share-links/:id/revoke', { preHandler: anyUser, schema: { tags: ['share'], summary: 'ביטול קישור צפייה' } }, async (req) => {
    const p = principal(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await ctx.db.query('UPDATE share_links SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 AND tenant_id = $2 RETURNING job_id', [id, p.tenantId]);
    if (!r.rowCount) throw notFound();
    await audit(ctx.db, { tenantId: p.tenantId, userId: p.userId, action: 'share_link.revoked', targetType: 'share_link', targetId: id, ip: req.ip });
    return { ok: true };
  });

  // ---- Customer viewer ---------------------------------------------------
  app.post('/api/view/session', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['viewer'], summary: 'פתיחת קישור צפייה (טוקן + קוד אופציונלי)' } }, async (req) => {
    const body = z.object({ token: z.string().min(20).max(100), pin: z.string().max(8).optional() }).parse(req.body);
    const r = await ctx.db.query('SELECT id, pin_hash, failed_pin_count, revoked_at, expires_at FROM share_links WHERE token_hash = $1', [sha256(body.token)]);
    const link = r.rows[0];
    if (!link || link.revoked_at || new Date(link.expires_at) <= new Date()) throw new HttpError(410, 'link_invalid', 'הקישור אינו בתוקף. פנו לבית העסק לקבלת קישור חדש.');
    if (link.pin_hash) {
      if (!body.pin) throw new HttpError(401, 'pin_required', 'נדרש קוד אימות');
      if (!(await verifyPassword(body.pin, link.pin_hash))) {
        const failed = link.failed_pin_count + 1;
        await ctx.db.query(`UPDATE share_links SET failed_pin_count = $2::int, revoked_at = CASE WHEN $2::int >= $3::int THEN now() END WHERE id = $1`, [link.id, failed, MAX_PIN_FAILURES]);
        await audit(ctx.db, { actor: 'viewer', action: 'share_link.pin_failed', targetType: 'share_link', targetId: link.id, ip: req.ip, details: { failed } });
        throw new HttpError(401, 'pin_invalid', failed >= MAX_PIN_FAILURES ? 'הקישור ננעל עקב ניסיונות שגויים' : 'קוד אימות שגוי');
      }
    }
    const active = await activeLink(ctx, link.id);
    if (!active) throw new HttpError(410, 'link_invalid', 'הקישור אינו בתוקף. פנו לבית העסק לקבלת קישור חדש.');
    await ctx.db.query('UPDATE share_links SET use_count = use_count + 1, last_used_at = now(), failed_pin_count = 0 WHERE id = $1', [link.id]);
    const ttl = Math.max(30, Math.min(VIEW_TOKEN_TTL, Math.floor((new Date(active.expires_at).getTime() - Date.now()) / 1000)));
    const viewerToken = await signStreamToken(ctx.keys.jwtKey, { aud: 'view', path: active.stream_path, tid: active.tenant_id, jid: active.job_id, sub: active.id }, ttl);
    await audit(ctx.db, { tenantId: active.tenant_id, actor: 'viewer', action: 'share_link.opened', targetType: 'share_link', targetId: active.id, ip: req.ip, details: { ua: (req.headers['user-agent'] ?? '').slice(0, 120) } });
    return { viewerToken, expiresIn: ttl, whepUrl: `/api/stream/${active.stream_path}/whep`, iceServers };
  });

  app.get('/api/view/status', { schema: { tags: ['viewer'], summary: 'פרטי העבודה ומצב השידור לצופה' } }, async (req) => {
    const token = bearer(req);
    const claims = token ? await verifyStreamToken(ctx.keys.jwtKey, token, 'view') : null;
    if (!claims) throw unauthorized('הקישור פג תוקף');
    const link = await activeLink(ctx, claims.sub);
    if (!link) throw new HttpError(410, 'link_invalid', 'הקישור אינו בתוקף');
    const r = await ctx.db.query(
      `SELECT j.job_number, j.device_type, j.issue_description, s.label AS status_label, j.received_at, j.started_at, j.closed_at, t.name AS business_name
         FROM jobs j JOIN job_statuses s ON s.tenant_id = j.tenant_id AND s.key = j.status_key JOIN tenants t ON t.id = j.tenant_id
        WHERE j.id = $1 AND j.tenant_id = $2`,
      [claims.jid, claims.tid],
    );
    if (!r.rowCount) throw notFound();
    const info = await ctx.mtx.getPath(claims.path);
    return { job: r.rows[0], live: !!info?.ready, serverTime: new Date().toISOString(), linkExpiresAt: link.expires_at };
  });

  // ---- WHIP/WHEP signalling proxy -----------------------------------------
  // Clients never talk to MediaMTX's HTTP port directly. We authorise here, then MediaMTX
  // re-authorises the same token via the auth hook (defence in depth).
  const proxy = async (req: FastifyRequest, kind: 'whip' | 'whep', path: string, session?: string) => {
    if (!/^j_[A-Za-z0-9]{10,40}$/.test(path)) throw notFound();
    if (session && !/^[A-Za-z0-9-]{8,64}$/.test(session)) throw notFound();
    const token = bearer(req);
    if (!token) throw unauthorized();
    const claims = await verifyStreamToken(ctx.keys.jwtKey, token, kind === 'whip' ? 'publish' : 'view');
    if (!claims) throw unauthorized('אסימון שידור לא תקף');
    if (req.method === 'POST') {
      if (kind === 'whip' && !(await canPublish(ctx, claims, path))) throw forbidden('השידור אינו מורשה לעבודה זו');
      if (kind === 'whep') {
        const res = await canRead(ctx, claims, path);
        if (!res.ok) throw new HttpError(res.reason === 'viewer_limit' ? 429 : 403, res.reason ?? 'forbidden', res.reason === 'viewer_limit' ? 'הגעתם למספר הצופים המרבי' : 'הצפייה אינה מורשית');
      }
    } else if (claims.path !== path) {
      throw forbidden();
    }
    const target = `${ctx.config.MEDIAMTX_WEBRTC_URL}/${path}/${kind}${session ? '/' + session : ''}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']);
    if (req.headers['if-match']) headers['If-Match'] = String(req.headers['if-match']);
    const fwd = req.headers['x-forwarded-for'];
    headers['X-Forwarded-For'] = fwd ? `${fwd}, ${req.ip}` : req.ip;
    const res = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'POST' || req.method === 'PATCH' ? (req.body as string) : undefined,
      signal: AbortSignal.timeout(15000),
    }).catch((err) => {
      throw new HttpError(502, 'media_server_unavailable', `שרת המדיה אינו זמין (${(err as Error).message})`);
    });
    return res;
  };

  const handler = (kind: 'whip' | 'whep') => async (req: FastifyRequest<{ Params: { path: string; session?: string } }>, reply: import('fastify').FastifyReply) => {
    const res = await proxy(req, kind, req.params.path, req.params.session);
    reply.code(res.status);
    const location = res.headers.get('location');
    if (location) {
      // MediaMTX returns e.g. "/<path>/whep/<uuid>" (relative) – rewrite to our proxy namespace
      const rel = location.replace(/^https?:\/\/[^/]+/, '');
      reply.header('Location', `/api/stream${rel.startsWith('/') ? '' : '/'}${rel}`);
    }
    for (const h of ['content-type', 'etag', 'accept-patch']) {
      const v = res.headers.get(h);
      if (v) reply.header(h, v);
    }
    if (res.ok && req.method === 'POST') {
      // Link headers from MediaMTX contain its own ICE config; clients use iceServers from our API instead.
    }
    if (!res.ok && res.status >= 400) {
      const text = await res.text();
      req.log.warn({ status: res.status, kind, body: text.slice(0, 300) }, 'media server rejected signalling request');
      return { error: 'media_server_error', message: res.status === 401 ? 'השרת דחה את ההרשאה' : 'שגיאת שרת מדיה', status: res.status };
    }
    return Buffer.from(await res.arrayBuffer());
  };

  for (const kind of ['whip', 'whep'] as const) {
    app.post(`/api/stream/:path/${kind}`, { schema: { tags: ['stream'], summary: `${kind.toUpperCase()} offer (SDP)`, hide: false } }, handler(kind));
    app.patch(`/api/stream/:path/${kind}/:session`, { schema: { hide: true } }, handler(kind));
    app.delete(`/api/stream/:path/${kind}/:session`, { schema: { hide: true } }, handler(kind));
  }

  // ---- MediaMTX auth hook (internal network only) ----------------------------
  app.post('/internal/mediamtx/auth', { schema: { hide: true }, config: { rateLimit: false } }, async (req, reply) => {
    const { secret } = z.object({ secret: z.string().default('') }).parse(req.query);
    const a = Buffer.from(secret);
    const b = Buffer.from(ctx.config.MEDIAMTX_HOOK_SECRET);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      reply.code(401);
      return { ok: false };
    }
    const body = z
      .object({ action: z.string(), path: z.string().default(''), token: z.string().default(''), password: z.string().default(''), protocol: z.string().default(''), ip: z.string().default('') })
      .passthrough()
      .parse(req.body);
    const token = body.token || body.password; // RTSP/RTMP clients may pass the JWT as password
    let allowed = false;
    let reason = 'unsupported_action';
    if (body.action === 'publish' || body.action === 'read') {
      const claims = token ? await verifyStreamToken(ctx.keys.jwtKey, token, body.action === 'publish' ? 'publish' : 'view') : null;
      if (!claims) reason = 'invalid_token';
      else if (body.action === 'publish') {
        allowed = await canPublish(ctx, claims, body.path);
        reason = allowed ? 'ok' : 'publish_denied';
      } else {
        const r = await canRead(ctx, claims, body.path);
        allowed = r.ok;
        reason = r.reason ?? 'ok';
      }
    }
    if (!allowed) {
      req.log.info({ action: body.action, protocol: body.protocol, reason }, 'media auth denied');
      reply.code(401);
      return { ok: false, reason };
    }
    return { ok: true };
  });
}

interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const _test = { activeLink, canPublish, canRead, badRequest };
