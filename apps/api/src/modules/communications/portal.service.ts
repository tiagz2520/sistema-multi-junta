import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { OperationalDb } from '../../core/operation/operational-db.js';
import type { IdentityRequest } from '../platform/identity/auth.http.js';
import { sha256 } from '../platform/identity/auth-session.js';
import { normalizeUsername } from '../platform/identity/normalize-username.js';
import { hashPassword } from '../platform/identity/password.js';
import { receiptPdf } from '../finance/receipt-pdf.js';
import type { ReceiptSnapshot } from '../finance/receipt-pdf.js';
import {
  financeBody,
  financeId,
  financeText,
} from '../finance/finance-input.js';

type DbResult<T> =
  { data: T } | { error: 'invalid' | 'conflict' | 'not_found' | 'forbidden' };

function unwrap<T>(result: DbResult<T> | undefined): T {
  if (result && 'data' in result) return result.data;
  switch (result?.error) {
    case 'invalid':
      throw new BadRequestException('La solicitud contiene datos inválidos.');
    case 'conflict':
      throw new ConflictException('La vinculación no está disponible.');
    case 'not_found':
      throw new NotFoundException('El recurso no está disponible.');
    default:
      throw new ForbiddenException('La operación no está autorizada.');
  }
}

function username(value: unknown): string {
  if (typeof value !== 'string')
    throw new BadRequestException('Usuario inválido.');
  try {
    return normalizeUsername(value);
  } catch {
    throw new BadRequestException('Usuario inválido.');
  }
}

@Injectable()
export class PortalService {
  constructor(private readonly operations: OperationalDb) {}

  links(request: IdentityRequest, juntaId: string) {
    return this.operations.run(
      request,
      juntaId,
      false,
      (tx) => tx.$queryRaw`
      SELECT id, socio_id AS "socioId", membresia_id AS "membresiaId",
        CASE WHEN estado='PENDIENTE' AND vence_en<=statement_timestamp()
          THEN 'VENCIDO' ELSE estado END AS estado,
        vence_en AS "venceEn", creado_en AS "creadoEn", confirmado_en AS "confirmadoEn",
        revocado_en AS "revocadoEn", motivo_revocacion AS "motivoRevocacion"
      FROM multi_junta.socio_vinculo WHERE junta_id=${juntaId}::uuid
      ORDER BY creado_en DESC, id DESC LIMIT 100
    `,
    );
  }

  async invite(request: IdentityRequest, juntaId: string, payload: unknown) {
    const data = financeBody(payload, ['socioId', 'membresiaId', 'usuario']);
    const socioId = financeId(data['socioId'], 'El socio');
    const existing = data['membresiaId'] != null;
    const creating = data['usuario'] != null;
    if (existing === creating) {
      throw new BadRequestException(
        'Elige una membresía existente o crea un usuario nuevo.',
      );
    }
    const membershipId = existing
      ? financeId(data['membresiaId'], 'La membresía')
      : null;
    const user = creating ? username(data['usuario']) : null;
    const code = randomBytes(32).toString('base64url');
    const temporaryPassword = creating
      ? randomBytes(24).toString('base64url')
      : null;
    const encodedPassword = temporaryPassword
      ? await hashPassword(temporaryPassword)
      : null;
    const result = await this.operations.run(
      request,
      juntaId,
      true,
      async (tx) => {
        const [row] = await tx.$queryRaw<
          {
            result: DbResult<{
              id: string;
              membresiaId: string;
              venceEn: Date;
            }>;
          }[]
        >`
        SELECT multi_junta.portal_invitar(
          ${juntaId}::uuid, ${socioId}::uuid, ${membershipId}::uuid,
          ${user}::text, ${encodedPassword}::text, ${sha256(code)}::text
        ) AS result
      `;
        return unwrap(row?.result);
      },
    );
    return {
      ...result,
      codigo: code,
      ...(temporaryPassword ? { contrasenaTemporal: temporaryPassword } : {}),
    };
  }

