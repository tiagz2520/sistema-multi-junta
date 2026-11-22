import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { OperationalDb } from '../../core/operation/operational-db.js';
import type { IdentityRequest } from '../platform/identity/auth.http.js';
import {
  activityInput,
  attendanceInput,
  decisionInput,
  justificationInput,
} from './administration-input.js';

type Marca = 'PRESENTE' | 'AUSENTE' | 'JUSTIFICADO';

interface Activity {
  id: string;
  tipo: 'ASAMBLEA' | 'MINGA';
  titulo: string;
  inicio: Date;
  fin: Date;
  lugar: string;
  estado: 'ABIERTA' | 'CERRADA';
}

interface Attendance {
  id: string;
  socioId: string;
  nombres: string;
  apellidos: string;
  estado: Marca | null;
}

interface Justification {
  id: string;
  motivo: string;
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
  motivoDecision: string | null;
  creadaEn: Date | string;
  decididaEn: Date | string | null;
}

interface ActivityDetail extends Activity {
  participantes: Array<
    Attendance & {
      historial: Array<{
        id: string;
        estadoAnterior: Marca | null;
        estadoResultante: Marca;
        motivo: string | null;
        ocurridoEn: string;
      }>;
      justificaciones: Justification[];
    }
  >;
}

const activityFields = Prisma.sql`id, tipo, titulo, inicio, fin, lugar, estado`;
const attendanceFields = Prisma.sql`id, socio_id AS "socioId", nombres, apellidos, estado`;
const justificationFields = Prisma.sql`id, motivo, estado, motivo_decision AS "motivoDecision",
  creada_en AS "creadaEn", decidida_en AS "decididaEn"`;

function verifyPeriod(start: Date, end: Date) {
  if (end <= start)
    throw new BadRequestException('El fin debe ser posterior al inicio.');
}

async function activityById(
  tx: Prisma.TransactionClient,
  juntaId: string,
  id: string,
) {
  const [activity] = await tx.$queryRaw<Activity[]>`
    SELECT ${activityFields} FROM multi_junta.actividad WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid
  `;
  if (!activity) throw new NotFoundException('Actividad no encontrada.');
  return activity;
}

async function attendanceByParticipant(
  tx: Prisma.TransactionClient,
  juntaId: string,
  id: string,
  socioId: string,
) {
  const [attendance] = await tx.$queryRaw<Attendance[]>`
    SELECT ${attendanceFields} FROM multi_junta.asistencia
    WHERE junta_id = ${juntaId}::uuid AND actividad_id = ${id}::uuid AND socio_id = ${socioId}::uuid
  `;
  if (!attendance)
    throw new NotFoundException('Participante no encontrado en la actividad.');
  return attendance;
}

async function recordMark(
  tx: Prisma.TransactionClient,
  juntaId: string,
  prior: Attendance,
  state: Marca,
  reason: string | undefined,
) {
  if (prior.estado === state) return prior;
  if (prior.estado !== null && !reason)
    throw new BadRequestException('La corrección requiere un motivo.');

  const [updated] = await tx.$queryRaw<Attendance[]>`
    UPDATE multi_junta.asistencia SET estado = ${state}
    WHERE junta_id = ${juntaId}::uuid AND id = ${prior.id}::uuid RETURNING ${attendanceFields}
  `;
  await tx.$executeRaw`
    INSERT INTO multi_junta.historial_asistencia (junta_id, asistencia_id, estado_anterior, estado_resultante, motivo)
    VALUES (${juntaId}::uuid, ${prior.id}::uuid, ${prior.estado}, ${state}, ${reason ?? null})
  `;
  return updated;
}

@Injectable()
export class ActivityService {
  constructor(private readonly db: OperationalDb) {}

  list(request: IdentityRequest, juntaId: string) {
    return this.db.run(
      request,
      juntaId,
      false,
      (tx, actor) => tx.$queryRaw<Activity[]>`
      SELECT ${activityFields} FROM multi_junta.actividad
      WHERE junta_id = ${juntaId}::uuid AND (${actor.rol === 'SECRETARIA'} OR estado = 'CERRADA')
      ORDER BY inicio DESC, id
    `,
    );
  }

