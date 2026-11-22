import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { Prisma as PrismaType } from '../../generated/prisma/client.js';
import PDFDocument from 'pdfkit';
import { OperationalDb } from '../../core/operation/operational-db.js';
import type { IdentityRequest } from '../platform/identity/auth.http.js';
import {
  financeBody,
  financeDay,
  financeId,
} from '../finance/finance-input.js';

type Tx = PrismaType.TransactionClient;
type Column = { clave: string; etiqueta: string };
type Report = {
  titulo: string;
  columnas: Column[];
  filas: Record<string, unknown>[];
  resumen?: Record<string, string>;
  maxFilas: number;
};
type Filters = {
  desde: string | null;
  hasta: string | null;
  sectorId: string | null;
  estado: string | null;
};
const limit = 1000;

const specs = {
  padron: {
    title: 'Padrón de socios',
    roles: ['ADMIN_JUNTA', 'SECRETARIA'],
    fields: ['sectorId', 'estado'],
    cols: [
      'cedula:Cédula',
      'nombres:Nombres',
      'apellidos:Apellidos',
      'sector:Sector',
      'estado:Estado',
    ],
  },
  sectores: {
    title: 'Sectores',
    roles: ['ADMIN_JUNTA', 'SECRETARIA'],
    fields: ['estado'],
    cols: [
      'nombre:Sector',
      'clasificacion:Clasificación',
      'estado:Estado',
      'socios:Socios',
    ],
  },
  asistencia: {
    title: 'Asistencia',
    roles: ['SECRETARIA'],
    fields: ['desde', 'hasta', 'sectorId', 'estado'],
    cols: [
      'fecha:Fecha',
      'actividad:Actividad',
      'tipo:Tipo',
      'socio:Socio',
      'sector:Sector',
      'estado:Estado',
    ],
  },
  ausencias: {
    title: 'Inasistencias',
    roles: ['SECRETARIA'],
    fields: ['desde', 'hasta', 'sectorId'],
    cols: [
      'fecha:Fecha',
      'actividad:Actividad',
      'socio:Socio',
      'sector:Sector',
      'estado:Estado',
    ],
  },
  multas: {
    title: 'Multas y obligaciones',
    roles: ['SECRETARIA', 'TESORERIA'],
    fields: ['desde', 'hasta', 'sectorId', 'estado'],
    cols: [
      'fecha:Fecha',
      'socio:Socio',
      'concepto:Concepto',
      'monto:Monto USD',
      'estado:Estado',
    ],
  },
  pagos: {
    title: 'Pagos',
    roles: ['TESORERIA'],
    fields: ['desde', 'hasta', 'sectorId', 'estado'],
    cols: [
      'fecha:Fecha',
      'socio:Socio',
      'concepto:Concepto',
      'monto:Monto USD',
      'estado:Estado',
      'comprobante:Comprobante',
    ],
  },
  gastos: {
    title: 'Gastos',
    roles: ['TESORERIA'],
    fields: ['desde', 'hasta', 'estado'],
    cols: [
      'fecha:Fecha',
      'concepto:Concepto',
      'beneficiario:Beneficiario',
      'monto:Monto USD',
      'estado:Estado',
    ],
  },
  'resumen-financiero': {
    title: 'Resumen financiero',
    roles: ['TESORERIA'],
    fields: ['desde', 'hasta'],
    cols: ['concepto:Concepto', 'monto:Monto USD'],
  },
  inventario: {
    title: 'Inventario',
    roles: ['TESORERIA'],
    fields: ['estado'],
    cols: [
      'nombre:Artículo',
      'categoria:Categoría',
      'unidad:Unidad',
      'stock:Existencias',
      'costoUnitario:Costo USD',
      'estado:Estado',
    ],
  },
  movimientos: {
    title: 'Movimientos de inventario',
    roles: ['TESORERIA'],
    fields: ['desde', 'hasta'],
    cols: [
      'fecha:Fecha',
      'articulo:Artículo',
      'tipo:Movimiento',
      'cantidad:Cantidad',
      'stockResultante:Saldo físico',
      'motivo:Motivo',
    ],
  },
  activos: {
    title: 'Activos fijos',
    roles: ['TESORERIA'],
    fields: ['estado'],
    cols: [
      'codigo:Código',
      'nombre:Activo',
      'ubicacion:Ubicación',
      'valor:Valor USD',
      'estado:Estado',
    ],
  },
} as const;
type ReportName = keyof typeof specs;
export const reportNames = Object.keys(specs);
function knownReport(name: string): ReportName {
  if (!Object.hasOwn(specs, name))
    throw new BadRequestException('El tipo de reporte no está disponible.');
  return name as ReportName;
}
function parseFilters(value: unknown, type: ReportName): Filters {
  const body = financeBody(value ?? {}, [
    'desde',
    'hasta',
    'sectorId',
    'estado',
  ]);
  const allowed: readonly string[] = specs[type].fields;
  for (const name of Object.keys(body)) {
    if (!allowed.includes(name))
      throw new BadRequestException(
        `El filtro ${name} no corresponde al reporte.`,
      );
  }
  const from =
    body['desde'] == null ? null : financeDay(body['desde'], 'Desde');
  const to = body['hasta'] == null ? null : financeDay(body['hasta'], 'Hasta');
  if (from && to && from > to)
    throw new BadRequestException('La fecha inicial supera la final.');
  const sectorId =
    body['sectorId'] == null ? null : financeId(body['sectorId'], 'El sector');
  const status = body['estado'] == null ? null : body['estado'];
  if (
    status !== null &&
    (typeof status !== 'string' || !/^[A-Z_]{2,32}$/.test(status))
  ) {
    throw new BadRequestException('El filtro de estado es inválido.');
  }
  return { desde: from, hasta: to, sectorId, estado: status as string | null };
}

