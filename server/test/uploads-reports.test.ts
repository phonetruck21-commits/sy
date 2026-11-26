import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import type { BuiltApp } from '../src/app.js';
import { runRetention } from '../src/services/retention.js';
import { auth, createJob, makeApp, resetDb, signup } from './helpers.js';

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

const put = (token: string, id: string, offset: number, data: Buffer) =>
  app.inject({ method: 'PUT', url: `/api/uploads/${id}?offset=${offset}`, headers: { ...auth(token), 'content-type': 'application/octet-stream' }, payload: data });

describe('resumable uploads', () => {
  it('uploads a recording in chunks, resumes after a drop, rejects bad offsets, and stores it as media', async () => {
    const a = await signup(app, 'up-a');
    const job = await createJob(app, a.token);
    const file = randomBytes(3 * 1024 * 1024 + 123); // 3 chunks of 1MB + tail
    const sha = createHash('sha256').update(file).digest('hex');

    const create = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/uploads`, headers: auth(a.token), payload: { mime: 'video/mp4', size: file.length, clientId: 'rec-0001-abcd' } });
    expect(create.statusCode).toBe(201);
    const { id } = create.json();
    const CH = 1024 * 1024;

    expect((await put(a.token, id, 0, file.subarray(0, CH))).json().received).toBe(CH);
    // duplicate/retried chunk at a stale offset is refused and tells where to continue
    const dup = await put(a.token, id, 0, file.subarray(0, CH));
    expect(dup.statusCode).toBe(409);
    expect(dup.json().details.received).toBe(CH);
    expect((await put(a.token, id, CH, file.subarray(CH, 2 * CH))).statusCode).toBe(200);

    // "app restarted": creating again with the same clientId resumes the same upload
    const resumed = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/uploads`, headers: auth(a.token), payload: { mime: 'video/mp4', size: file.length, clientId: 'rec-0001-abcd' } });
    expect(resumed.json()).toMatchObject({ id, received: 2 * CH, completed: false });

    // completing early fails
    expect((await app.inject({ method: 'POST', url: `/api/uploads/${id}/complete`, headers: auth(a.token) })).statusCode).toBe(409);
    // over-long chunk refused
    expect((await put(a.token, id, 2 * CH, Buffer.alloc(2 * CH))).statusCode).toBe(400);

    let offset = 2 * CH;
    while (offset < file.length) {
      const chunk = file.subarray(offset, offset + CH);
      expect((await put(a.token, id, offset, chunk)).statusCode).toBe(200);
      offset += chunk.length;
    }
    const done = await app.inject({ method: 'POST', url: `/api/uploads/${id}/complete`, headers: auth(a.token) });
    expect(done.statusCode).toBe(201);
    expect(done.json().sha256).toBe(sha);
    const again = await app.inject({ method: 'POST', url: `/api/uploads/${id}/complete`, headers: auth(a.token) });
    expect(again.json().duplicate).toBe(true);

    const content = await app.inject({ method: 'GET', url: `/api/media/${done.json().mediaId}/content`, headers: auth(a.token) });
    expect(content.statusCode).toBe(200);
    expect(createHash('sha256').update(content.rawPayload).digest('hex')).toBe(sha);
    const detail = await app.inject({ method: 'GET', url: `/api/jobs/${job.id}`, headers: auth(a.token) });
    expect(detail.json().media.filter((m: { kind: string }) => m.kind === 'video')).toHaveLength(1);
  });

  it('isolates tenants, requires consent, enforces type, size and quota', async () => {
    const a = await signup(app, 'up-b');
    const b = await signup(app, 'up-c');
    const job = await createJob(app, a.token);
    const c = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/uploads`, headers: auth(a.token), payload: { mime: 'video/webm', size: 10, clientId: 'rec-iso-00001' } });
    const id = c.json().id;
    expect((await put(b.token, id, 0, Buffer.alloc(10))).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/uploads/${id}`, headers: auth(b.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/uploads`, headers: auth(b.token), payload: { mime: 'video/webm', size: 10, clientId: 'rec-iso-00002' } })).statusCode).toBe(404);

    const noConsent = await createJob(app, a.token, false);
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${noConsent.id}/uploads`, headers: auth(a.token), payload: { mime: 'video/mp4', size: 10, clientId: 'rec-nc-000001' } })).statusCode).toBe(412);
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/uploads`, headers: auth(a.token), payload: { mime: 'application/zip', size: 10, clientId: 'rec-zip-00001' } })).statusCode).toBe(400);
    // pilot plan quota is 20 GB
    expect((await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/uploads`, headers: auth(a.token), payload: { mime: 'video/mp4', size: 21 * 1024 ** 3, clientId: 'rec-big-00001' } })).statusCode).toBe(413);
    // abort
    expect((await app.inject({ method: 'DELETE', url: `/api/uploads/${id}`, headers: auth(a.token) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/uploads/${id}`, headers: auth(a.token) })).statusCode).toBe(404);
  });

  it('retention removes abandoned uploads', async () => {
    const a = await signup(app, 'up-d');
    const job = await createJob(app, a.token);
    const { id } = (await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/uploads`, headers: auth(a.token), payload: { mime: 'video/mp4', size: 100, clientId: 'rec-old-00001' } })).json();
    await put(a.token, id, 0, Buffer.alloc(50));
    await built.ctx.db.query("UPDATE uploads SET updated_at = now() - interval '8 days' WHERE id = $1", [id]);
    const r = await runRetention(built.ctx.db, built.storage);
    expect(r.staleUploads).toBeGreaterThanOrEqual(1);
    expect(await built.storage.partSize(`_uploads/${(await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth(a.token) })).json().tenant.id}/${id}.part`)).toBe(0);
  });
});

