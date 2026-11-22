import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createApplication } from './app.js';

const envFile = new URL('../../../.env', import.meta.url);

if (existsSync(envFile)) {
  loadEnvFile(envFile);
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
