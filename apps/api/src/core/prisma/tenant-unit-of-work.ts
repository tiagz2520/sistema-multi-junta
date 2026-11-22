import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantUnitOfWork {
  constructor(private readonly prismaService: PrismaService) {}

  /** Aísla la persistencia para el ámbito de junta que proporciona el servidor. */
  async run<T>(
    juntaId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (
      typeof juntaId !== 'string' ||
      juntaId.length !== 36 ||
      !uuidPattern.test(juntaId)
    ) {
      throw new Error(
        'El contexto requiere un identificador de junta UUID válido.',
      );
    }

    return this.prismaService.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_catalog.set_config('app.junta_id', ${juntaId}, true)`;
      return operation(tx);
    });
  }
}
