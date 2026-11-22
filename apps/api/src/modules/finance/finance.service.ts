import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  expenseFile,
  financeAmount,
  financeBody,
  financeDay,
  financeId,
  financeText,
  type FinanceUpload,
} from './finance-input.js';
import type { ReceiptSnapshot } from './receipt-pdf.js';

type Tx = Prisma.TransactionClient;

interface Candidate {
  asistenciaId: string;
  socioId: string;
  tarifaId: string | null;
  monto: string | null;
}

interface Payment {
  id: string;
  obligacionId: string | null;
  socioId: string;
  monto: string;
  fecha: string;
  metodo: string;
  concepto: string;
  estado: 'REGISTRADO' | 'ANULADO';
}

function found<T>(rows: T[], message: string): T {
  const record = rows[0];
  if (!record) throw new NotFoundException(message);
  return record;
}

function reason(payload: unknown) {
  return financeText(
    financeBody(payload, ['motivo'])['motivo'],
    'El motivo',
    600,
  );
}

const paymentProjection = Prisma.sql`
  id, obligacion_id AS "obligacionId", socio_id AS "socioId", socio_nombre AS "socioNombre",
  concepto, monto::text AS monto, fecha::text AS fecha, metodo, solicitud_id AS "solicitudId",
  estado, numero_comprobante::text AS "numeroComprobante", motivo_anulacion AS "motivoAnulacion"
`;

const expenseProjection = Prisma.sql`
  id, concepto, descripcion, monto::text AS monto, fecha::text AS fecha, beneficiario,
  estado, nombre_archivo AS "nombreArchivo", motivo_anulacion AS "motivoAnulacion"
`;

@Injectable()
export class FinanceService {
  tariffs(tx: Tx, juntaId: string) {
    return tx.$queryRaw`
      SELECT id, tipo, vigente_desde::text AS "vigenteDesde", monto::text AS monto
      FROM multi_junta.tarifa_multa WHERE junta_id = ${juntaId}::uuid
      ORDER BY vigente_desde DESC, tipo, id
    `;
  }

  async createTariff(tx: Tx, juntaId: string, payload: unknown) {
    const { tipo, vigenteDesde, monto } = financeBody(payload, [
      'tipo',
      'vigenteDesde',
      'monto',
    ]);
    if (tipo !== 'ASAMBLEA' && tipo !== 'MINGA') {
      throw new BadRequestException('El tipo debe ser ASAMBLEA o MINGA.');
    }
    const day = financeDay(vigenteDesde, 'La vigencia');
    const amount = financeAmount(monto);
    const [clock] = await tx.$queryRaw<{ today: string }[]>`
      SELECT (statement_timestamp() AT TIME ZONE 'America/Guayaquil')::date::text AS today
    `;
    if (day < clock.today) {
      throw new BadRequestException(
        'La vigencia de una tarifa nueva no puede ser anterior al día de hoy en Ecuador.',
      );
    }
    const [created] = await tx.$queryRaw<unknown[]>`
      INSERT INTO multi_junta.tarifa_multa (junta_id, tipo, vigente_desde, monto)
      VALUES (${juntaId}::uuid, ${tipo}, ${day}::date, ${amount}::numeric)
      ON CONFLICT (junta_id, tipo, vigente_desde) DO NOTHING
      RETURNING id, tipo, vigente_desde::text AS "vigenteDesde", monto::text AS monto
    `;
    if (!created)
      throw new ConflictException(
        'Ya existe una tarifa para ese tipo y fecha.',
      );
    return created;
  }

  fines(tx: Tx, juntaId: string, ids?: string[]) {
    const filter = ids
      ? Prisma.sql`AND o.id = ANY(${ids}::uuid[])`
      : Prisma.empty;
    return tx.$queryRaw<unknown[]>(Prisma.sql`
      SELECT o.id, o.actividad_id AS "actividadId", o.asistencia_id AS "asistenciaId",
        o.socio_id AS "socioId", concat_ws(' ', a.nombres, a.apellidos) AS "socioNombre", o.concepto,
        o.monto::text AS monto, o.estado, o.motivo_anulacion AS "motivoAnulacion",
        o.motivo_revision AS "motivoRevision"
      FROM multi_junta.obligacion o
      JOIN multi_junta.asistencia a ON a.junta_id = o.junta_id AND a.id = o.asistencia_id
      WHERE o.junta_id = ${juntaId}::uuid ${filter}
      ORDER BY o.creada_en DESC, o.id
    `);
  }

  async candidates(tx: Tx, juntaId: string, requestedActivity: unknown) {
    const activityId = financeId(requestedActivity, 'La actividad');
    await this.closedActivity(tx, juntaId, activityId);
    return this.eligibleAbsences(tx, juntaId, activityId);
  }

