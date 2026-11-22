import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'prisma/config';

const envFile = new URL('../../.env', import.meta.url);

if (existsSync(envFile)) {
  loadEnvFile(envFile);
}

const connectionString = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(connectionString && { datasource: { url: connectionString } }),
});
