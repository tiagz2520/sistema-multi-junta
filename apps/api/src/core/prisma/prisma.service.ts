import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { appRole, appSchema, validatePostgresUrl } from './postgres-url.js';

function getConnectionConfig() {
  const { APP_DATABASE_URL, PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } =
    process.env;
  const options = `-c search_path=${appSchema}`;

  if (APP_DATABASE_URL) {
    return {
      connectionString: validatePostgresUrl(
        APP_DATABASE_URL,
        'APP_DATABASE_URL',
      ),
      options,
    };
  }

  if (!PGHOST || !PGDATABASE || !PGUSER || !PGPASSWORD) {
    throw new Error(
      'Configura APP_DATABASE_URL o las variables PGHOST, PGDATABASE, PGUSER y PGPASSWORD.',
    );
  }

  if (PGUSER !== appRole) {
    throw new Error(`PGUSER debe usar el rol ${appRole}.`);
  }

  const port = PGPORT === undefined ? 5432 : Number(PGPORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PGPORT debe ser un entero entre 1 y 65535.');
  }

  return {
    host: PGHOST,
    port,
    database: PGDATABASE,
    user: PGUSER,
    password: PGPASSWORD,
    options,
  };
}

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private instance?: PrismaClient;

  get client(): PrismaClient {
    if (!this.instance) {
      this.instance = new PrismaClient({
        adapter: new PrismaPg(getConnectionConfig(), { schema: appSchema }),
      });
    }

    return this.instance;
  }

  async onModuleDestroy() {
    await this.instance?.$disconnect();
  }
}
