import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'prisma/config';
import { validatePostgresUrl } from './src/core/prisma/postgres-url.ts';

const envFile = new URL('../../.env', import.meta.url);
const migrationUrl =
  process.env.MIGRATION_DATABASE_URL ??
  (existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8')).MIGRATION_DATABASE_URL
    : undefined);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(migrationUrl && {
    datasource: {
      url: validatePostgresUrl(migrationUrl, 'MIGRATION_DATABASE_URL'),
    },
  }),
});
