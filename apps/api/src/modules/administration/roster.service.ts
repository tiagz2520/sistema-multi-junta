import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Estado } from '../../generated/prisma/client.js';
import { OperationalDb } from '../../core/operation/operational-db.js';
import type { IdentityRequest } from '../platform/identity/auth.http.js';
import {
  sectorInput,
  socioFilters,
  socioInput,
} from './administration-input.js';

interface Sector {
  id: string;
  nombre: string;
  clasificacion: string;
  descripcion: string | null;
  estado: Estado;
}

interface Socio {
  id: string;
  cedula?: string;
  nombres: string;
  apellidos: string;
  estado: Estado;
  sectorId: string | null;
}

const sectorFields = Prisma.sql`id, nombre, clasificacion, descripcion, estado`;
function socioFields(includeCedula: boolean) {
  const cedula = includeCedula ? Prisma.sql`, cedula` : Prisma.empty;
  return Prisma.sql`id, nombres, apellidos, estado, sector_id AS "sectorId" ${cedula}`;
}

async function sectorById(
  tx: Prisma.TransactionClient,
  juntaId: string,
  id: string,
) {
  const [sector] = await tx.$queryRaw<Sector[]>`
    SELECT ${sectorFields} FROM multi_junta.sector WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid
  `;
  if (!sector) throw new NotFoundException('Sector no encontrado.');
  return sector;
}

async function socioById(
  tx: Prisma.TransactionClient,
  juntaId: string,
  id: string,
  includeCedula = true,
) {
  const [socio] = await tx.$queryRaw<Socio[]>`
    SELECT ${socioFields(includeCedula)} FROM multi_junta.socio WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid
  `;
  if (!socio) throw new NotFoundException('Socio no encontrado.');
  return socio;
}

