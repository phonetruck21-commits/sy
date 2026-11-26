import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { principal, requireUser } from '../auth.js';
import { badRequest } from '../lib/errors.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Activity reports for owners/admins. Date range is inclusive, in Israel time. */
export async function reportRoutes(app: FastifyInstance, ctx: AppContext) {
  const admins = requireUser(ctx, ['owner', 'admin']);

  app.get('/api/reports/summary', { preHandler: admins, schema: { tags: ['reports'], summary: 'דוח פעילות: טכנאים, זמני עבודה, שידורים, אחסון' } }, async (req) => {
    const p = principal(req);
    const q = z.object({ from: day, to: day }).parse(req.query);
    if (q.from > q.to) throw badRequest('תאריך ההתחלה מאוחר מתאריך הסיום');
    const tz = 'Asia/Jerusalem';
    // [from 00:00, to+1 00:00) in Israel time
    const range = [p.tenantId, q.from, q.to, tz];
    const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 + 1;
    if (days > 400) throw badRequest('טווח מקסימלי: 400 ימים');
    /** SQL condition: column falls inside the requested range (params $2 from, $3 to, $4 timezone). */
    const inRange = (col: string) => `${col} >= ($2::date::timestamp AT TIME ZONE $4) AND ${col} < (($3::date + 1)::timestamp AT TIME ZONE $4)`;

    const [totals, techs, statuses, daily, storage] = await Promise.all([
      ctx.db.query(
        `SELECT
           (SELECT count(*)::int FROM jobs WHERE tenant_id = $1 AND ${inRange('created_at')}) AS jobs_created,
           (SELECT count(*)::int FROM jobs WHERE tenant_id = $1 AND ${inRange('closed_at')}) AS jobs_closed,
           (SELECT COALESCE(round(avg(extract(epoch FROM closed_at - started_at)) / 60), 0)::int FROM jobs
              WHERE tenant_id = $1 AND started_at IS NOT NULL AND ${inRange('closed_at')}) AS avg_work_minutes,
           (SELECT count(*)::int FROM stream_sessions WHERE tenant_id = $1 AND ${inRange('started_at')}) AS streams,
           (SELECT COALESCE(round(sum(extract(epoch FROM COALESCE(ended_at, now()) - started_at)) / 60), 0)::int FROM stream_sessions
              WHERE tenant_id = $1 AND ${inRange('started_at')}) AS stream_minutes,
           (SELECT COALESCE(sum(use_count), 0)::int FROM share_links WHERE tenant_id = $1 AND ${inRange('created_at')}) AS link_opens`,
        range,
      ),
      ctx.db.query(
        `SELECT u.id, u.full_name, u.role, u.is_active,
           (SELECT count(*)::int FROM jobs j WHERE j.technician_id = u.id AND ${inRange('j.closed_at')}) AS jobs_closed,
           (SELECT COALESCE(round(sum(extract(epoch FROM j.closed_at - j.started_at)) / 60), 0)::int FROM jobs j
              WHERE j.technician_id = u.id AND j.started_at IS NOT NULL AND ${inRange('j.closed_at')}) AS work_minutes,
           (SELECT count(*)::int FROM jobs j JOIN job_statuses s ON s.tenant_id = j.tenant_id AND s.key = j.status_key
              WHERE j.technician_id = u.id AND NOT s.is_terminal) AS open_jobs,
           (SELECT count(*)::int FROM stream_sessions ss WHERE ss.started_by = u.id AND ${inRange('ss.started_at')}) AS streams,
           (SELECT COALESCE(round(sum(extract(epoch FROM COALESCE(ss.ended_at, now()) - ss.started_at)) / 60), 0)::int FROM stream_sessions ss
              WHERE ss.started_by = u.id AND ${inRange('ss.started_at')}) AS stream_minutes,
           (SELECT count(*)::int FROM media m WHERE m.created_by = u.id AND m.kind = 'photo' AND ${inRange('m.created_at')}) AS photos,
           (SELECT count(*)::int FROM media m WHERE m.created_by = u.id AND m.kind = 'video' AND ${inRange('m.created_at')}) AS videos
         FROM users u WHERE u.tenant_id = $1 ORDER BY u.full_name`,
        range,
      ),
      ctx.db.query(
        `SELECT s.key, s.label, s.is_terminal, count(j.id)::int AS jobs
           FROM job_statuses s LEFT JOIN jobs j ON j.tenant_id = s.tenant_id AND j.status_key = s.key
          WHERE s.tenant_id = $1 GROUP BY s.key, s.label, s.is_terminal, s.sort_order ORDER BY s.sort_order`,
        [p.tenantId],
      ),
      ctx.db.query(
        `SELECT d::date::text AS day,
           (SELECT count(*)::int FROM jobs WHERE tenant_id = $1 AND (created_at AT TIME ZONE $4)::date = d::date) AS created,
           (SELECT count(*)::int FROM jobs WHERE tenant_id = $1 AND (closed_at AT TIME ZONE $4)::date = d::date) AS closed
         FROM generate_series($2::date, $3::date, interval '1 day') d ORDER BY d`,
        range,
      ),
      ctx.db.query(
        `SELECT kind, count(*)::int AS files, COALESCE(sum(size_bytes),0)::bigint AS bytes FROM media WHERE tenant_id = $1 GROUP BY kind`,
        [p.tenantId],
      ),
    ]);
    return {
      range: { from: q.from, to: q.to, timezone: tz },
      totals: totals.rows[0],
      technicians: techs.rows,
      statuses: statuses.rows,
      daily: daily.rows,
      storage: storage.rows.map((r) => ({ kind: r.kind, files: r.files, mb: Math.round((Number(r.bytes) / 1024 / 1024) * 10) / 10 })),
    };
  });
}
