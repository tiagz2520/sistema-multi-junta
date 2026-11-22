import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OperationalDb } from '../../core/operation/operational-db.js';
import type { IdentityRequest } from '../platform/identity/auth.http.js';
import {
  financeBody,
  financeDay,
  financeId,
  financeText,
} from '../finance/finance-input.js';
import PDFDocument from 'pdfkit';

type FileUpload = { buffer: Buffer; mimetype: string; originalname: string };

function pdfFile(file: FileUpload | undefined): Buffer {
  if (
    !file ||
    !file.buffer ||
    file.buffer.length < 5 ||
    file.buffer.length > 2097152 ||
    file.mimetype !== 'application/pdf' ||
    file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    throw new BadRequestException('Adjunta un PDF válido de hasta 2 MiB.');
  }
  return file.buffer;
}

function optionalPdf(file: FileUpload | undefined): Buffer | null {
  return file ? pdfFile(file) : null;
}

function uuidList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    throw new BadRequestException('Selecciona entre 1 y 200 destinatarios.');
  }
  const unique = value.map((x) => financeId(x, 'El destinatario'));
  if (new Set(unique).size !== unique.length) {
    throw new BadRequestException('No repitas destinatarios.');
  }
  return unique;
}

function asNotFound<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new NotFoundException(name);
  return value;
}

function letterPdf(record: {
  asunto: string;
  contenido: string;
  tituloActividad: string;
  fechaActividad: Date;
  lugarActividad: string;
  emitidaEn: Date;
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 55 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(22).text('Convocatoria interna');
    doc.moveDown().fontSize(15).text(record.asunto);
    doc
      .moveDown()
      .font('Helvetica')
      .fontSize(11)
      .text(`Actividad: ${record.tituloActividad}`)
      .text(
        `Fecha: ${new Date(record.fechaActividad).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}`,
      )
      .text(`Lugar: ${record.lugarActividad}`)
      .text(
        `Publicada: ${new Date(record.emitidaEn).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}`,
      );
    doc.moveDown().fontSize(12).text(record.contenido);
    doc
      .moveDown()
      .fontSize(9)
      .text('Documento interno de gestión comunitaria.');
    doc.end();
  });
}

@Injectable()
export class CommunicationsService {
  constructor(private readonly operations: OperationalDb) {}

  recipients(request: IdentityRequest, junta: string) {
    return this.operations.run(
      request,
      junta,
      false,
      (tx) => tx.$queryRaw`
      SELECT id, usuario, rol FROM multi_junta.comm_destinatarios(${junta}::uuid)
    `,
    );
  }

  convocations(request: IdentityRequest, junta: string) {
    return this.operations.run(
      request,
      junta,
      false,
      (tx) => tx.$queryRaw`
      SELECT id, actividad_id AS "actividadId", asunto, contenido,
        titulo_actividad AS "tituloActividad", fecha_actividad AS "fechaActividad",
        lugar_actividad AS "lugarActividad", emitida_en AS "emitidaEn", estado
      FROM multi_junta.convocatoria WHERE junta_id=${junta}::uuid
      ORDER BY emitida_en DESC, id DESC LIMIT 100
    `,
    );
  }