  confirm(request: IdentityRequest, juntaId: string, payload: unknown) {
    const data = financeBody(payload, ['codigo']);
    const code = data['codigo'];
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
      throw new BadRequestException('El código de invitación no es válido.');
    }
    return this.operations.run(request, juntaId, true, async (tx) => {
      const [row] = await tx.$queryRaw<{ result: DbResult<unknown> }[]>`
        SELECT multi_junta.portal_confirmar(${juntaId}::uuid, ${sha256(code)}::text) AS result
      `;
      return unwrap(row?.result);
    });
  }

  revoke(
    request: IdentityRequest,
    juntaId: string,
    linkId: string,
    payload: unknown,
  ) {
    const data = financeBody(payload, ['motivo']);
    const reason = financeText(data['motivo'], 'El motivo', 500);
    return this.operations.run(request, juntaId, true, async (tx) => {
      const [row] = await tx.$queryRaw<{ result: DbResult<unknown> }[]>`
        SELECT multi_junta.portal_revocar(${juntaId}::uuid, ${linkId}::uuid, ${reason}::text) AS result
      `;
      return unwrap(row?.result);
    });
  }

  profile(request: IdentityRequest, juntaId: string) {
    return this.operations.run(request, juntaId, false, async (tx) => {
      const [profile] = await tx.$queryRaw<
        {
          id: string;
          nombres: string;
          apellidos: string;
          cedula: string;
          sectorId: string | null;
          sectorNombre: string | null;
        }[]
      >`
        SELECT s.id, s.nombres, s.apellidos, s.cedula,
          s.sector_id AS "sectorId", sec.nombre AS "sectorNombre"
        FROM multi_junta.socio s
        LEFT JOIN multi_junta.sector sec ON sec.junta_id=s.junta_id AND sec.id=s.sector_id
        WHERE s.junta_id=${juntaId}::uuid
          AND s.id=multi_junta.portal_socio_actual(${juntaId}::uuid)
      `;
      return { perfil: profile ?? null };
    });
  }

  properties(request: IdentityRequest, juntaId: string) {
    return this.operations.run(
      request,
      juntaId,
      false,
      (tx) =>
        tx.$queryRaw<
          {
            id: string;
            nombre: string;
            dimensiones: string;
            sectorId: string;
            sectorNombre: string | null;
            latitud: string | null;
            longitud: string | null;
            tieneFoto: boolean;
          }[]
        >`
        SELECT p.id, p.nombre, p.dimensiones, p.sector_id AS "sectorId",
          sec.nombre AS "sectorNombre", p.latitud::text AS latitud,
          p.longitud::text AS longitud,
          EXISTS (
            SELECT 1 FROM multi_junta.propiedad_foto f
            WHERE f.junta_id=p.junta_id AND f.propiedad_id=p.id
          ) AS "tieneFoto"
        FROM multi_junta.propiedad p
        LEFT JOIN multi_junta.sector sec
          ON sec.junta_id=p.junta_id AND sec.id=p.sector_id
        WHERE p.junta_id=${juntaId}::uuid
          AND p.estado='ACTIVA'
          AND p.socio_id=multi_junta.portal_socio_actual(${juntaId}::uuid)
        ORDER BY p.nombre, p.id
      `,
    );
  }

  async propertyPhoto(
    request: IdentityRequest,
    juntaId: string,
    propertyId: string,
  ) {
    const [photo] = await this.operations.run(
      request,
      juntaId,
      false,
      (tx) =>
        tx.$queryRaw<{ imagen: Uint8Array }[]>`
        SELECT f.imagen FROM multi_junta.propiedad_foto f
        JOIN multi_junta.propiedad p
          ON p.junta_id=f.junta_id AND p.id=f.propiedad_id
        WHERE f.junta_id=${juntaId}::uuid AND f.propiedad_id=${propertyId}::uuid
          AND p.estado='ACTIVA'
          AND p.socio_id=multi_junta.portal_socio_actual(${juntaId}::uuid)
      `,
    );
    if (!photo) throw new NotFoundException('No se encontró la fotografía.');
    return Buffer.from(photo.imagen);
  }

  attendance(request: IdentityRequest, juntaId: string) {
    return this.operations.run(
      request,
      juntaId,
      false,
      (tx) => tx.$queryRaw`
      SELECT a.id, a.estado, act.id AS "actividadId",
        act.tipo, act.titulo, act.inicio, act.fin, act.lugar
      FROM multi_junta.asistencia a
      JOIN multi_junta.actividad act ON act.junta_id=a.junta_id AND act.id=a.actividad_id
      WHERE a.junta_id=${juntaId}::uuid
        AND a.socio_id=multi_junta.portal_socio_actual(${juntaId}::uuid)
      ORDER BY act.inicio DESC, a.id DESC
    `,
    );
  }

  obligations(request: IdentityRequest, juntaId: string) {
    return this.operations.run(
      request,
      juntaId,
      false,
      (tx) => tx.$queryRaw`
      SELECT id, actividad_id AS "actividadId", concepto, monto::text AS monto,
        estado, motivo_revision AS "motivoRevision", creada_en AS "creadaEn"
      FROM multi_junta.obligacion WHERE junta_id=${juntaId}::uuid
        AND socio_id=multi_junta.portal_socio_actual(${juntaId}::uuid)
      ORDER BY creada_en DESC, id DESC
    `,
    );
  }

  payments(request: IdentityRequest, juntaId: string) {
    return this.operations.run(
      request,
      juntaId,
      false,
      (tx) => tx.$queryRaw`
      SELECT id, obligacion_id AS "obligacionId", concepto,
        monto::text AS monto, fecha::text AS fecha, metodo, estado,
        numero_comprobante::text AS "numeroComprobante"
      FROM multi_junta.pago WHERE junta_id=${juntaId}::uuid
        AND socio_id=multi_junta.portal_socio_actual(${juntaId}::uuid)
      ORDER BY fecha DESC, numero_comprobante DESC
    `,
    );
  }

  async receipt(request: IdentityRequest, juntaId: string, paymentId: string) {
    const [row] = await this.operations.run(
      request,
      juntaId,
      false,
      (tx) =>
        tx.$queryRaw<ReceiptSnapshot[]>`
        SELECT id, estado, motivo_anulacion AS "motivoAnulacion",
          numero_comprobante::text AS "numeroComprobante",
          junta_nombre AS "juntaNombre", junta_ruc AS "juntaRuc",
          socio_nombre AS "socioNombre", concepto, fecha::text AS fecha,
          metodo, monto::text AS monto, creado_en AS "creadoEn"
        FROM multi_junta.pago WHERE junta_id=${juntaId}::uuid
          AND id=${paymentId}::uuid
          AND socio_id=multi_junta.portal_socio_actual(${juntaId}::uuid)
      `,
    );
    if (!row) throw new NotFoundException('No se encontró el comprobante.');
    return { pdf: await receiptPdf(row), numero: row.numeroComprobante };
  }
}
