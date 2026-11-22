import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { OperationalDb } from '../../core/operation/operational-db.js';
import type { IdentityRequest } from '../platform/identity/auth.http.js';
import {
  financeBody,
  financeDay,
  financeId,
  financeText,
} from '../finance/finance-input.js';

type Tx = Prisma.TransactionClient;

interface ScheduleInput {
  servicioId: string;
  sectorId: string;
  dia: number;
  inicio: string;
  fin: string;
  desde: string;
  hasta: string;
  estado: 'PUBLICADO' | 'ARCHIVADO';
}
type ScheduleRow = ScheduleInput & { id: string };

const timePattern = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

function time(value: unknown): string {
  if (typeof value !== 'string' || !timePattern.test(value))
    throw new BadRequestException('La hora debe tener formato HH:mm.');
  return value;
}
function day(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 7
  )
    throw new BadRequestException(
      'El día debe ser de 1 (lunes) a 7 (domingo).',
    );
  return value;
}
function status(value: unknown): ScheduleInput['estado'] {
  if (value !== 'PUBLICADO' && value !== 'ARCHIVADO')
    throw new BadRequestException('Estado inválido.');
  return value;
}
function validate(
  data: Record<string, unknown>,
  prior?: ScheduleRow,
): ScheduleInput {
  const schedule: ScheduleInput = {
    servicioId:
      data['servicioId'] === undefined && prior
        ? prior.servicioId
        : financeId(data['servicioId'], 'El servicio'),
    sectorId:
      data['sectorId'] === undefined && prior
        ? prior.sectorId
        : financeId(data['sectorId'], 'El sector'),
    dia: data['dia'] === undefined && prior ? prior.dia : day(data['dia']),
    inicio:
      data['inicio'] === undefined && prior
        ? prior.inicio
        : time(data['inicio']),
    fin: data['fin'] === undefined && prior ? prior.fin : time(data['fin']),
    desde:
      data['desde'] === undefined && prior
        ? prior.desde
        : financeDay(data['desde'], 'Desde'),
    hasta:
      data['hasta'] === undefined && prior
        ? prior.hasta
        : financeDay(data['hasta'], 'Hasta'),
    estado:
      data['estado'] === undefined
        ? (prior?.estado ?? 'PUBLICADO')
        : status(data['estado']),
  };
  if (schedule.inicio >= schedule.fin || schedule.desde > schedule.hasta)
    throw new BadRequestException('La franja o vigencia no es válida.');
  return schedule;
}

@Injectable()
export class ScheduleService {
  constructor(private readonly operations: OperationalDb) {}

  services(request: IdentityRequest, junta: string) {
    return this.operations.run(
      request,
      junta,
      false,
      (tx) => tx.$queryRaw`
   SELECT id,nombre,estado FROM multi_junta.horario_servicio
   WHERE junta_id=${junta}::uuid ORDER BY nombre,id
  `,
    );
  }

  createService(request: IdentityRequest, junta: string, payload: unknown) {
    const body = financeBody(payload, ['nombre']);
    const name = financeText(body['nombre'], 'El nombre del servicio', 120);
    return this.operations.run(request, junta, true, async (tx) => {
      const [created] = await tx.$queryRaw<
        { id: string; nombre: string; estado: string }[]
      >`
     INSERT INTO multi_junta.horario_servicio(junta_id,nombre)
     VALUES(${junta}::uuid,${name}) RETURNING id,nombre,estado
   `;
      return created;
    });
  }

  schedules(request: IdentityRequest, junta: string) {
    return this.operations.run(
      request,
      junta,
      false,
      (tx) => tx.$queryRaw`
   SELECT h.id,h.servicio_id AS "servicioId",s.nombre AS servicio,
     h.sector_id AS "sectorId",sec.nombre AS sector,h.dia,
     to_char(h.inicio,'HH24:MI') AS inicio,to_char(h.fin,'HH24:MI') AS fin,
     h.desde::text AS desde,h.hasta::text AS hasta,h.estado,h.creado_en AS "creadoEn"
   FROM multi_junta.horario_semanal h
   JOIN multi_junta.horario_servicio s ON s.junta_id=h.junta_id AND s.id=h.servicio_id
   JOIN multi_junta.sector sec ON sec.junta_id=h.junta_id AND sec.id=h.sector_id
   WHERE h.junta_id=${junta}::uuid ORDER BY h.dia,h.inicio,h.desde,h.id
  `,
    );
  }