async function activeSector(
  tx: Prisma.TransactionClient,
  juntaId: string,
  id: string | null | undefined,
) {
  if (!id) return;
  const [sector] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM multi_junta.sector WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid AND estado = 'ACTIVA'
  `;
  if (!sector)
    throw new BadRequestException(
      'El sector debe estar activo y pertenecer a esta junta.',
    );
}

@Injectable()
export class RosterService {
  constructor(private readonly db: OperationalDb) {}

  listSectors(request: IdentityRequest, juntaId: string) {
    return this.db.run(
      request,
      juntaId,
      false,
      (tx) => tx.$queryRaw<Sector[]>`
      SELECT ${sectorFields} FROM multi_junta.sector WHERE junta_id = ${juntaId}::uuid ORDER BY nombre, id
    `,
    );
  }

  sector(request: IdentityRequest, juntaId: string, id: string) {
    return this.db.run(request, juntaId, false, (tx) =>
      sectorById(tx, juntaId, id),
    );
  }

  sectorMembers(request: IdentityRequest, juntaId: string, id: string) {
    return this.db.run(request, juntaId, false, async (tx) => {
      await sectorById(tx, juntaId, id);
      return tx.$queryRaw<Socio[]>`
        SELECT ${socioFields(true)} FROM multi_junta.socio
        WHERE junta_id = ${juntaId}::uuid AND sector_id = ${id}::uuid ORDER BY apellidos, nombres, id
      `;
    });
  }

  createSector(request: IdentityRequest, juntaId: string, payload: unknown) {
    const data = sectorInput(payload);
    return this.db.run(request, juntaId, true, async (tx) => {
      const [sector] = await tx.$queryRaw<Sector[]>`
        INSERT INTO multi_junta.sector (junta_id, nombre, clasificacion, descripcion, estado)
        VALUES (${juntaId}::uuid, ${data.nombre}, ${data.clasificacion}, ${data.descripcion ?? null},
                ${data.estado ?? 'ACTIVA'}::multi_junta.estado)
        RETURNING ${sectorFields}
      `;
      return sector;
    });
  }

  updateSector(
    request: IdentityRequest,
    juntaId: string,
    id: string,
    payload: unknown,
  ) {
    const data = sectorInput(payload, true);
    return this.db.run(request, juntaId, true, async (tx) => {
      const prior = await sectorById(tx, juntaId, id);
      const [sector] = await tx.$queryRaw<Sector[]>`
        UPDATE multi_junta.sector SET nombre = ${data.nombre ?? prior.nombre},
          clasificacion = ${data.clasificacion ?? prior.clasificacion},
          descripcion = ${data.descripcion === undefined ? prior.descripcion : data.descripcion},
          estado = ${data.estado ?? prior.estado}::multi_junta.estado
        WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid RETURNING ${sectorFields}
      `;
      return sector;
    });
  }

  listSocios(
    request: IdentityRequest,
    juntaId: string,
    query: Parameters<typeof socioFilters>[0],
  ) {
    const { q, estado, sectorId, offset } = socioFilters(query);
    return this.db.run(request, juntaId, false, (tx, actor) => {
      const includeCedula = actor.rol !== 'TESORERIA';
      const stateFilter = estado
        ? Prisma.sql`AND estado = ${estado}::multi_junta.estado`
        : Prisma.empty;
      const sectorFilter = sectorId
        ? Prisma.sql`AND sector_id = ${sectorId}::uuid`
        : Prisma.empty;
      const cedulaFilter =
        q && includeCedula
          ? Prisma.sql`OR strpos(cedula, ${q}) > 0`
          : Prisma.empty;
      const search = q
        ? Prisma.sql`AND (strpos(lower(nombres || ' ' || apellidos), lower(${q})) > 0 ${cedulaFilter})`
        : Prisma.empty;
      return tx.$queryRaw<Socio[]>`
        SELECT ${socioFields(includeCedula)} FROM multi_junta.socio
        WHERE junta_id = ${juntaId}::uuid ${stateFilter} ${sectorFilter} ${search}
        ORDER BY apellidos, nombres, id LIMIT 25 OFFSET ${offset}
      `;
    });
  }

  socio(request: IdentityRequest, juntaId: string, id: string) {
    return this.db.run(request, juntaId, false, (tx, actor) =>
      socioById(tx, juntaId, id, actor.rol !== 'TESORERIA'),
    );
  }

  createSocio(request: IdentityRequest, juntaId: string, payload: unknown) {
    const data = socioInput(payload);
    return this.db.run(request, juntaId, true, async (tx) => {
      await activeSector(tx, juntaId, data.sectorId);
      const [socio] = await tx.$queryRaw<Socio[]>`
        INSERT INTO multi_junta.socio (junta_id, cedula, nombres, apellidos, sector_id, estado)
        VALUES (${juntaId}::uuid, ${data.cedula}, ${data.nombres}, ${data.apellidos},
                ${data.sectorId ?? null}::uuid, ${data.estado ?? 'ACTIVA'}::multi_junta.estado)
        ON CONFLICT (junta_id, cedula) DO NOTHING
        RETURNING ${socioFields(true)}
      `;
      if (!socio)
        throw new ConflictException(
          'La cédula ya está registrada en esta junta.',
        );
      return socio;
    });
  }

  updateSocio(
    request: IdentityRequest,
    juntaId: string,
    id: string,
    payload: unknown,
  ) {
    const data = socioInput(payload, true);
    return this.db.run(request, juntaId, true, async (tx) => {
      const prior = await socioById(tx, juntaId, id);
      const sectorId =
        data.sectorId === undefined ? prior.sectorId : data.sectorId;
      if (sectorId !== prior.sectorId)
        await activeSector(tx, juntaId, sectorId);
      if (data.cedula !== undefined && data.cedula !== prior.cedula) {
        const [duplicate] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM multi_junta.socio WHERE junta_id = ${juntaId}::uuid AND cedula = ${data.cedula}
        `;
        if (duplicate)
          throw new ConflictException(
            'La cédula ya está registrada en esta junta.',
          );
      }
      const [socio] = await tx.$queryRaw<Socio[]>`
        UPDATE multi_junta.socio SET cedula = coalesce(${data.cedula ?? null}::text, cedula),
          nombres = ${data.nombres ?? prior.nombres}, apellidos = ${data.apellidos ?? prior.apellidos},
          sector_id = ${sectorId}::uuid, estado = ${data.estado ?? prior.estado}::multi_junta.estado
        WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid RETURNING ${socioFields(true)}
      `;
      return socio;
    });
  }
}
