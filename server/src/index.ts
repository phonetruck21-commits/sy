import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { migrate } from './db.js';
import { runRetention } from './services/retention.js';

async function main() {
  const config = loadConfig();
  const { app, ctx, storage } = await buildApp(config);
  await migrate(ctx.db, (m) => app.log.info(m));

  const sweep = () => runRetention(ctx.db, storage, (o, m) => app.log.info(o, m)).catch((err) => app.log.error({ err }, 'retention failed'));
  const timer = setInterval(sweep, 60 * 60 * 1000);
  setTimeout(sweep, 30_000);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    clearInterval(timer);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