  private async ensureReferences(tx: Tx, junta: string, data: ScheduleInput) {
    const [service] = await tx.$queryRaw<{ id: string }[]>`
   SELECT id FROM multi_junta.horario_servicio
   WHERE junta_id=${junta}::uuid AND id=${data.servicioId}::uuid AND estado='ACTIVA'
  `;
    const [sector] = await tx.$queryRaw<{ id: string }[]>`
   SELECT id FROM multi_junta.sector
   WHERE junta_id=${junta}::uuid AND id=${data.sectorId}::uuid AND estado='ACTIVA'
  `;
    if (!service || !sector)
      throw new BadRequestException(
        'El servicio y el sector deben estar activos en la junta.',
      );
  }

  private async ensureNoOverlap(
    tx: Tx,
    junta: string,
    data: ScheduleInput,
    except?: string,
  ) {
    if (data.estado !== 'PUBLICADO') return;
    const [collision] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM multi_junta.horario_semanal
    WHERE junta_id=${junta}::uuid AND sector_id=${data.sectorId}::uuid
      AND dia=${data.dia} AND estado='PUBLICADO'
      AND desde<=${data.hasta}::date AND hasta>=${data.desde}::date
      AND inicio<${data.fin}::time AND fin>${data.inicio}::time
      AND (${except ?? null}::uuid IS NULL OR id<>${except ?? null}::uuid)
    LIMIT 1
  `;
    if (collision)
      throw new ConflictException(
        'La franja se solapa con otro horario publicado del sector.',
      );
  }

  create(request: IdentityRequest, junta: string, payload: unknown) {
    const data = validate(
      financeBody(payload, [
        'servicioId',
        'sectorId',
        'dia',
        'inicio',
        'fin',
        'desde',
        'hasta',
      ]),
    );
    return this.operations.run(request, junta, true, async (tx) => {
      await this.ensureReferences(tx, junta, data);
      await this.ensureNoOverlap(tx, junta, data);
      const [row] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO multi_junta.horario_semanal
      (junta_id,servicio_id,sector_id,dia,inicio,fin,desde,hasta)
    VALUES (${junta}::uuid,${data.servicioId}::uuid,${data.sectorId}::uuid,
      ${data.dia},${data.inicio}::time,${data.fin}::time,
      ${data.desde}::date,${data.hasta}::date)
    RETURNING id
   `;
      return { id: row.id, ...data };
    });
  }

  update(
    request: IdentityRequest,
    junta: string,
    id: string,
    payload: unknown,
  ) {
    const body = financeBody(payload, [
      'servicioId',
      'sectorId',
      'dia',
      'inicio',
      'fin',
      'desde',
      'hasta',
      'estado',
    ]);
    if (Object.keys(body).length === 0)
      throw new BadRequestException('No hay cambios para guardar.');
    return this.operations.run(request, junta, true, async (tx) => {
      const [current] = await tx.$queryRaw<ScheduleRow[]>`
    SELECT id,servicio_id AS "servicioId",sector_id AS "sectorId",dia,
      to_char(inicio,'HH24:MI') AS inicio,to_char(fin,'HH24:MI') AS fin,
      desde::text AS desde,hasta::text AS hasta,estado
    FROM multi_junta.horario_semanal
    WHERE junta_id=${junta}::uuid AND id=${id}::uuid FOR UPDATE
   `;
      if (!current) throw new NotFoundException('No se encontró el horario.');
      const data = validate(body, current);
      await this.ensureReferences(tx, junta, data);
      await this.ensureNoOverlap(tx, junta, data, id);
      const [updated] = await tx.$queryRaw<{ id: string }[]>`
    UPDATE multi_junta.horario_semanal
    SET servicio_id=${data.servicioId}::uuid,sector_id=${data.sectorId}::uuid,
      dia=${data.dia},inicio=${data.inicio}::time,fin=${data.fin}::time,
      desde=${data.desde}::date,hasta=${data.hasta}::date,estado=${data.estado}
    WHERE junta_id=${junta}::uuid AND id=${id}::uuid RETURNING id
   `;
      return { id: updated.id, ...data };
    });
  }
}
