import { SignJWT, jwtVerify } from 'jose';

/**
 * Short-lived HS256 tokens that authorise exactly one media action on exactly one stream path.
 * They are verified twice: by our WHIP/WHEP proxy and again by MediaMTX through the auth hook.
 */
export type StreamAudience = 'publish' | 'view';

export interface StreamClaims {
  aud: StreamAudience;
  path: string;
  tid: string; // tenant id
  jid: string; // job id
  sub: string; // user id (publish) or share link id (view)
}

const ISSUER = 'sy-live-service';

export async function signStreamToken(key: Uint8Array, claims: StreamClaims, ttlSeconds: number): Promise<string> {
  return new SignJWT({ path: claims.path, tid: claims.tid, jid: claims.jid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(claims.aud)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}

export async function verifyStreamToken(key: Uint8Array, token: string, aud: StreamAudience): Promise<StreamClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: aud, algorithms: ['HS256'] });
    if (typeof payload.path !== 'string' || typeof payload.tid !== 'string' || typeof payload.jid !== 'string' || !payload.sub) {
      return null;
    }
    return { aud, path: payload.path, tid: payload.tid, jid: payload.jid, sub: payload.sub };
  } catch {
    return null;
  }
}