  async createConvocation(
    request: IdentityRequest,
    junta: string,
    payload: unknown,
  ) {
    const body = financeBody(payload, [
      'actividadId',
      'asunto',
      'contenido',
      'destinatarios',
    ]);
    const activityId = financeId(body['actividadId'], 'La actividad');
    const asunto = financeText(body['asunto'], 'El asunto', 180);
    const contenido = financeText(body['contenido'], 'El contenido', 5000);
    const members = uuidList(body['destinatarios']);
    return this.operations.run(request, junta, true, async (tx) => {
      const [activity] = await tx.$queryRaw<
        { id: string; titulo: string; inicio: Date; lugar: string }[]
      >`
        SELECT id,titulo,inicio,lugar FROM multi_junta.actividad
        WHERE junta_id=${junta}::uuid AND id=${activityId}::uuid
      `;
      if (!activity)
        throw new NotFoundException('No se encontró la actividad de la junta.');
      const eligible = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM multi_junta.comm_destinatarios(${junta}::uuid)
      `;
      const allowed = new Set(eligible.map(({ id }) => id));
      if (members.some((id) => !allowed.has(id))) {
        throw new ForbiddenException(
          'Hay destinatarios sin autorización en la junta.',
        );
      }
      const [convocation] = await tx.$queryRaw<
        { id: string; asunto: string; estado: string }[]
      >`
        INSERT INTO multi_junta.convocatoria (
          junta_id, actividad_id, asunto, contenido, titulo_actividad, fecha_actividad, lugar_actividad
        ) VALUES (${junta}::uuid,${activityId}::uuid,${asunto},${contenido},
          ${activity.titulo},${activity.inicio},${activity.lugar})
        RETURNING id, asunto, estado
      `;
      for (const id of members) {
        await tx.$executeRaw`
          INSERT INTO multi_junta.convocatoria_destinatario (junta_id,convocatoria_id,membresia_id)
          VALUES (${junta}::uuid,${convocation.id}::uuid,${id}::uuid)
        `;
      }
      return { ...convocation, destinatarios: members.length };
    });
  }

  archiveConvocation(request: IdentityRequest, junta: string, id: string) {
    return this.operations.run(request, junta, true, async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string; estado: string }[]>`
        UPDATE multi_junta.convocatoria SET estado='ARCHIVADA'
        WHERE junta_id=${junta}::uuid AND id=${id}::uuid RETURNING id,estado
      `;
      return asNotFound(row, 'No se encontró la convocatoria.');
    });
  }

  async convocationPdf(request: IdentityRequest, junta: string, id: string) {
    const [record] = await this.operations.run(
      request,
      junta,
      false,
      (tx) => tx.$queryRaw<
        {
          asunto: string;
          contenido: string;
          tituloActividad: string;
          fechaActividad: Date;
          lugarActividad: string;
          emitidaEn: Date;
        }[]
      >`
      SELECT asunto,contenido,titulo_actividad AS "tituloActividad",
        fecha_actividad AS "fechaActividad",lugar_actividad AS "lugarActividad",
        emitida_en AS "emitidaEn"
      FROM multi_junta.convocatoria WHERE junta_id=${junta}::uuid AND id=${id}::uuid
    `,
    );
    if (!record) throw new NotFoundException('No se encontró la convocatoria.');
    return letterPdf(record);
  }

  documents(request: IdentityRequest, junta: string) {
    return this.operations.run(
      request,
      junta,
      false,
      (tx) => tx.$queryRaw`
      SELECT id,tipo,titulo,fecha::text AS fecha,descripcion,institucion,estado,creado_en AS "creadoEn"
      FROM multi_junta.comunicacion_documento WHERE junta_id=${junta}::uuid
      ORDER BY fecha DESC,creado_en DESC,id DESC LIMIT 100
    `,
    );
  }

  async createDocument(
    request: IdentityRequest,
    junta: string,
    payload: unknown,
    upload: FileUpload | undefined,
  ) {
    const body = financeBody(payload, [
      'tipo',
      'titulo',
      'fecha',
      'descripcion',
      'institucion',
    ]);
    const type = body['tipo'];
    if (!['ACTA', 'RESOLUCION', 'ACUERDO', 'OFICIO'].includes(String(type))) {
      throw new BadRequestException('El tipo de documento no está permitido.');
    }
    const titulo = financeText(body['titulo'], 'El título', 180);
    const fecha = financeDay(body['fecha'], 'La fecha');
    const descripcion = financeText(
      body['descripcion'],
      'La descripción',
      3000,
    );
    const institucion =
      type === 'OFICIO'
        ? financeText(body['institucion'], 'La institución', 180)
        : null;
    if (
      type !== 'OFICIO' &&
      body['institucion'] != null &&
      body['institucion'] !== ''
    ) {
      throw new BadRequestException(
        'La institución solo corresponde a oficios.',
      );
    }
    const archivo = pdfFile(upload);
    return this.operations.run(request, junta, true, async (tx) => {
      const [row] = await tx.$queryRaw<
        { id: string; tipo: string; titulo: string; estado: string }[]
      >`
        INSERT INTO multi_junta.comunicacion_documento
          (junta_id,tipo,titulo,fecha,descripcion,institucion,archivo)
        VALUES (${junta}::uuid,${type},${titulo},${fecha}::date,${descripcion},${institucion},${archivo}::bytea)
        RETURNING id,tipo,titulo,estado
      `;
      return row;
    });
  }

  archiveDocument(request: IdentityRequest, junta: string, id: string) {
    return this.operations.run(request, junta, true, async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string; estado: string }[]>`
        UPDATE multi_junta.comunicacion_documento SET estado='ARCHIVADO'
        WHERE junta_id=${junta}::uuid AND id=${id}::uuid RETURNING id,estado
      `;
      return asNotFound(row, 'No se encontró el documento.');
    });
  }

  documentFile(request: IdentityRequest, junta: string, id: string) {
    return this.operations.run(request, junta, false, async (tx) => {
      const [row] = await tx.$queryRaw<{ archivo: Uint8Array }[]>`
        SELECT archivo FROM multi_junta.comunicacion_documento
        WHERE junta_id=${junta}::uuid AND id=${id}::uuid
      `;
      return Buffer.from(
        asNotFound(row, 'No se encontró el documento.').archivo,
      );
    });
  }

  messages(request: IdentityRequest, junta: string) {
    return this.operations.run(
      request,
      junta,
      false,
      (tx) => tx.$queryRaw`
      SELECT id,remitente_id AS "remitenteId",destinatario_id AS "destinatarioId",
        texto,archivo IS NOT NULL AS "tieneArchivo",creado_en AS "creadoEn"
      FROM multi_junta.comunicacion_mensaje WHERE junta_id=${junta}::uuid
        AND (remitente_id=multi_junta.m3_membresia_actual(${junta}::uuid)
          OR destinatario_id=multi_junta.m3_membresia_actual(${junta}::uuid))
      ORDER BY creado_en DESC,id DESC LIMIT 100
    `,
    );
  }

  async sendMessage(
    request: IdentityRequest,
    junta: string,
    payload: unknown,
    upload: FileUpload | undefined,
  ) {
    const body = financeBody(payload, ['destinatarioId', 'texto']);
    const target = financeId(body['destinatarioId'], 'El destinatario');
    const texto = financeText(body['texto'], 'El mensaje', 3000);
    const file = optionalPdf(upload);
    return this.operations.run(request, junta, true, async (tx) => {
      const [permitted] = await tx.$queryRaw<{ allowed: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM multi_junta.comm_destinatarios(${junta}::uuid) WHERE id=${target}::uuid
        ) AS allowed
      `;
      if (!permitted?.allowed)
        throw new ForbiddenException('El destinatario no está disponible.');
      const [row] = await tx.$queryRaw<
        {
          id: string;
          remitenteId: string;
          destinatarioId: string;
          texto: string;
          creadoEn: Date;
        }[]
      >`
        INSERT INTO multi_junta.comunicacion_mensaje
          (junta_id,remitente_id,destinatario_id,texto,archivo)
        VALUES (${junta}::uuid,multi_junta.m3_membresia_actual(${junta}::uuid),
          ${target}::uuid,${texto},${file}::bytea)
        RETURNING id,remitente_id AS "remitenteId",
          destinatario_id AS "destinatarioId",texto,creado_en AS "creadoEn"
      `;
      return row;
    });
  }

  messageFile(request: IdentityRequest, junta: string, id: string) {
    return this.operations.run(request, junta, false, async (tx) => {
      const [row] = await tx.$queryRaw<{ archivo: Uint8Array | null }[]>`
        SELECT archivo FROM multi_junta.comunicacion_mensaje
        WHERE junta_id=${junta}::uuid AND id=${id}::uuid
      `;
      if (!row?.archivo)
        throw new NotFoundException('No se encontró el adjunto.');
      return Buffer.from(row.archivo);
    });
  }
}
