import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { TenantUnitOfWork } from '../../../core/prisma/tenant-unit-of-work.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { AuthSession } from '../identity/auth-session.js';
import { runIdentityQuery } from '../identity/auth.repository.js';
import { normalizeUsername } from '../identity/normalize-username.js';
import { hashPassword } from '../identity/password.js';

type Result<T> =
  { data: T } | { error: 'conflict' | 'forbidden' | 'not_found' };
type Estado = 'ACTIVA' | 'INACTIVA';
type RolLocal = 'SECRETARIA' | 'TESORERIA' | 'SOCIO';

interface Junta {
  id: string;
  nombre: string;
  tipo: string;
  ruc: string | null;
  estado: Estado;
}

interface Membresia {
  id: string;
  cuentaId: string;
  usuario: string;
  rol: RolLocal | 'ADMIN_JUNTA';
  estado: Estado;
}

const rolesLocales = ['SECRETARIA', 'TESORERIA', 'SOCIO'] as const;

function bodyFields(
  payload: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BadRequestException();
  }
  if (Object.keys(payload).some((field) => !fields.includes(field))) {
    throw new BadRequestException();
  }
  return payload as Record<string, unknown>;
}

export function offsetValue(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || !/^\d{1,10}$/.test(value)) {
    throw new BadRequestException();
  }
  const offset = Number(value);
  if (offset > 2_147_483_647) throw new BadRequestException();
  return offset;
}

function trimmed(value: unknown, max: number): string {
  if (typeof value !== 'string') throw new BadRequestException();
  const text = value.trim();
  if (!text || Array.from(text).length > max || text.includes('\0')) {
    throw new BadRequestException();
  }
  return text;
}

function optionalRuc(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new BadRequestException();
  const ruc = value.trim();
  if (!ruc) return null;
  if (!/^\d{13}$/.test(ruc)) throw new BadRequestException();
  return ruc;
}

function estadoValue(value: unknown): Estado {
  if (value !== 'ACTIVA' && value !== 'INACTIVA') {
    throw new BadRequestException();
  }
  return value;
}

function isLocalRole(value: unknown): value is RolLocal {
  return rolesLocales.some((role) => role === value);
}

function usernameValue(value: unknown): string {
  if (typeof value !== 'string') throw new BadRequestException();
  try {
    return normalizeUsername(value);
  } catch {
    throw new BadRequestException();
  }
}

