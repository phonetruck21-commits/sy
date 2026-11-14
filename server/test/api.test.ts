import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import type { BuiltApp } from '../src/app.js';
import { runRetention } from '../src/services/retention.js';
import { HOOK_SECRET, auth, createJob, fakeMtx, makeApp, resetDb, signup } from './helpers.js';

let built: BuiltApp;
let app: BuiltApp['app'];

beforeAll(async () => {
  await resetDb();
  built = await makeApp();
  app = built.app;
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  fakeMtx.paths.clear();
  fakeMtx.kicked.length = 0;
});

const streamPathOf = async (jobId: string) => (await built.ctx.db.query('SELECT stream_path FROM jobs WHERE id = $1', [jobId])).rows[0].stream_path as string;
const hook = (body: object, secret = HOOK_SECRET) => app.inject({ method: 'POST', url: `/internal/mediamtx/auth?secret=${secret}`, payload: body });

describe('auth', () => {
  it('signup, login, me, logout', async () => {
    const { email } = await signup(app, 'auth-flow');
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'Sup3r-Secret-Pass' } });
    expect(login.statusCode).toBe(200);
    const token = login.json().token;
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth(token) });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.role).toBe('owner');
    expect(me.json().plan.id).toBe('pilot');
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: auth(token) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth(token) })).statusCode).toBe(401);
  });

  it('rejects requests without a valid token', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/jobs' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/jobs', headers: auth('garbage') })).statusCode).toBe(401);
  });

  it('locks the account after 5 failed logins', async () => {
    const { email } = await signup(app, 'lockout');
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'wrong-password' }, remoteAddress: `10.0.0.${i}` });
      expect(r.statusCode).toBe(401);
    }
    const locked = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'Sup3r-Secret-Pass' }, remoteAddress: '10.0.1.1' });
    expect(locked.statusCode).toBe(423);
  });

  it('technicians cannot manage users', async () => {
    const { token } = await signup(app, 'rbac');
    const create = await app.inject({ method: 'POST', url: '/api/users', headers: auth(token), payload: { email: 'tech@rbac.test', fullName: 'טכנאי', role: 'technician', password: 'Tech-Pass-12345' } });
    expect(create.statusCode).toBe(201);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'tech@rbac.test', password: 'Tech-Pass-12345' } });
    const techToken = login.json().token;
    const res = await app.inject({ method: 'POST', url: '/api/users', headers: auth(techToken), payload: { email: 'x@rbac.test', fullName: 'x', role: 'technician', password: 'Tech-Pass-12345' } });
    expect(res.statusCode).toBe(403);
  });
});

