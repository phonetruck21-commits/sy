import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomToken, sha256 } from './lib/crypto.js';
import { forbidden, unauthorized } from './lib/errors.js';
import type { AppContext } from './context.js';

export type Role = 'owner' | 'admin' | 'technician';

export interface Principal {
  userId: string;
  tenantId: string;
  role: Role;
  sessionId: string;
  email: string;
  fullName: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export async function createSession(ctx: AppContext, userId: string, tenantId: string, req: FastifyRequest) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + ctx.config.SESSION_TTL_HOURS * 3600_000);
  await ctx.db.query(
    `INSERT INTO sessions (user_id, tenant_id, token_hash, user_agent, ip, expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, tenantId, sha256(token), (req.headers['user-agent'] ?? '').slice(0, 300), req.ip, expiresAt],
  );
  return { token, expiresAt };
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice(7).trim() || null;
}

/** Resolves the opaque session token into a principal. Sessions are revocable server-side. */
export async function resolvePrincipal(ctx: AppContext, req: FastifyRequest): Promise<Principal | null> {
  const token = bearer(req);
  if (!token || token.length > 200) return null;
  const r = await ctx.db.query(
    `SELECT s.id AS session_id, u.id AS user_id, u.tenant_id, u.role, u.email, u.full_name
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active`,
    [sha256(token)],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    role: row.role,
    sessionId: row.session_id,
    email: row.email,
    fullName: row.full_name,
  };
}

/** Fastify preHandler factory: require an authenticated user, optionally with one of the given roles. */
export function requireUser(ctx: AppContext, roles?: Role[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const p = await resolvePrincipal(ctx, req);
    if (!p) throw unauthorized();
    if (roles && !roles.includes(p.role)) throw forbidden();
    req.principal = p;
  };
}

export function principal(req: FastifyRequest): Principal {
  if (!req.principal) throw unauthorized();
  return req.principal;
}
