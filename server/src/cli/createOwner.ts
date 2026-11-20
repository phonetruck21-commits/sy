/**
 * Creates the first business + owner account from the command line.
 * Usage: npm run create-owner -w server -- --business "מעבדת S.Y" --slug sy-lab --email owner@example.com --name "ישראל ישראלי"
 * The password is read from the SY_OWNER_PASSWORD environment variable (never from argv, to keep it out of shell history).
 */
import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { createPool, migrate, withTx } from '../db.js';
import { createTenant } from '../services/tenants.js';

const { values } = parseArgs({ options: { business: { type: 'string' }, slug: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' } } });
const password = process.env.SY_OWNER_PASSWORD;
if (!values.business || !values.slug || !values.email || !values.name || !password || password.length < 10) {
  console.error('Missing arguments. Required: --business --slug --email --name and env SY_OWNER_PASSWORD (>=10 chars)');
  process.exit(2);
}
const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
await migrate(pool);
const r = await withTx(pool, (c) => createTenant(c, { businessName: values.business!, slug: values.slug!, ownerEmail: values.email!.toLowerCase(), ownerName: values.name!, password }));
console.log(`Created tenant ${r.tenantId} with owner ${values.email}`);
await pool.end();
