import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createApplication } from './app.js';

const envFile = new URL('../../../.env', import.meta.url);

if (existsSync(envFile)) {
  const localEnv = parseEnv(readFileSync(envFile, 'utf8'));
  const runtimeVariables = [
    'HOST',
    'PORT',
    'APP_DATABASE_URL',
    'PGHOST',
    'PGPORT',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'AUTH_ORIGIN',
    'AUTH_IDLE_SECONDS',
    'AUTH_ABSOLUTE_SECONDS',
  ];
  for (const key of runtimeVariables) {
    if (process.env[key] === undefined && localEnv[key] !== undefined) {
      process.env[key] = localEnv[key];
    }
  }
}

async function bootstrap() {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? '3000');

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un entero entre 1 y 65535.');
  }

  const app = await createApplication();
  app.enableShutdownHooks();
  await app.listen(port, host);
}

await bootstrap();