async function fetchRows(
  tx: Tx,
  junta: string,
  type: ReportName,
  f: Filters,
): Promise<Record<string, unknown>[]> {
  const { desde, hasta, sectorId, estado } = f;
  const part = Prisma.sql;
  switch (type) {
    case 'padron':
      return tx.$queryRaw(part`
    SELECT s.cedula,s.nombres,s.apellidos,coalesce(sec.nombre,'Sin sector') AS sector,s.estado::text AS estado
    FROM multi_junta.socio s LEFT JOIN multi_junta.sector sec
      ON sec.junta_id=s.junta_id AND sec.id=s.sector_id
    WHERE s.junta_id=${junta}::uuid
      AND (${sectorId}::uuid IS NULL OR s.sector_id=${sectorId}::uuid)
      AND (${estado}::text IS NULL OR s.estado::text=${estado})
    ORDER BY s.apellidos,s.nombres,s.id LIMIT ${limit}`);
    case 'sectores':
      return tx.$queryRaw(part`
    SELECT sec.nombre,sec.clasificacion,sec.estado::text AS estado,
       count(s.id)::integer AS socios
    FROM multi_junta.sector sec LEFT JOIN multi_junta.socio s
      ON s.junta_id=sec.junta_id AND s.sector_id=sec.id AND s.estado='ACTIVA'
    WHERE sec.junta_id=${junta}::uuid
      AND (${estado}::text IS NULL OR sec.estado::text=${estado})
    GROUP BY sec.id,sec.nombre,sec.clasificacion,sec.estado
    ORDER BY sec.nombre,sec.id LIMIT ${limit}`);
    case 'asistencia':
    case 'ausencias':
      return tx.$queryRaw(part`
    SELECT (act.inicio AT TIME ZONE 'America/Guayaquil')::date::text AS fecha,
      act.titulo AS actividad,act.tipo,
      concat_ws(' ',s.nombres,s.apellidos) AS socio,coalesce(sec.nombre,'Sin sector') AS sector,
      a.estado
    FROM multi_junta.asistencia a
    JOIN multi_junta.actividad act ON act.id=a.actividad_id AND act.junta_id=a.junta_id
    JOIN multi_junta.socio s ON s.id=a.socio_id AND s.junta_id=a.junta_id
    LEFT JOIN multi_junta.sector sec ON sec.id=s.sector_id AND sec.junta_id=s.junta_id
    WHERE a.junta_id=${junta}::uuid
      AND (${desde}::date IS NULL OR (act.inicio AT TIME ZONE 'America/Guayaquil')::date>=${desde}::date)
      AND (${hasta}::date IS NULL OR (act.inicio AT TIME ZONE 'America/Guayaquil')::date<=${hasta}::date)
      AND (${sectorId}::uuid IS NULL OR s.sector_id=${sectorId}::uuid)
      AND (${type === 'ausencias'}::boolean IS FALSE OR a.estado='AUSENTE')
      AND (${estado}::text IS NULL OR a.estado=${estado})
    ORDER BY act.inicio DESC,s.apellidos,s.nombres,a.id LIMIT ${limit}`);
    case 'multas':
      return tx.$queryRaw(part`
    SELECT (o.creada_en AT TIME ZONE 'America/Guayaquil')::date::text AS fecha,
      concat_ws(' ',s.nombres,s.apellidos) AS socio,o.concepto,o.monto::text AS monto,o.estado
    FROM multi_junta.obligacion o JOIN multi_junta.socio s ON s.junta_id=o.junta_id AND s.id=o.socio_id
    WHERE o.junta_id=${junta}::uuid
      AND (${desde}::date IS NULL OR (o.creada_en AT TIME ZONE 'America/Guayaquil')::date>=${desde}::date)
      AND (${hasta}::date IS NULL OR (o.creada_en AT TIME ZONE 'America/Guayaquil')::date<=${hasta}::date)
      AND (${sectorId}::uuid IS NULL OR s.sector_id=${sectorId}::uuid)
      AND (${estado}::text IS NULL OR o.estado=${estado})
    ORDER BY o.creada_en DESC,o.id LIMIT ${limit}`);
    case 'pagos':
      return tx.$queryRaw(part`
    SELECT p.fecha::text AS fecha,p.socio_nombre AS socio,p.concepto,
      p.monto::text AS monto,p.estado,p.numero_comprobante::text AS comprobante
    FROM multi_junta.pago p JOIN multi_junta.socio s ON s.junta_id=p.junta_id AND s.id=p.socio_id
    WHERE p.junta_id=${junta}::uuid
      AND (${desde}::date IS NULL OR p.fecha>=${desde}::date)
      AND (${hasta}::date IS NULL OR p.fecha<=${hasta}::date)
      AND (${sectorId}::uuid IS NULL OR s.sector_id=${sectorId}::uuid)
      AND (${estado}::text IS NULL OR p.estado=${estado})
    ORDER BY p.fecha DESC,p.numero_comprobante DESC LIMIT ${limit}`);
    case 'gastos':
      return tx.$queryRaw(part`
    SELECT fecha::text AS fecha,concepto,beneficiario,monto::text AS monto,estado
    FROM multi_junta.gasto
    WHERE junta_id=${junta}::uuid
      AND (${desde}::date IS NULL OR fecha>=${desde}::date)
      AND (${hasta}::date IS NULL OR fecha<=${hasta}::date)
      AND (${estado}::text IS NULL OR estado=${estado})
    ORDER BY fecha DESC,creado_en DESC LIMIT ${limit}`);
    case 'inventario':
      return tx.$queryRaw(part`
    SELECT nombre,categoria,unidad,stock::text AS stock,
      costo_unitario::text AS "costoUnitario",estado::text AS estado
    FROM multi_junta.inventario_articulo WHERE junta_id=${junta}::uuid
      AND (${estado}::text IS NULL OR estado::text=${estado})
    ORDER BY nombre,id LIMIT ${limit}`);
    case 'movimientos':
      return tx.$queryRaw(part`
    SELECT (m.ocurrido_en AT TIME ZONE 'America/Guayaquil')::text AS fecha,
      a.nombre AS articulo,m.tipo,m.cantidad::text AS cantidad,
      m.stock_resultante::text AS "stockResultante",m.motivo
    FROM multi_junta.inventario_movimiento m
    JOIN multi_junta.inventario_articulo a ON a.junta_id=m.junta_id AND a.id=m.articulo_id
    WHERE m.junta_id=${junta}::uuid
      AND (${desde}::date IS NULL OR (m.ocurrido_en AT TIME ZONE 'America/Guayaquil')::date>=${desde}::date)
      AND (${hasta}::date IS NULL OR (m.ocurrido_en AT TIME ZONE 'America/Guayaquil')::date<=${hasta}::date)
    ORDER BY m.ocurrido_en DESC,m.id LIMIT ${limit}`);
    case 'activos':
      return tx.$queryRaw(part`
    SELECT codigo,nombre,ubicacion,valor::text AS valor,estado::text AS estado
    FROM multi_junta.activo_fijo WHERE junta_id=${junta}::uuid
      AND (${estado}::text IS NULL OR estado::text=${estado})
    ORDER BY codigo,id LIMIT ${limit}`);
    case 'resumen-financiero': {
      const [totals] = await tx.$queryRaw<
        {
          ingresos: string;
          gastos: string;
          obligaciones: string;
          revisiones: string;
        }[]
      >(part`
    SELECT
      (SELECT coalesce(sum(monto),0)::numeric(16,2)::text FROM multi_junta.pago
        WHERE junta_id=${junta}::uuid AND estado='REGISTRADO'
          AND (${desde}::date IS NULL OR fecha>=${desde}::date)
          AND (${hasta}::date IS NULL OR fecha<=${hasta}::date)) AS ingresos,
      (SELECT coalesce(sum(monto),0)::numeric(16,2)::text FROM multi_junta.gasto
        WHERE junta_id=${junta}::uuid AND estado='REGISTRADO'
          AND (${desde}::date IS NULL OR fecha>=${desde}::date)
          AND (${hasta}::date IS NULL OR fecha<=${hasta}::date)) AS gastos,
      (SELECT coalesce(sum(monto),0)::numeric(16,2)::text FROM multi_junta.obligacion
        WHERE junta_id=${junta}::uuid AND estado='PENDIENTE'
          AND (${desde}::date IS NULL OR (creada_en AT TIME ZONE 'America/Guayaquil')::date>=${desde}::date)
          AND (${hasta}::date IS NULL OR (creada_en AT TIME ZONE 'America/Guayaquil')::date<=${hasta}::date)) AS obligaciones,
      (SELECT count(*)::text FROM multi_junta.obligacion
        WHERE junta_id=${junta}::uuid AND estado='REVISION_PENDIENTE'
          AND (${desde}::date IS NULL OR (creada_en AT TIME ZONE 'America/Guayaquil')::date>=${desde}::date)
          AND (${hasta}::date IS NULL OR (creada_en AT TIME ZONE 'America/Guayaquil')::date<=${hasta}::date)) AS revisiones
   `);
      const result = totals ?? {
        ingresos: '0.00',
        gastos: '0.00',
        obligaciones: '0.00',
        revisiones: '0',
      };
      return [
        { concepto: 'Ingresos vigentes', monto: result.ingresos },
        { concepto: 'Gastos vigentes', monto: result.gastos },
        { concepto: 'Obligaciones pendientes', monto: result.obligaciones },
        {
          concepto: 'Obligaciones en revisión (cantidad)',
          monto: result.revisiones,
        },
      ];
    }
  }
}