  async createFines(tx: Tx, juntaId: string, payload: unknown) {
    const { actividadId, asistenciaIds } = financeBody(payload, [
      'actividadId',
      'asistenciaIds',
    ]);
    const activityId = financeId(actividadId, 'La actividad');
    if (!Array.isArray(asistenciaIds) || asistenciaIds.length === 0) {
      throw new BadRequestException('Selecciona al menos una inasistencia.');
    }
    const ids = asistenciaIds.map((value: unknown) =>
      financeId(value, 'La asistencia'),
    );
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'La selección no puede repetir inasistencias.',
      );
    }

    const activity = await this.closedActivity(tx, juntaId, activityId);
    const eligible = await this.eligibleAbsences(tx, juntaId, activityId);
    const byAttendance = new Map(
      eligible.map((candidate) => [candidate.asistenciaId, candidate]),
    );
    const concept = Array.from(`Multa por inasistencia: ${activity.titulo}`)
      .slice(0, 180)
      .join('');
    const values = ids.map((id) => {
      const candidate = byAttendance.get(id);
      if (!candidate)
        throw new ConflictException(
          'La selección incluye una ausencia no elegible o ya multada.',
        );
      if (!candidate.tarifaId || !candidate.monto)
        throw new ConflictException('No hay tarifa vigente para la actividad.');
      return Prisma.sql`(${juntaId}::uuid, ${activityId}::uuid, ${id}::uuid, ${candidate.socioId}::uuid,
        ${candidate.tarifaId}::uuid, ${concept}, ${candidate.monto}::numeric)`;
    });
    const created = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO multi_junta.obligacion (junta_id, actividad_id, asistencia_id, socio_id, tarifa_id, concepto, monto)
      VALUES ${Prisma.join(values)} RETURNING id
    `);
    return this.fines(
      tx,
      juntaId,
      created.map(({ id }) => id),
    );
  }

  async voidFine(tx: Tx, juntaId: string, id: string, payload: unknown) {
    const note = reason(payload);
    const [current] = await tx.$queryRaw<{ estado: string }[]>`
      SELECT estado FROM multi_junta.obligacion WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid
    `;
    if (!current) throw new NotFoundException('No se encontró la obligación.');
    if (current.estado !== 'PENDIENTE')
      throw new ConflictException(
        'Solo puede anularse una obligación íntegra e impaga.',
      );
    await tx.$executeRaw`
      UPDATE multi_junta.obligacion SET estado = 'ANULADA', motivo_anulacion = ${note}
      WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid
    `;
    return found(
      await this.fines(tx, juntaId, [id]),
      'No se encontró la obligación.',
    );
  }

  payments(tx: Tx, juntaId: string) {
    return tx.$queryRaw(Prisma.sql`
      SELECT ${paymentProjection} FROM multi_junta.pago
      WHERE junta_id = ${juntaId}::uuid ORDER BY fecha DESC, numero_comprobante DESC
    `);
  }

  async registerPayment(tx: Tx, juntaId: string, payload: unknown) {
    const data = financeBody(payload, [
      'socioId',
      'obligacionId',
      'concepto',
      'monto',
      'fecha',
      'metodo',
      'solicitudId',
    ]);
    const requestId = financeId(data['solicitudId'], 'La clave de solicitud');
    const obligationId =
      data['obligacionId'] == null
        ? null
        : financeId(data['obligacionId'], 'La obligación');
    if (obligationId && (data['socioId'] != null || data['concepto'] != null)) {
      throw new BadRequestException(
        'La obligación ya determina el socio y el concepto.',
      );
    }
    let socioId = obligationId ? null : financeId(data['socioId'], 'El socio');
    let concept = obligationId
      ? null
      : financeText(data['concepto'], 'El concepto', 180);
    const amount = financeAmount(data['monto']);
    const date = financeDay(data['fecha'], 'La fecha');
    const method = financeText(data['metodo'], 'El método', 80);

    const [existing] = await tx.$queryRaw<Payment[]>(Prisma.sql`
      SELECT ${paymentProjection} FROM multi_junta.pago
      WHERE junta_id = ${juntaId}::uuid AND solicitud_id = ${requestId}::uuid
    `);
    if (existing) {
      if (
        existing.obligacionId !== obligationId ||
        existing.monto !== amount ||
        existing.fecha !== date ||
        existing.metodo !== method ||
        (!obligationId &&
          (existing.socioId !== socioId || existing.concepto !== concept))
      ) {
        throw new ConflictException(
          'La clave de solicitud ya corresponde a otro pago.',
        );
      }
      return existing;
    }
    if (obligationId) {
      const obligation = found(
        await tx.$queryRaw<
          { socioId: string; concepto: string; monto: string; estado: string }[]
        >`
        SELECT socio_id AS "socioId", concepto, monto::text AS monto, estado
        FROM multi_junta.obligacion WHERE junta_id = ${juntaId}::uuid AND id = ${obligationId}::uuid
      `,
        'No se encontró la obligación.',
      );
      if (obligation.estado !== 'PENDIENTE' || obligation.monto !== amount) {
        throw new ConflictException(
          'El pago debe cubrir exactamente una obligación pendiente.',
        );
      }
      socioId = obligation.socioId;
      concept = obligation.concepto;
    }

    const socio = found(
      await tx.$queryRaw<{ nombre: string }[]>`
      SELECT concat_ws(' ', nombres, apellidos) AS nombre FROM multi_junta.socio
      WHERE junta_id = ${juntaId}::uuid AND id = ${socioId}::uuid
    `,
      'No se encontró el socio.',
    );
    const junta = found(
      await tx.$queryRaw<{ nombre: string; ruc: string | null }[]>`
      SELECT nombre, ruc FROM multi_junta.op_junta_datos(${juntaId}::uuid)
    `,
      'No se encontró la junta.',
    );
    const counter = found(
      await tx.$queryRaw<{ number: string }[]>`
      INSERT INTO multi_junta.contador_comprobante (junta_id, ultimo) VALUES (${juntaId}::uuid, 1)
      ON CONFLICT (junta_id) DO UPDATE SET ultimo = contador_comprobante.ultimo + 1
      RETURNING ultimo::text AS number
    `,
      'No se pudo asignar el número del comprobante.',
    );
    const payment = found(
      await tx.$queryRaw<Payment[]>(Prisma.sql`
      INSERT INTO multi_junta.pago (
        junta_id, obligacion_id, socio_id, socio_nombre, junta_nombre, junta_ruc, concepto,
        monto, fecha, metodo, solicitud_id, numero_comprobante
      ) VALUES (
        ${juntaId}::uuid, ${obligationId}::uuid, ${socioId}::uuid, ${socio.nombre}, ${junta.nombre}, ${junta.ruc}, ${concept},
        ${amount}::numeric, ${date}::date, ${method}, ${requestId}::uuid, ${counter.number}::bigint
      ) RETURNING ${paymentProjection}
    `),
      'No se pudo registrar el pago.',
    );
    if (obligationId) {
      await tx.$executeRaw`
        UPDATE multi_junta.obligacion SET estado = 'PAGADA' WHERE junta_id = ${juntaId}::uuid AND id = ${obligationId}::uuid
      `;
    }
    return payment;
  }

  async voidPayment(tx: Tx, juntaId: string, id: string, payload: unknown) {
    const note = reason(payload);
    const current = found(
      await tx.$queryRaw<{ obligacionId: string | null; estado: string }[]>`
      SELECT obligacion_id AS "obligacionId", estado FROM multi_junta.pago WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid
    `,
      'No se encontró el pago.',
    );
    if (current.estado !== 'REGISTRADO')
      throw new ConflictException('El pago ya fue anulado.');

    const payment = found(
      await tx.$queryRaw<Payment[]>(Prisma.sql`
      UPDATE multi_junta.pago SET estado = 'ANULADO', motivo_anulacion = ${note}
      WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid RETURNING ${paymentProjection}
    `),
      'No se encontró el pago.',
    );
    if (current.obligacionId) {
      await tx.$executeRaw`
        UPDATE multi_junta.obligacion
        SET estado = CASE WHEN estado = 'REVISION_PENDIENTE' THEN 'ANULADA' ELSE 'PENDIENTE' END,
            motivo_anulacion = CASE WHEN estado = 'REVISION_PENDIENTE' THEN motivo_revision END
        WHERE junta_id = ${juntaId}::uuid AND id = ${current.obligacionId}::uuid
          AND estado IN ('PAGADA', 'REVISION_PENDIENTE')
      `;
    }
    return payment;
  }

  async receipt(tx: Tx, juntaId: string, id: string) {
    return found(
      await tx.$queryRaw<ReceiptSnapshot[]>`
      SELECT id, estado, motivo_anulacion AS "motivoAnulacion", numero_comprobante::text AS "numeroComprobante",
        junta_nombre AS "juntaNombre", junta_ruc AS "juntaRuc", socio_nombre AS "socioNombre",
        concepto, fecha::text AS fecha, metodo, monto::text AS monto, creado_en AS "creadoEn"
      FROM multi_junta.pago WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid
    `,
      'No se encontró el comprobante.',
    );
  }

  expenses(tx: Tx, juntaId: string) {
    return tx.$queryRaw(Prisma.sql`
      SELECT ${expenseProjection} FROM multi_junta.gasto
      WHERE junta_id = ${juntaId}::uuid ORDER BY fecha DESC, creado_en DESC, id
    `);
  }

  async createExpense(
    tx: Tx,
    juntaId: string,
    payload: unknown,
    uploaded: FinanceUpload | undefined,
  ) {
    const data = financeBody(payload, [
      'concepto',
      'descripcion',
      'monto',
      'fecha',
      'beneficiario',
    ]);
    const concept = financeText(data['concepto'], 'El concepto', 180);
    const description = financeText(data['descripcion'], 'La descripción', 600);
    const amount = financeAmount(data['monto']);
    const date = financeDay(data['fecha'], 'La fecha');
    const beneficiary = financeText(
      data['beneficiario'],
      'El beneficiario',
      180,
    );
    const file = expenseFile(uploaded);
    const [expense] = await tx.$queryRaw<unknown[]>(Prisma.sql`
      INSERT INTO multi_junta.gasto (junta_id, concepto, descripcion, monto, fecha, beneficiario, nombre_archivo, tipo_archivo, archivo)
      VALUES (${juntaId}::uuid, ${concept}, ${description}, ${amount}::numeric, ${date}::date,
        ${beneficiary}, ${file.name}, ${file.mime}, ${file.bytes}::bytea)
      RETURNING ${expenseProjection}
    `);
    return expense;
  }

  async voidExpense(tx: Tx, juntaId: string, id: string, payload: unknown) {
    const note = reason(payload);
    const current = found(
      await tx.$queryRaw<{ estado: string }[]>`
      SELECT estado FROM multi_junta.gasto WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid
    `,
      'No se encontró el gasto.',
    );
    if (current.estado !== 'REGISTRADO')
      throw new ConflictException('El gasto ya fue anulado.');
    return found(
      await tx.$queryRaw<unknown[]>(Prisma.sql`
      UPDATE multi_junta.gasto SET estado = 'ANULADO', motivo_anulacion = ${note}
      WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid RETURNING ${expenseProjection}
    `),
      'No se encontró el gasto.',
    );
  }

  async expenseAttachment(tx: Tx, juntaId: string, id: string) {
    return found(
      await tx.$queryRaw<
        { nombre: string; tipo: string; archivo: Uint8Array }[]
      >`
      SELECT nombre_archivo AS nombre, tipo_archivo AS tipo, archivo FROM multi_junta.gasto
      WHERE junta_id = ${juntaId}::uuid AND id = ${id}::uuid
    `,
      'No se encontró el respaldo.',
    );
  }

  private async closedActivity(tx: Tx, juntaId: string, activityId: string) {
    const activity = found(
      await tx.$queryRaw<{ estado: string; titulo: string }[]>`
      SELECT estado, titulo FROM multi_junta.actividad WHERE junta_id = ${juntaId}::uuid AND id = ${activityId}::uuid
    `,
      'No se encontró la actividad.',
    );
    if (activity.estado !== 'CERRADA')
      throw new ConflictException('La actividad aún no está cerrada.');
    return activity;
  }

  private eligibleAbsences(tx: Tx, juntaId: string, activityId: string) {
    return tx.$queryRaw<Candidate[]>`
      SELECT a.id, a.id AS "asistenciaId", a.socio_id AS "socioId",
        concat_ws(' ', a.nombres, a.apellidos) AS "socioNombre", chosen.id AS "tarifaId", chosen.monto::text AS monto
      FROM multi_junta.asistencia a
      JOIN multi_junta.actividad act ON act.junta_id = a.junta_id AND act.id = a.actividad_id
      LEFT JOIN LATERAL (
        SELECT t.id, t.monto FROM multi_junta.tarifa_multa t
        WHERE t.junta_id = act.junta_id AND t.tipo = act.tipo
          AND t.vigente_desde <= (act.inicio AT TIME ZONE 'America/Guayaquil')::date
        ORDER BY t.vigente_desde DESC LIMIT 1
      ) chosen ON true
      WHERE a.junta_id = ${juntaId}::uuid AND act.id = ${activityId}::uuid AND act.estado = 'CERRADA'
        AND a.estado = 'AUSENTE'
        AND NOT EXISTS (
          SELECT 1 FROM multi_junta.justificacion j WHERE j.junta_id = a.junta_id AND j.asistencia_id = a.id
            AND j.estado IN ('PENDIENTE', 'ACEPTADA')
        )
        AND NOT EXISTS (
          SELECT 1 FROM multi_junta.obligacion o WHERE o.junta_id = a.junta_id AND o.asistencia_id = a.id
        )
      ORDER BY a.apellidos, a.nombres, a.id
    `;
  }
}
