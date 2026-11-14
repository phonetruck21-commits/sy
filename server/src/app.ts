import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';
import type { AppContext } from './context.js';
import { createPool } from './db.js';
import { Keyring } from './lib/crypto.js';
import { MediaMtxClient } from './lib/mediamtx.js';
import { HttpError } from './lib/errors.js';
import { LocalStorage, type MediaStorage } from './services/storage.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { jobRoutes } from './routes/jobs.js';
import { streamRoutes } from './routes/stream.js';
import { mediaRoutes } from './routes/media.js';

const TAURI_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
  storage: MediaStorage;
}

export async function buildApp(config: Config): Promise<BuiltApp> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.token', 'body.pin'], remove: true },
      ...(config.NODE_ENV === 'test' ? { level: 'warn' } : {}),
    },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });

  const ctx: AppContext = {
    config,
    db: createPool(config.DATABASE_URL),
    keys: new Keyring(config.APP_SECRET),
    mtx: new MediaMtxClient(config.MEDIAMTX_API_URL),
  };
  const storage = new LocalStorage(path.resolve(config.MEDIA_DIR));
  app.addHook('onClose', async () => ctx.db.end());

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    // Customer viewer page needs camera-free but autoplay-capable embedding; nothing else special
    crossOriginEmbedderPolicy: false,
  });
  const extraOrigins = config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || TAURI_ORIGINS.includes(origin) || extraOrigins.includes(origin)),
    exposedHeaders: ['Location', 'ETag', 'Accept-Patch'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5 } });
  await app.register(swagger, {
    openapi: {
      info: { title: 'S.Y LIVE SERVICE API', version: '0.1.0', description: 'API לניהול עבודות שירות, שידור חי וקישורי צפייה. אימות: Authorization: Bearer <session token>.' },
      components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
      security: [{ bearer: [] }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs', staticCSP: true });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'validation_error', message: err.issues[0]?.message ?? 'קלט לא תקין', issues: err.issues });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) return reply.code(429).send({ error: 'too_many_requests', message: 'יותר מדי בקשות. נסו שוב בעוד דקה.' });
    if (status && status < 500) return reply.code(status).send({ error: 'bad_request', message: (err as Error).message });
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'internal_error', message: 'שגיאה פנימית בשרת' });
  });

  app.get('/api/health', { schema: { tags: ['system'], summary: 'בדיקת תקינות' } }, async (_req, reply) => {
    const db = await ctx.db.query('SELECT 1').then(() => true).catch(() => false);
    const mediaServer = await ctx.mtx.healthy();
    if (!db) reply.code(503);
    return { ok: db, db, mediaServer, version: '0.1.0', time: new Date().toISOString() };
  });

  await authRoutes(app, ctx);
  await adminRoutes(app, ctx);
  await jobRoutes(app, ctx);
  await streamRoutes(app, ctx);
  await mediaRoutes(app, ctx, storage);

  // Serve the built web app (technician console, admin, customer viewer) with SPA fallback
  const webDist = path.resolve(config.WEB_DIST_DIR);
  if (existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false, index: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/internal/')) {
        return reply.code(404).send({ error: 'not_found', message: 'לא נמצא' });
      }
      const file = req.url.split('?')[0];
      if (/\.[a-z0-9]+$/i.test(file) && !file.endsWith('.html')) {
        return reply.sendFile(file.slice(1), { maxAge: '7d', immutable: file.startsWith('/assets/') });
      }
      reply.header('Cache-Control', 'no-store');
      return reply.sendFile('index.html');
    });
  } else {
    app.log.warn({ webDist }, 'web dist not found - UI will not be served (run: npm run build -w web)');
  }

  return { app, ctx, storage };
}