@Injectable()
export class ManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly units: TenantUnitOfWork,
  ) {}

  listJuntas(session: AuthSession, offset: number) {
    return this.select<Junta[]>(Prisma.sql`
      SELECT multi_junta.gp_list_juntas(${session.fingerprint}::text, ${offset}::integer) AS result
    `);
  }

  createJunta(session: AuthSession, payload: unknown) {
    const data = bodyFields(payload, ['nombre', 'tipo', 'ruc']);
    const nombre = trimmed(data['nombre'], 120);
    const tipo = trimmed(data['tipo'], 80);
    const ruc = optionalRuc(data['ruc']);
    return this.select<Junta>(
      Prisma.sql`
      SELECT multi_junta.gp_create_junta(${session.fingerprint}::text, ${nombre}::text, ${tipo}::text, ${ruc}::text) AS result
    `,
      'El RUC ya está registrado.',
    );
  }

  juntaDetail(session: AuthSession, juntaId: string) {
    return this.select<Junta & { administradores: Membresia[] }>(Prisma.sql`
      SELECT multi_junta.gp_get_junta(${session.fingerprint}::text, ${juntaId}::uuid) AS result
    `);
  }

  changeJuntaState(session: AuthSession, juntaId: string, payload: unknown) {
    const { estado } = bodyFields(payload, ['estado']);
    const next = estadoValue(estado);
    return this.select<Junta>(Prisma.sql`
      SELECT multi_junta.gp_set_junta_estado(${session.fingerprint}::text, ${juntaId}::uuid, ${next}::text) AS result
    `);
  }

  assignAdmin(session: AuthSession, juntaId: string, payload: unknown) {
    const usuario = usernameValue(bodyFields(payload, ['usuario'])['usuario']);
    return this.createAccount((hash) =>
      this.select<Membresia>(
        Prisma.sql`
      SELECT multi_junta.gp_create_admin(${session.fingerprint}::text, ${juntaId}::uuid, ${usuario}::text, ${hash}::text) AS result
    `,
        'La junta debe estar activa y el nombre de usuario debe estar disponible.',
      ),
    );
  }

  ownJunta(session: AuthSession, requested: string) {
    const junta = this.juntaFor(session, requested);
    return this.select<Junta & { secretariaInicialDisponible: boolean }>(
      Prisma.sql`
      SELECT multi_junta.gp_local_junta(${session.fingerprint}::text, ${junta}::uuid) AS result
    `,
      undefined,
      junta,
    );
  }

  listMemberships(session: AuthSession, requested: string, offset: number) {
    const junta = this.juntaFor(session, requested);
    return this.select<Membresia[]>(
      Prisma.sql`
      SELECT multi_junta.gp_list_membresias(${session.fingerprint}::text, ${junta}::uuid, ${offset}::integer) AS result
    `,
      undefined,
      junta,
    );
  }

  updateMembership(
    session: AuthSession,
    requested: string,
    membershipId: string,
    payload: unknown,
  ) {
    const junta = this.juntaFor(session, requested);
    const { rol, estado } = bodyFields(payload, ['rol', 'estado']);
    if (
      (rol === undefined && estado === undefined) ||
      (rol !== undefined && !isLocalRole(rol))
    ) {
      throw new BadRequestException();
    }
    const next = estado === undefined ? null : estadoValue(estado);
    return this.select<Membresia>(
      Prisma.sql`
      SELECT multi_junta.gp_update_membresia(${session.fingerprint}::text, ${junta}::uuid, ${membershipId}::uuid, ${rol ?? null}::text, ${next}::text) AS result
    `,
      undefined,
      junta,
    );
  }

  createFirstSecretary(
    session: AuthSession,
    requested: string,
    payload: unknown,
  ) {
    const junta = this.juntaFor(session, requested);
    const usuario = usernameValue(bodyFields(payload, ['usuario'])['usuario']);
    return this.createAccount((hash) =>
      this.select<Membresia>(
        Prisma.sql`
      SELECT multi_junta.gp_create_secretaria(${session.fingerprint}::text, ${junta}::uuid, ${usuario}::text, ${hash}::text) AS result
    `,
        'La Secretaría inicial ya existe o el nombre de usuario está en uso.',
        junta,
      ),
    );
  }

  private juntaFor(session: AuthSession, requested: string): string {
    const junta = session.view.juntaId;
    if (!junta || junta !== requested.toLowerCase()) {
      throw new ForbiddenException(
        'La sesión no tiene acceso a la junta solicitada.',
      );
    }
    return junta;
  }

  private async createAccount(create: (hash: string) => Promise<Membresia>) {
    const contrasenaTemporal = randomBytes(24).toString('base64url');
    const hash = await runIdentityQuery(() => hashPassword(contrasenaTemporal));
    const membresia = await create(hash);
    return { membresia, contrasenaTemporal };
  }

  private async select<T>(
    query: Prisma.Sql,
    conflict = 'La operación entra en conflicto con el estado actual.',
    junta?: string,
  ): Promise<T> {
    const execute = (tx: Prisma.TransactionClient) =>
      tx.$queryRaw<{ result: Result<T> }[]>(query);
    const [row] = await runIdentityQuery(() =>
      junta ? this.units.run(junta, execute) : execute(this.prisma.client),
    );

    const result = row?.result;
    if (result && 'data' in result) return result.data;
    if (result?.error === 'conflict') throw new ConflictException(conflict);
    if (result?.error === 'not_found')
      throw new NotFoundException('El recurso solicitado no existe.');
    throw new ForbiddenException('La sesión no puede realizar esta operación.');
  }
}