describe('reports', () => {
  it('summarises jobs, work time and streams per technician, for admins only', async () => {
    const a = await signup(app, 'rep-a');
    const job = await createJob(app, a.token);
    await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/stream/start`, headers: auth(a.token), payload: {} });
    await built.ctx.db.query("UPDATE jobs SET started_at = now() - interval '90 minutes' WHERE id = $1", [job.id]);
    await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/status`, headers: auth(a.token), payload: { status: 'closed' } });
    await createJob(app, a.token);

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const res = await app.inject({ method: 'GET', url: `/api/reports/summary?from=${today}&to=${today}`, headers: auth(a.token) });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.totals).toMatchObject({ jobs_created: 2, jobs_closed: 1, streams: 1 });
    expect(r.totals.avg_work_minutes).toBeGreaterThanOrEqual(89);
    expect(r.technicians[0]).toMatchObject({ jobs_closed: 1, open_jobs: 1, streams: 1 });
    expect(r.daily).toHaveLength(1);
    expect(r.statuses.find((s: { key: string }) => s.key === 'closed').jobs).toBe(1);

    // other tenant sees nothing of it
    const b = await signup(app, 'rep-b');
    const rb = (await app.inject({ method: 'GET', url: `/api/reports/summary?from=${today}&to=${today}`, headers: auth(b.token) })).json();
    expect(rb.totals.jobs_created).toBe(0);
    // technicians cannot read reports
    await app.inject({ method: 'POST', url: '/api/users', headers: auth(a.token), payload: { email: 'tech@rep.test', fullName: 'טכנאי', role: 'technician', password: 'Tech-Pass-12345' } });
    const t = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'tech@rep.test', password: 'Tech-Pass-12345' } })).json().token;
    expect((await app.inject({ method: 'GET', url: `/api/reports/summary?from=${today}&to=${today}`, headers: auth(t) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/api/reports/summary?from=2020-01-01&to=2026-12-31`, headers: auth(a.token) })).statusCode).toBe(400);
  });
});
