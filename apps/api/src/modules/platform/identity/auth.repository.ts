import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  AmbitoSesion,
  CodigoRol,
  Estado,
  Prisma,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';

interface CredentialRow {
  cuenta_id: string;
  hash_contrasena: string;
  version_acceso: number;
  estado: Estado;
}

interface SessionRow {
  cuenta_id: string;
  junta_id: string | null;
  membresia_id: string | null;
  ambito: AmbitoSesion;
  rol: CodigoRol | null;
  requiere_cambio: boolean;
}

interface ContextRow {
  junta_id: string;
  nombre: string;
  rol: CodigoRol;
}

interface MembershipRow {
  cuenta_id: string;
  junta_id: string;
  membresia_id: string;
  rol: CodigoRol;
}

export async function runIdentityQuery<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch {
    throw new ServiceUnavailableException(
      'El servicio de autenticación no está disponible.',
    );
  }
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prismaService: PrismaService) {}

  allowAttempt(usernameHash: string, ipHash: string) {
    return this
      .decision`SELECT multi_junta.auth_attempt(${usernameHash}::text, ${ipHash}::text) AS allowed`;
  }

  async findCredential(username: string) {
    const rows = await this
      .query<CredentialRow>`SELECT * FROM multi_junta.auth_credential(${username}::text)`;
    return rows[0];
  }

  startSession(
    cuentaId: string,
    version: number,
    newFingerprint: string,
    idleSeconds: number,
    absoluteSeconds: number,
  ) {
    return this
      .decision`SELECT multi_junta.auth_start(${cuentaId}::uuid, ${version}::integer, ${newFingerprint}::text, ${idleSeconds}::integer, ${absoluteSeconds}::integer) AS allowed`;
  }

  async validateSession(fingerprint: string, idleSeconds: number) {
    const rows = await this
      .query<SessionRow>`SELECT * FROM multi_junta.auth_validate(${fingerprint}::text, ${idleSeconds}::integer)`;
    return rows[0];
  }

  listContexts(fingerprint: string) {
    return this
      .query<ContextRow>`SELECT * FROM multi_junta.auth_contexts(${fingerprint}::text)`;
  }

  switchSession(
    fingerprint: string,
    newFingerprint: string,
    juntaId: string | null,
    idleSeconds: number,
  ) {
    return this
      .decision`SELECT multi_junta.auth_switch(${fingerprint}::text, ${newFingerprint}::text, ${juntaId}::uuid, ${idleSeconds}::integer) AS allowed`;
  }

  logout(fingerprint: string) {
    return this
      .decision`SELECT multi_junta.auth_logout(${fingerprint}::text) AS allowed`;
  }

  async ownCredential(fingerprint: string) {
    const rows = await this
      .query<CredentialRow>`SELECT * FROM multi_junta.auth_own_credential(${fingerprint}::text)`;
    return rows[0];
  }

  changePassword(fingerprint: string, version: number, newHash: string) {
    return this
      .decision`SELECT multi_junta.auth_password(${fingerprint}::text, ${version}::integer, ${newHash}::text) AS allowed`;
  }

  async ownMembership(tx: Prisma.TransactionClient, fingerprint: string) {
    const rows = await tx.$queryRaw<
      MembershipRow[]
    >`SELECT * FROM multi_junta.auth_membership(${fingerprint}::text)`;
    return rows[0];
  }

  private query<T>(strings: TemplateStringsArray, ...params: unknown[]) {
    return runIdentityQuery(() =>
      this.prismaService.client.$queryRaw<T[]>(strings, ...params),
    );
  }

  private async decision(strings: TemplateStringsArray, ...params: unknown[]) {
    const rows = await this.query<{ allowed: boolean }>(strings, ...params);
    return rows[0]?.allowed === true;
  }
}