function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function reportCsv(report: Report): Buffer {
  const rows = [
    report.columnas.map((c) => escapeCsvCell(c.etiqueta)).join(','),
    ...report.filas.map((row) =>
      report.columnas.map((c) => escapeCsvCell(row[c.clave])).join(','),
    ),
  ];
  return Buffer.from('\uFEFF' + rows.join('\r\n') + '\r\n', 'utf8');
}

export function reportPdf(report: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 45 });
    const chunks: Buffer[] = [];
    document.on('data', (c: Buffer) => chunks.push(c));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.font('Helvetica-Bold').fontSize(20).text(report.titulo);
    document
      .moveDown(0.5)
      .font('Helvetica')
      .fontSize(9)
      .text('Reporte interno — valores derivados de registros de la junta.');
    document.moveDown();
    for (const row of report.filas) {
      const line = report.columnas
        .map((c) => `${c.etiqueta}: ${String(row[c.clave] ?? '—')}`)
        .join('  |  ');
      document.fontSize(8).text(line, { paragraphGap: 5 });
    }
    document
      .moveDown()
      .fontSize(9)
      .text(`Límite de exportación: ${report.maxFilas} filas.`);
    document.end();
  });
}

@Injectable()
export class ReportsService {
  constructor(private readonly operations: OperationalDb) {}

  report(
    request: IdentityRequest,
    junta: string,
    typeValue: string,
    query: unknown,
  ) {
    const type = knownReport(typeValue);
    const filter = parseFilters(query, type);
    return this.operations.run(
      request,
      junta,
      false,
      async (tx, actor): Promise<Report> => {
        const permitted: readonly string[] = specs[type].roles;
        if (!actor.rol || !permitted.includes(actor.rol))
          throw new ForbiddenException(
            'El reporte no está disponible para el rol.',
          );
        const columns: Column[] = specs[type].cols.map((x) => {
          const [clave, ...label] = x.split(':');
          return { clave, etiqueta: label.join(':') };
        });
        const rows = await fetchRows(tx, junta, type, filter);
        const report: Report = {
          titulo: specs[type].title,
          columnas: columns,
          filas: rows,
          maxFilas: limit,
        };
        if (type === 'resumen-financiero') {
          const values = rows.map((x) => x.monto);
          report.resumen = {
            ingresos: String(values[0] ?? '0.00'),
            gastos: String(values[1] ?? '0.00'),
            obligacionesPendientes: String(values[2] ?? '0.00'),
            revisionesPendientes: String(values[3] ?? '0'),
          };
        }
        return report;
      },
    );
  }
}
