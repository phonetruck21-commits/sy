import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(8080),
  DATABASE_URL: z.string().min(1),
  /** Master secret (>= 32 chars). Used to derive JWT signing and field-encryption keys. */
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  /** Public URL customers use to open viewing links, e.g. https://live.example.co.il */
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:8080'),
  /** Internal URL of MediaMTX WebRTC (WHIP/WHEP) HTTP listener. */
  MEDIAMTX_WEBRTC_URL: z.string().url().default('http://127.0.0.1:8889'),
  /** Internal URL of MediaMTX control API. */
  MEDIAMTX_API_URL: z.string().url().default('http://127.0.0.1:9997'),
  /** Shared secret MediaMTX must present when calling our auth hook. */
  MEDIAMTX_HOOK_SECRET: z.string().min(16),
  /** Comma separated list of extra allowed CORS origins (desktop app, dev server). */
  CORS_ORIGINS: z.string().default(''),
  /** JSON array of RTCIceServer objects handed to clients. */
  ICE_SERVERS: z.string().default('[]'),
  MEDIA_DIR: z.string().default('./data/media'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(1024),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  /** Allow creating new businesses from the login screen. Off by default once one exists. */
  ALLOW_SIGNUP: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  WEB_DIST_DIR: z.string().default('../web/dist'),
  LOG_LEVEL: z.string().default('info'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  return parsed.data;
}
