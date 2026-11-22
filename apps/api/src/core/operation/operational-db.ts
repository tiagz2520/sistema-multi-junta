import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuthSession } from '../../modules/platform/identity/auth-session.js';
import {
  currentSession,
  type IdentityRequest,
} from '../../modules/platform/identity/auth.http.js';
import { TenantUnitOfWork } from '../prisma/tenant-unit-of-work.js';

@Injectable()
export class OperationalDb {
  constructor(private readonly unit: TenantUnitOfWork) {}

  async run<T>(
    request: IdentityRequest,
    requested: string,
    write: boolean,
    handler: (
      tx: Prisma.TransactionClient,
      actor: AuthSession['view'],
    ) => Promise<T>,
  ): Promise<T> {
    const { fingerprint, view } = currentSession(request);
    const { juntaId, rol, ambito } = view;
    if (
      ambito !== 'JUNTA' ||
      !juntaId ||
      juntaId !== requested.toLowerCase() ||
      !rol
    ) {
      throw new ForbiddenException('La sesión no tiene acceso a esa junta.');
    }
    try {
      return await this.unit.run(juntaId, async (tx) => {
        await tx.$queryRaw`SELECT pg_catalog.set_config('app.operacion_huella', ${fingerprint}, true)`;
        if (write) {
          const [lock] = await tx.$queryRaw<{ autorizado: boolean }[]>`
            SELECT multi_junta.op_bloquear(${juntaId}::uuid, ${rol}::text) AS autorizado
          `;
          if (!lock?.autorizado)
            throw new ForbiddenException('El permiso dejó de estar vigente.');
        }
        return handler(tx, view);
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const adapterError = error.meta?.['driverAdapterError'] as
          { cause?: { originalCode?: string } } | undefined;
        const postgresCode =
          adapterError?.cause?.originalCode ?? error.meta?.['code'];
        if (error.code === 'P2002' || postgresCode === '23505') {
          throw new ConflictException('Ya existe un registro con esos datos.');
        }
        if (
          error.code === 'P2003' ||
          postgresCode === '23503' ||
          postgresCode === '23514'
        ) {
          throw new BadRequestException(
            'Los datos no cumplen las relaciones de esta junta.',
          );
        }
        if (postgresCode === '42501')
          throw new ForbiddenException('La operación no está autorizada.');
      }
      throw new ServiceUnavailableException(
        'No fue posible completar la operación.',
      );
    }
  }
}
