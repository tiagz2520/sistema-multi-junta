import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private instance?: PrismaClient;

  get client(): PrismaClient {
    if (!this.instance) {
      const connectionString = process.env.DATABASE_URL;

      if (!connectionString) {
        throw new Error(
          'DATABASE_URL es obligatoria para conectar con PostgreSQL.',
        );
      }

      this.instance = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
      });
    }

    return this.instance;
  }

  async onModuleDestroy() {
    await this.instance?.$disconnect();
  }
}