  detail(request: IdentityRequest, juntaId: string, id: string) {
    return this.db.run(request, juntaId, false, async (tx) => {
      const [activity] = await tx.$queryRaw<ActivityDetail[]>`
        SELECT ${activityFields}, coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', a.id, 'socioId', a.socio_id, 'nombres', a.nombres, 'apellidos', a.apellidos, 'estado', a.estado,
            'historial', coalesce((
              SELECT jsonb_agg(jsonb_build_object(
                'id', h.id, 'estadoAnterior', h.estado_anterior, 'estadoResultante', h.estado_resultante,
                'motivo', h.motivo, 'ocurridoEn', h.ocurrido_en
              ) ORDER BY h.ocurrido_en, h.id)
              FROM multi_junta.historial_asistencia AS h WHERE h.junta_id = a.junta_id AND h.asistencia_id = a.id
            ), '[]'::jsonb),
            'justificaciones', coalesce((
              SELECT jsonb_agg(jsonb_build_object(
                'id', j.id, 'motivo', j.motivo, 'estado', j.estado, 'motivoDecision', j.motivo_decision,
                'creadaEn', j.creada_en, 'decididaEn', j.decidida_en
              ) ORDER BY j.creada_en, j.id)
              FROM multi_junta.justificacion AS j WHERE j.junta_id = a.junta_id AND j.asistencia_id = a.id
            ), '[]'::jsonb)
          ) ORDER BY a.apellidos, a.nombres, a.id)
          FROM multi_junta.asistencia AS a WHERE a.junta_id = act.junta_id AND a.actividad_id = act.id
        ), '[]'::jsonb) AS participantes
        FROM multi_junta.actividad AS act WHERE act.junta_id = ${juntaId}::uuid AND act.id = ${id}::uuid
      `;
      if (!activity) throw new NotFoundException('Actividad no encontrada.');
      return activity;
    });
  }

  create(request: IdentityRequest, juntaId: string, payload: unknown) {
    const data = activityInput(payload);
    verifyPeriod(data.inicio!, data.fin!);
    return this.db.run(request, juntaId, true, async (tx) => {
      const [activity] = await tx.$queryRaw<Activity[]>`
        INSERT INTO multi_junta.actividad (junta_id, tipo, titulo, inicio, fin, lugar)
        VALUES (${juntaId}::uuid, ${data.tipo}, ${data.titulo}, ${data.inicio}, ${data.fin}, ${data.lugar})
        RETURNING ${activityFields}
      `;
      await tx.$executeRaw`
        INSERT INTO multi_junta.asistencia (junta_id, actividad_id, socio_id, nombres, apellidos)
        SELECT junta_id, ${activity.id}::uuid, id, nombres, apellidos FROM multi_junta.socio
        WHERE junta_id = ${juntaId}::uuid AND estado = 'ACTIVA'
      `;
      return activity;
    });
  }

  update(
    request: IdentityRequest,
    juntaId: string,
    id: string,
    payload: unknown,
  ) {
    const data = activityInput(payload, true);
    return this.db.run(request, juntaId, true, async (tx) => {
      const prior = await activityById(tx, juntaId, id);
      if (prior.estado === 'CERRADA')
        throw new ConflictException(
          'La ficha de una actividad cerrada se conserva.',
        );
      const inicio = data.inicio ?? prior.inicio;
      const fin = data.fin ?? prior.fin;
      verifyPeriod(inicio, fin);
      const [updated] = await tx.$queryRaw<Activity[]>`
        UPDATE multi_junta.actividad SET tipo = ${data.tipo ?? prior.tipo}, titulo = ${data.titulo ?? prior.titulo},
          inicio = ${inicio}, fin = ${fin}, lugar = ${data.lugar ?? prior.lugar}
        WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid RETURNING ${activityFields}
      `;
      return updated;
    });
  }