describe('tenant isolation', () => {
  it('a business cannot see or act on another business data', async () => {
    const a = await signup(app, 'iso-a');
    const b = await signup(app, 'iso-b');
    const job = await createJob(app, a.token);
    const cust = await app.inject({ method: 'POST', url: '/api/customers', headers: auth(a.token), payload: { fullName: 'לקוח א', phone: '050-1112233' } });
    expect(cust.statusCode).toBe(201);

    expect((await app.inject({ method: 'GET', url: `/api/jobs/${job.id}`, headers: auth(b.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: `/api/jobs/${job.id}`, headers: auth(b.token), payload: { summary: 'x' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/share-links`, headers: auth(b.token), payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/stream/start`, headers: auth(b.token), payload: {} })).statusCode).toBe(404);
    const listB = await app.inject({ method: 'GET', url: '/api/jobs', headers: auth(b.token) });
    expect(listB.json()).toHaveLength(0);
    const custB = await app.inject({ method: 'GET', url: '/api/customers?q=לקוח', headers: auth(b.token) });
    expect(custB.json()).toHaveLength(0);
    // B cannot attach A's customer to its own job
    const jobB = await createJob(app, b.token);
    const steal = await app.inject({ method: 'PATCH', url: `/api/jobs/${jobB.id}`, headers: auth(b.token), payload: { customerId: cust.json().id } });
    expect(steal.statusCode).toBe(400);
  });

  it('stores customer phone encrypted and finds it by exact phone', async () => {
    const a = await signup(app, 'pii');
    await app.inject({ method: 'POST', url: '/api/customers', headers: auth(a.token), payload: { fullName: 'פרטי', phone: '+972-54-7654321' } });
    const raw = await built.ctx.db.query("SELECT phone_enc FROM customers WHERE full_name = 'פרטי'");
    expect(raw.rows[0].phone_enc).not.toContain('7654321');
    const found = await app.inject({ method: 'GET', url: '/api/customers?q=054-7654321', headers: auth(a.token) });
    expect(found.json()[0].phone).toBe('0547654321');
  });

  it('never exposes stream_path in job APIs', async () => {
    const a = await signup(app, 'nopath');
    const job = await createJob(app, a.token);
    expect(job.stream_path).toBeUndefined();
    const detail = await app.inject({ method: 'GET', url: `/api/jobs/${job.id}`, headers: auth(a.token) });
    expect(detail.body).not.toContain(await streamPathOf(job.id));
  });
});

describe('streaming + share links', () => {
  it('requires recorded consent before streaming or sharing', async () => {
    const a = await signup(app, 'consent');
    const job = await createJob(app, a.token, false);
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/stream/start`, headers: auth(a.token), payload: {} })).statusCode).toBe(412);
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/share-links`, headers: auth(a.token), payload: {} })).statusCode).toBe(412);
    const c = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/consent`, headers: auth(a.token), payload: { streaming: true, recording: true, method: 'טופס חתום' } });
    expect(c.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/stream/start`, headers: auth(a.token), payload: {} })).statusCode).toBe(200);
  });

  it('publish token only authorises its own path; media hook enforces it', async () => {
    const a = await signup(app, 'publish');
    const job1 = await createJob(app, a.token);
    const job2 = await createJob(app, a.token);
    const start = await app.inject({ method: 'POST', url: `/api/jobs/${job1.id}/stream/start`, headers: auth(a.token), payload: { width: 1920, height: 1080 } });
    const { token } = start.json();
    const p1 = await streamPathOf(job1.id);
    const p2 = await streamPathOf(job2.id);
    expect((await hook({ action: 'publish', path: p1, token, protocol: 'webrtc' })).statusCode).toBe(200);
    expect((await hook({ action: 'publish', path: p2, token, protocol: 'webrtc' })).statusCode).toBe(401);
    expect((await hook({ action: 'read', path: p1, token, protocol: 'webrtc' })).statusCode).toBe(401); // publish token cannot read
    expect((await hook({ action: 'publish', path: p1, token, protocol: 'webrtc' }, 'wrong-secret-xxxxxxxxxx')).statusCode).toBe(401);
    expect((await hook({ action: 'api', path: '', token })).statusCode).toBe(401);
    // the proxy rejects WHIP to a foreign path before reaching the media server
    const proxied = await app.inject({ method: 'POST', url: `/api/stream/${p2}/whip`, headers: { ...auth(token), 'content-type': 'application/sdp' }, payload: 'v=0' });
    expect(proxied.statusCode).toBe(403);
  });

  it('share link: view session, PIN, viewer limit, revoke, close', async () => {
    const a = await signup(app, 'share');
    const job = await createJob(app, a.token);
    const path = await streamPathOf(job.id);
    const link = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/share-links`, headers: auth(a.token), payload: { expiresInMinutes: 60, pin: '4321', maxViewers: 2 } });
    expect(link.statusCode).toBe(201);
    const url: string = link.json().url;
    expect(url.startsWith('https://live.example.test/v/')).toBe(true);
    const viewToken = url.split('/v/')[1];
    expect(viewToken.length).toBeGreaterThanOrEqual(43); // 256 bit

    const noPin = await app.inject({ method: 'POST', url: '/api/view/session', payload: { token: viewToken } });
    expect(noPin.statusCode).toBe(401);
    expect(noPin.json().error).toBe('pin_required');
    expect((await app.inject({ method: 'POST', url: '/api/view/session', payload: { token: viewToken, pin: '0000' } })).statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/view/session', payload: { token: viewToken, pin: '4321' } });
    expect(ok.statusCode).toBe(200);
    const { viewerToken, whepUrl } = ok.json();
    expect(whepUrl).toBe(`/api/stream/${path}/whep`);

    const status = await app.inject({ method: 'GET', url: '/api/view/status', headers: auth(viewerToken) });
    expect(status.statusCode).toBe(200);
    expect(status.json().job.device_type).toBe('iPhone 14');
    expect(status.json().live).toBe(false);
    expect(status.body).not.toContain('phone');

    // read allowed while under the viewer limit, denied at the limit
    expect((await hook({ action: 'read', path, token: viewerToken, protocol: 'webrtc' })).statusCode).toBe(200);
    fakeMtx.paths.set(path, { name: path, ready: true, readyTime: null, readers: [{ type: 'webrtc', id: '1' }, { type: 'webrtc', id: '2' }], tracks: [], bytesReceived: 0, bytesSent: 0 });
    const limited = await hook({ action: 'read', path, token: viewerToken, protocol: 'webrtc' });
    expect(limited.statusCode).toBe(401);
    expect(limited.json().reason).toBe('viewer_limit');
    fakeMtx.paths.clear();

    // a viewer token for one job cannot read another job's stream
    const other = await createJob(app, a.token);
    expect((await hook({ action: 'read', path: await streamPathOf(other.id), token: viewerToken, protocol: 'webrtc' })).statusCode).toBe(401);

    // revoke -> link and already issued viewer token stop working
    await app.inject({ method: 'POST', url: `/api/share-links/${link.json().id}/revoke`, headers: auth(a.token) });
    expect((await app.inject({ method: 'POST', url: '/api/view/session', payload: { token: viewToken, pin: '4321' } })).statusCode).toBe(410);
    expect((await hook({ action: 'read', path, token: viewerToken, protocol: 'webrtc' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/view/status', headers: auth(viewerToken) })).statusCode).toBe(410);
  });

  it('locks a link after 5 wrong PINs', async () => {
    const a = await signup(app, 'pinlock');
    const job = await createJob(app, a.token);
    const link = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/share-links`, headers: auth(a.token), payload: { pin: '1111' } });
    const t = link.json().url.split('/v/')[1];
    for (let i = 0; i < 5; i++) await app.inject({ method: 'POST', url: '/api/view/session', payload: { token: t, pin: '9999' }, remoteAddress: `10.9.0.${i}` });
    expect((await app.inject({ method: 'POST', url: '/api/view/session', payload: { token: t, pin: '1111' } })).statusCode).toBe(410);
  });

  it('closing a job revokes links, ends the stream and blocks publishing', async () => {
    const a = await signup(app, 'close');
    const job = await createJob(app, a.token);
    const path = await streamPathOf(job.id);
    const { token } = (await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/stream/start`, headers: auth(a.token), payload: {} })).json();
    const link = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/share-links`, headers: auth(a.token), payload: {} });
    const closed = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/status`, headers: auth(a.token), payload: { status: 'closed' } });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().closed_at).toBeTruthy();
    expect(fakeMtx.kicked).toContain(path);
    expect((await hook({ action: 'publish', path, token, protocol: 'webrtc' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/view/session', payload: { token: link.json().url.split('/v/')[1] } })).statusCode).toBe(410);
    const active = await app.inject({ method: 'GET', url: '/api/streams/active', headers: auth(a.token) });
    expect(active.json()).toHaveLength(0);
  });

  it('enforces the plan concurrent stream limit', async () => {
    const a = await signup(app, 'quota'); // pilot plan: 1 concurrent stream
    const j1 = await createJob(app, a.token);
    const j2 = await createJob(app, a.token);
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${j1.id}/stream/start`, headers: auth(a.token), payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${j2.id}/stream/start`, headers: auth(a.token), payload: {} })).statusCode).toBe(409);
    await app.inject({ method: 'POST', url: `/api/jobs/${j1.id}/stream/stop`, headers: auth(a.token) });
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${j2.id}/stream/start`, headers: auth(a.token), payload: {} })).statusCode).toBe(200);
  });
});

