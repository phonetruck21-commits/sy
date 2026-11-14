import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { buildApp, type BuiltApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/db.js';
import type { PathInfo } from '../src/lib/mediamtx.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://sylive:sylive_dev@127.0.0.1:5432/sylive_test';
export const HOOK_SECRET = 'test-hook-secret-0123456789';

export async function resetDb() {
  const pool = new pg.Pool({ connectionString: TEST_DB });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  await pool.end();
}

/** Fake MediaMTX state: tests set which paths are online and how many readers they have. */
export const fakeMtx = { paths: new Map<string, PathInfo>(), kicked: [] as string[] };

export async function makeApp(): Promise<BuiltApp> {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    APP_SECRET: 'test-app-secret-that-is-long-enough-0123456789',
    MEDIAMTX_HOOK_SECRET: HOOK_SECRET,
    MEDIA_DIR: mkdtempSync(path.join(os.tmpdir(), 'sy-media-')),
    ALLOW_SIGNUP: 'true',
    WEB_DIST_DIR: '/nonexistent',
    LOG_LEVEL: 'warn',
    PUBLIC_BASE_URL: 'https://live.example.test',
  } as NodeJS.ProcessEnv);
  const built = await buildApp(config);
  built.ctx.mtx.getPath = async (name: string) => fakeMtx.paths.get(name) ?? null;
  built.ctx.mtx.kickPublisher = async (name: string) => void fakeMtx.kicked.push(name);
  built.ctx.mtx.healthy = async () => true;
  return built;
}

let n = 0;
export async function signup(app: BuiltApp['app'], slug?: string) {
  n++;
  const s = slug ?? `biz-${n}-${Date.now() % 100000}`;
  const email = `owner-${s}@example.test`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    remoteAddress: `10.200.${Math.floor(n / 250)}.${n % 250}`,
    payload: { businessName: `עסק ${s}`, slug: s, fullName: 'בעלים', email, password: 'Sup3r-Secret-Pass' },
  });
  if (res.statusCode !== 201) throw new Error(`signup failed: ${res.body}`);
  return { token: res.json().token as string, email };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

export async function createJob(app: BuiltApp['app'], token: string, consent = true) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/jobs',
    headers: auth(token),
    payload: { deviceType: 'iPhone 14', issueDescription: 'מסך שבור', consentStreaming: consent, consentRecording: consent },
  });
  if (res.statusCode !== 201) throw new Error(`job create failed: ${res.body}`);
  return res.json();
}