  close(request: IdentityRequest, juntaId: string, id: string) {
    return this.db.run(request, juntaId, true, async (tx) => {
      const prior = await activityById(tx, juntaId, id);
      if (prior.estado === 'CERRADA') return prior;
      const [unmarked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM multi_junta.asistencia
        WHERE junta_id = ${juntaId}::uuid AND actividad_id = ${id}::uuid AND estado IS NULL LIMIT 1
      `;
      if (unmarked)
        throw new ConflictException(
          'Registra todas las asistencias antes de cerrar.',
        );
      const [closed] = await tx.$queryRaw<Activity[]>`
        UPDATE multi_junta.actividad SET estado = 'CERRADA'
        WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid RETURNING ${activityFields}
      `;
      return closed;
    });
  }

  mark(
    request: IdentityRequest,
    juntaId: string,
    id: string,
    socioId: string,
    payload: unknown,
  ) {
    const data = attendanceInput(payload);
    return this.db.run(request, juntaId, true, async (tx) => {
      const attendance = await attendanceByParticipant(
        tx,
        juntaId,
        id,
        socioId,
      );
      return recordMark(tx, juntaId, attendance, data.estado, data.motivo);
    });
  }

  justify(
    request: IdentityRequest,
    juntaId: string,
    id: string,
    socioId: string,
    payload: unknown,
  ) {
    const data = justificationInput(payload);
    return this.db.run(request, juntaId, true, async (tx) => {
      const attendance = await attendanceByParticipant(
        tx,
        juntaId,
        id,
        socioId,
      );
      if (attendance.estado !== 'AUSENTE')
        throw new ConflictException('Registra una ausencia para justificarla.');
      const [created] = await tx.$queryRaw<Justification[]>`
        INSERT INTO multi_junta.justificacion (junta_id, asistencia_id, motivo)
        VALUES (${juntaId}::uuid, ${attendance.id}::uuid, ${data.motivo})
        ON CONFLICT (junta_id, asistencia_id) WHERE estado = 'PENDIENTE' DO NOTHING
        RETURNING ${justificationFields}
      `;
      if (!created)
        throw new ConflictException(
          'La ausencia ya tiene una justificación pendiente.',
        );
      return created;
    });
  }

  decide(
    request: IdentityRequest,
    juntaId: string,
    id: string,
    socioId: string,
    justificationId: string,
    payload: unknown,
  ) {
    const data = decisionInput(payload);
    return this.db.run(request, juntaId, true, async (tx) => {
      const attendance = await attendanceByParticipant(
        tx,
        juntaId,
        id,
        socioId,
      );
      const [prior] = await tx.$queryRaw<Justification[]>`
        SELECT ${justificationFields} FROM multi_junta.justificacion
        WHERE junta_id = ${juntaId}::uuid AND asistencia_id = ${attendance.id}::uuid AND id = ${justificationId}::uuid
      `;
      if (!prior) throw new NotFoundException('Justificación no encontrada.');
      if (prior.estado !== 'PENDIENTE')
        throw new ConflictException('La justificación ya fue decidida.');
      if (data.decision === 'ACEPTADA' && attendance.estado !== 'AUSENTE') {
        throw new ConflictException(
          'La asistencia debe conservar la marca de ausencia.',
        );
      }
      const [updated] = await tx.$queryRaw<Justification[]>`
        UPDATE multi_junta.justificacion SET estado = ${data.decision}, motivo_decision = ${data.motivo},
          decidida_en = statement_timestamp()
        WHERE junta_id = ${juntaId}::uuid AND asistencia_id = ${attendance.id}::uuid
          AND id = ${justificationId}::uuid RETURNING ${justificationFields}
      `;
      if (data.decision === 'ACEPTADA')
        await recordMark(tx, juntaId, attendance, 'JUSTIFICADO', data.motivo);
      return updated;
    });
  }
}
