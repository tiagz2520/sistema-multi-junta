import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';

const membershipMetadata = {
  id: true,
  juntaId: true,
  cuentaId: true,
  rolCodigo: true,
  estado: true,
  versionAcceso: true,
} satisfies Prisma.MembresiaSelect;

@Injectable()
export class MembershipRepository {
  findById(tx: Prisma.TransactionClient, juntaId: string, membresiaId: string) {
    return tx.membresia.findUnique({
      where: { id: membresiaId, juntaId },
      select: membershipMetadata,
    });
  }
}