describe('media', () => {
  const multipart = (content: Buffer, mime: string, filename: string) => {
    const boundary = '----sytest' + Math.random().toString(16).slice(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return { body, contentType: `multipart/form-data; boundary=${boundary}` };
  };

  it('uploads, de-duplicates offline retries, serves only to same tenant, and expires by retention', async () => {
    const a = await signup(app, 'media-a');
    const b = await signup(app, 'media-b');
    const job = await createJob(app, a.token);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    const mp = multipart(jpeg, 'image/jpeg', 'x.jpg');
    const up = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/media?clientId=client-abc-123`, headers: { ...auth(a.token), 'content-type': mp.contentType }, payload: mp.body });
    expect(up.statusCode).toBe(201);
    const again = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/media?clientId=client-abc-123`, headers: { ...auth(a.token), 'content-type': mp.contentType }, payload: mp.body });
    expect(again.json().duplicate).toBe(true);
    const id = up.json().id;
    const get = await app.inject({ method: 'GET', url: `/api/media/${id}/content`, headers: auth(a.token) });
    expect(get.statusCode).toBe(200);
    expect(get.rawPayload.equals(jpeg)).toBe(true);
    expect((await app.inject({ method: 'GET', url: `/api/media/${id}/content`, headers: auth(b.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/media/${id}/content` })).statusCode).toBe(401);

    const bad = multipart(Buffer.from('MZ'), 'application/x-msdownload', 'evil.exe');
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/media`, headers: { ...auth(a.token), 'content-type': bad.contentType }, payload: bad.body })).statusCode).toBe(400);

    // retention: age the file beyond the tenant policy and sweep
    await built.ctx.db.query("UPDATE media SET created_at = now() - interval '40 days' WHERE id = $1", [id]);
    const res = await runRetention(built.ctx.db, built.storage);
    expect(res.media).toBeGreaterThanOrEqual(1);
    expect((await app.inject({ method: 'GET', url: `/api/media/${id}/content`, headers: auth(a.token) })).statusCode).toBe(404);
  });

  it('refuses uploads without recording consent', async () => {
    const a = await signup(app, 'media-consent');
    const job = await createJob(app, a.token, false);
    const mp = multipart(Buffer.from([0xff, 0xd8]), 'image/jpeg', 'x.jpg');
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/media`, headers: { ...auth(a.token), 'content-type': mp.contentType }, payload: mp.body })).statusCode).toBe(412);
  });

  it('storage driver rejects path traversal', async () => {
    await expect(built.storage.put('../etc/passwd', Readable.from([Buffer.from('x')]), 10)).rejects.toThrow();
  });
});

describe('system', () => {
  it('health endpoint and API docs', async () => {
    const h = await app.inject({ method: 'GET', url: '/api/health' });
    expect(h.json().db).toBe(true);
    const docs = await app.inject({ method: 'GET', url: '/api/docs/json' });
    expect(docs.statusCode).toBe(200);
    expect(Object.keys(docs.json().paths).length).toBeGreaterThan(20);
  });
});
