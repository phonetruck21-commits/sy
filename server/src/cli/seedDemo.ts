/**
 * Seeds a clearly-marked DEMO business with sample data (all names prefixed with "[דוגמה]").
 * Demo login: demo@sy-live.local / DemoPass-2026 (change or delete in production!)
 */
import { loadConfig } from '../config.js';
import { Keyring, randomToken } from '../lib/crypto.js';
import { createPool, migrate, withTx } from '../db.js';
import { createTenant } from '../services/tenants.js';

const config = loadConfig();
const keys = new Keyring(config.APP_SECRET);
const pool = createPool(config.DATABASE_URL);
await migrate(pool);
const exists = await pool.query("SELECT id FROM tenants WHERE slug = 'demo'");
if (exists.rowCount) {
  console.log('Demo tenant already exists.');
  await pool.end();
  process.exit(0);
}
await withTx(pool, async (c) => {
  const { tenantId, userId } = await createTenant(c, {
    businessName: '[דוגמה] מעבדת סלולר הדגמה', slug: 'demo', ownerEmail: 'demo@sy-live.local', ownerName: '[דוגמה] בעל העסק', password: 'DemoPass-2026', isDemo: true,
  });
  const customers = [
    ['[דוגמה] דנה כהן', '050-0000001'],
    ['[דוגמה] יוסי לוי', '052-0000002'],
  ];
  const ids: string[] = [];
  for (const [name, phone] of customers) {
    const p = phone.replace(/\D/g, '');
    const r = await c.query('INSERT INTO customers (tenant_id, full_name, phone_enc, phone_hash, is_demo) VALUES ($1,$2,$3,$4,true) RETURNING id', [tenantId, name, keys.encrypt(p), keys.blindIndex(p)]);
    ids.push(r.rows[0].id);
  }
  const jobs = [
    [ids[0], 'iPhone 13', 'החלפת מסך שבור', 'repairing'],
    [ids[1], 'מחשב נייד Lenovo', 'המחשב לא נדלק', 'checking'],
  ];
  let n = 1000;
  for (const [cid, device, issue, status] of jobs) {
    await c.query(
      `INSERT INTO jobs (tenant_id, job_number, customer_id, device_type, issue_description, technician_id, status_key, stream_path, consent_streaming_at, consent_recording_at, consent_method, consent_by_user_id, is_demo, started_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), now(), '[דוגמה] הסכמה בעל-פה', $6, true, now())`,
      [tenantId, n++, cid, device, issue, userId, status, 'j_' + randomToken(16).replace(/[^A-Za-z0-9]/g, 'x')],
    );
  }
  await c.query('UPDATE tenants SET next_job_number = $2 WHERE id = $1', [tenantId, n]);
});
console.log('Demo tenant created. Login: demo@sy-live.local / DemoPass-2026');
await pool.end();
