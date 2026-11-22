import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OperationalDb } from '../../core/operation/operational-db.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { IdentityRequest } from '../platform/identity/auth.http.js';
import {
  coordinates,
  date,
  decimal,
  fields,
  lifetime,
  state,
  text,
  uuid,
} from './resource-input.js';

const articleFields = [
  'nombre',
  'categoria',
  'unidad',
  'costoUnitario',
  'estado',
] as const;
const assetFields = [
  'nombre',
  'descripcion',
  'ubicacion',
  'fechaAdquisicion',
  'valor',
  'vidaUtil',
  'documento',
] as const;
const propertyFields = [
  'nombre',
  'socioId',
  'sectorId',
  'dimensiones',
  'latitud',
  'longitud',
  'estado',
] as const;
const articleProjection = Prisma.sql`id,nombre,categoria,unidad,stock::text,costo_unitario::text AS "costoUnitario",estado`;
const assetProjection = Prisma.sql`id,codigo,nombre,descripcion,ubicacion,fecha_adquisicion::text AS "fechaAdquisicion",valor::text,vida_util AS "vidaUtil",documento,estado,motivo_baja AS "motivoBaja",baja_en AS "bajaEn"`;
const propertyProjection = Prisma.sql`id,nombre,socio_id AS "socioId",sector_id AS "sectorId",dimensiones,latitud::text,longitud::text,estado`;
const movementProjection = Prisma.sql`id,tipo,cantidad::text,motivo,stock_resultante::text AS "stockResultante",ocurrido_en AS "ocurridoEn",responsable_id AS "responsableId"`;

async function found<T>(values: Promise<T[]>) {
  const [item] = await values;
  if (!item) throw new NotFoundException('El recurso no existe en esta junta.');
  return item;
}

@Injectable()
export class ResourcesService {
  constructor(private readonly db: OperationalDb) {}

  articles(req: IdentityRequest, junta: string, id?: string) {
    return this.db.run(req, junta, false, (tx) => {
      if (id)
        return found(
          tx.$queryRaw<
            unknown[]
          >`SELECT ${articleProjection} FROM multi_junta.inventario_articulo WHERE id=${id}::uuid AND junta_id=${junta}::uuid`,
        );
      return tx.$queryRaw<
        unknown[]
      >`SELECT ${articleProjection} FROM multi_junta.inventario_articulo WHERE junta_id=${junta}::uuid ORDER BY nombre,id`;
    });
  }

  createArticle(req: IdentityRequest, junta: string, payload: unknown) {
    const d = fields(
      payload,
      articleFields.filter((key) => key !== 'estado'),
    );
    const nombre = text(d['nombre'], 120);
    const categoria = text(d['categoria'], 80);
    const unidad = text(d['unidad'], 40);
    const costo =
      d['costoUnitario'] == null ? null : decimal(d['costoUnitario'], 2, false);
    return this.db.run(req, junta, true, (tx) =>
      found(tx.$queryRaw<unknown[]>`
      INSERT INTO multi_junta.inventario_articulo(junta_id,nombre,categoria,unidad,costo_unitario)
      VALUES (${junta}::uuid,${nombre},${categoria},${unidad},${costo}::numeric)
      RETURNING ${articleProjection}
    `),
    );
  }

  updateArticle(
    req: IdentityRequest,
    junta: string,
    id: string,
    payload: unknown,
  ) {
    const d = fields(payload, articleFields);
    if (!Object.keys(d).length) throw new BadRequestException();
    const nombre = d['nombre'] === undefined ? null : text(d['nombre'], 120);
    const categoria =
      d['categoria'] === undefined ? null : text(d['categoria'], 80);
    const unidad = d['unidad'] === undefined ? null : text(d['unidad'], 40);
    const costo =
      d['costoUnitario'] == null ? null : decimal(d['costoUnitario'], 2, false);
    const estado = d['estado'] === undefined ? null : state(d['estado']);
    return this.db.run(req, junta, true, async (tx) => {
      const [item] = (await tx.$queryRaw<
        unknown[]
      >`UPDATE multi_junta.inventario_articulo
        SET nombre=COALESCE(${nombre},nombre), categoria=COALESCE(${categoria},categoria), unidad=COALESCE(${unidad},unidad),
            costo_unitario=CASE WHEN ${d['costoUnitario'] !== undefined} THEN ${costo}::numeric ELSE costo_unitario END,
            estado=COALESCE(${estado}::multi_junta.estado,estado)
        WHERE id=${id}::uuid AND junta_id=${junta}::uuid AND (${estado}::text IS DISTINCT FROM 'INACTIVA' OR stock=0)
        RETURNING ${articleProjection}`) as unknown[];
      if (item) return item;
      await found(
        tx.$queryRaw<
          unknown[]
        >`SELECT id FROM multi_junta.inventario_articulo WHERE id=${id}::uuid AND junta_id=${junta}::uuid`,
      );
      throw new ConflictException('El artículo todavía tiene existencias.');
    });
  }

  movements(req: IdentityRequest, junta: string, id: string) {
    return this.db.run(req, junta, false, async (tx) => {
      await found(
        tx.$queryRaw<
          unknown[]
        >`SELECT id FROM multi_junta.inventario_articulo WHERE id=${id}::uuid AND junta_id=${junta}::uuid`,
      );
      return tx.$queryRaw<
        unknown[]
      >`SELECT ${movementProjection} FROM multi_junta.inventario_movimiento WHERE junta_id=${junta}::uuid AND articulo_id=${id}::uuid ORDER BY ocurrido_en DESC,id`;
    });
  }

  move(req: IdentityRequest, junta: string, id: string, payload: unknown) {
    const d = fields(payload, ['tipo', 'cantidad', 'motivo']);
    const tipo = d['tipo'];
    if (tipo !== 'ENTRADA' && tipo !== 'SALIDA')
      throw new BadRequestException();
    const cantidad = decimal(d['cantidad'], 3);
    const motivo = text(d['motivo'], 500);
    const delta = tipo === 'ENTRADA' ? cantidad : '-' + cantidad;
    return this.db.run(req, junta, true, async (tx, actor) => {
      const [balance] = await tx.$queryRaw<{ stock: string }[]>`
        UPDATE multi_junta.inventario_articulo SET stock=stock+${delta}::numeric
        WHERE id=${id}::uuid AND junta_id=${junta}::uuid AND estado='ACTIVA'
          AND stock+${delta}::numeric BETWEEN 0 AND 99999999999.999
        RETURNING stock::text`;
      if (!balance) {
        await found(
          tx.$queryRaw<
            unknown[]
          >`SELECT id FROM multi_junta.inventario_articulo WHERE id=${id}::uuid AND junta_id=${junta}::uuid`,
        );
        throw new ConflictException(
          'El movimiento es incompatible con el estado o las existencias.',
        );
      }
      return found(tx.$queryRaw<unknown[]>`
        INSERT INTO multi_junta.inventario_movimiento(junta_id,articulo_id,responsable_id,tipo,cantidad,motivo,stock_resultante)
        VALUES (${junta}::uuid,${id}::uuid,${actor.cuentaId}::uuid,${tipo},${cantidad}::numeric,${motivo},${balance.stock}::numeric)
        RETURNING ${movementProjection}
      `);
    });
  }

  assets(req: IdentityRequest, junta: string, id?: string) {
    return this.db.run(req, junta, false, (tx) => {
      if (id)
        return found(
          tx.$queryRaw<
            unknown[]
          >`SELECT ${assetProjection} FROM multi_junta.activo_fijo WHERE id=${id}::uuid AND junta_id=${junta}::uuid`,
        );
      return tx.$queryRaw<
        unknown[]
      >`SELECT ${assetProjection} FROM multi_junta.activo_fijo WHERE junta_id=${junta}::uuid ORDER BY codigo,id`;
    });
  }

  createAsset(req: IdentityRequest, junta: string, payload: unknown) {
    const d = fields(payload, [...assetFields, 'codigo']);
    const code =
      d['codigo'] === undefined
        ? 'AF-' + randomUUID().toUpperCase()
        : text(d['codigo'], 40);
    const nombre = text(d['nombre'], 120);
    const descripcion = text(d['descripcion'], 1000);
    const ubicacion = text(d['ubicacion'], 200);
    const fecha = date(d['fechaAdquisicion']);
    const valor = decimal(d['valor'], 2);
    const vida = d['vidaUtil'] == null ? null : lifetime(d['vidaUtil']);
    const documento = text(d['documento'], 200);
    return this.db.run(req, junta, true, (tx) =>
      found(tx.$queryRaw<unknown[]>`
      INSERT INTO multi_junta.activo_fijo(junta_id,codigo,nombre,descripcion,ubicacion,fecha_adquisicion,valor,vida_util,documento)
      VALUES (${junta}::uuid,${code},${nombre},${descripcion},${ubicacion},${fecha}::date,${valor}::numeric,${vida}::integer,${documento})
      RETURNING ${assetProjection}
    `),
    );
  }

  updateAsset(
    req: IdentityRequest,
    junta: string,
    id: string,
    payload: unknown,
  ) {
    const d = fields(payload, assetFields);
    if (!Object.keys(d).length) throw new BadRequestException();
    const nombre = d['nombre'] === undefined ? null : text(d['nombre'], 120);
    const descripcion =
      d['descripcion'] === undefined ? null : text(d['descripcion'], 1000);
    const ubicacion =
      d['ubicacion'] === undefined ? null : text(d['ubicacion'], 200);
    const fecha =
      d['fechaAdquisicion'] === undefined ? null : date(d['fechaAdquisicion']);
    const valor = d['valor'] === undefined ? null : decimal(d['valor'], 2);
    const vida = d['vidaUtil'] == null ? null : lifetime(d['vidaUtil']);
    const documento =
      d['documento'] === undefined ? null : text(d['documento'], 200);
    return this.db.run(req, junta, true, async (tx) => {
      const [item] = await tx.$queryRaw<
        unknown[]
      >`UPDATE multi_junta.activo_fijo
        SET nombre=COALESCE(${nombre},nombre),descripcion=COALESCE(${descripcion},descripcion),ubicacion=COALESCE(${ubicacion},ubicacion),
            fecha_adquisicion=COALESCE(${fecha}::date,fecha_adquisicion),valor=COALESCE(${valor}::numeric,valor),
            vida_util=CASE WHEN ${d['vidaUtil'] !== undefined} THEN ${vida}::integer ELSE vida_util END,documento=COALESCE(${documento},documento)
        WHERE id=${id}::uuid AND junta_id=${junta}::uuid AND estado='ACTIVA' RETURNING ${assetProjection}`;
      if (item) return item;
      await found(
        tx.$queryRaw<
          unknown[]
        >`SELECT id FROM multi_junta.activo_fijo WHERE id=${id}::uuid AND junta_id=${junta}::uuid`,
      );
      throw new ConflictException('El activo está dado de baja.');
    });
  }

  retireAsset(
    req: IdentityRequest,
    junta: string,
    id: string,
    payload: unknown,
  ) {
    const motivo = text(fields(payload, ['motivo'])['motivo'], 500);
    return this.db.run(req, junta, true, async (tx) => {
      const [item] = await tx.$queryRaw<
        unknown[]
      >`UPDATE multi_junta.activo_fijo SET estado='INACTIVA',motivo_baja=${motivo},baja_en=statement_timestamp()
        WHERE id=${id}::uuid AND junta_id=${junta}::uuid AND estado='ACTIVA' RETURNING ${assetProjection}`;
      if (item) return item;
      await found(
        tx.$queryRaw<
          unknown[]
        >`SELECT id FROM multi_junta.activo_fijo WHERE id=${id}::uuid AND junta_id=${junta}::uuid`,
      );
      throw new ConflictException('El activo ya está dado de baja.');
    });
  }

  properties(req: IdentityRequest, junta: string, id?: string) {
    const projection = Prisma.sql`${propertyProjection},EXISTS(SELECT 1 FROM multi_junta.propiedad_foto AS f WHERE f.junta_id=p.junta_id AND f.propiedad_id=p.id) AS "tieneFoto"`;
    return this.db.run(req, junta, false, (tx) => {
      if (id)
        return found(
          tx.$queryRaw<
            unknown[]
          >`SELECT ${projection} FROM multi_junta.propiedad p WHERE p.id=${id}::uuid AND p.junta_id=${junta}::uuid`,
        );
      return tx.$queryRaw<
        unknown[]
      >`SELECT ${projection} FROM multi_junta.propiedad p WHERE p.junta_id=${junta}::uuid ORDER BY p.nombre,p.id`;
    });
  }

  createProperty(req: IdentityRequest, junta: string, payload: unknown) {
    const d = fields(
      payload,
      propertyFields.filter((key) => key !== 'estado'),
    );
    const nombre = text(d['nombre'], 120);
    const socio = uuid(d['socioId']);
    const sector = uuid(d['sectorId']);
    const dimensiones = text(d['dimensiones'], 200);
    const { lat, lon } = coordinates(d['latitud'], d['longitud']);
    return this.db.run(req, junta, true, (tx) =>
      found(tx.$queryRaw<unknown[]>`
      INSERT INTO multi_junta.propiedad(junta_id,socio_id,sector_id,nombre,dimensiones,latitud,longitud)
      VALUES (${junta}::uuid,${socio}::uuid,${sector}::uuid,${nombre},${dimensiones},${lat}::numeric,${lon}::numeric)
      RETURNING ${propertyProjection},false AS "tieneFoto"
    `),
    );
  }

  updateProperty(
    req: IdentityRequest,
    junta: string,
    id: string,
    payload: unknown,
  ) {
    const d = fields(payload, propertyFields);
    if (!Object.keys(d).length) throw new BadRequestException();
    const nombre = d['nombre'] === undefined ? null : text(d['nombre'], 120);
    const socio = d['socioId'] === undefined ? null : uuid(d['socioId']);
    const sector = d['sectorId'] === undefined ? null : uuid(d['sectorId']);
    const dimensiones =
      d['dimensiones'] === undefined ? null : text(d['dimensiones'], 200);
    const estado = d['estado'] === undefined ? null : state(d['estado']);
    const updateCoordinates =
      d['latitud'] !== undefined || d['longitud'] !== undefined;
    const { lat, lon } = coordinates(d['latitud'], d['longitud']);
    return this.db.run(req, junta, true, (tx) =>
      found(tx.$queryRaw<unknown[]>`UPDATE multi_junta.propiedad p
      SET nombre=COALESCE(${nombre},nombre),socio_id=COALESCE(${socio}::uuid,socio_id),sector_id=COALESCE(${sector}::uuid,sector_id),
        dimensiones=COALESCE(${dimensiones},dimensiones),estado=COALESCE(${estado}::multi_junta.estado,estado),
        latitud=CASE WHEN ${updateCoordinates} THEN ${lat}::numeric ELSE latitud END,
        longitud=CASE WHEN ${updateCoordinates} THEN ${lon}::numeric ELSE longitud END
      WHERE p.id=${id}::uuid AND p.junta_id=${junta}::uuid
      RETURNING ${propertyProjection},EXISTS(SELECT 1 FROM multi_junta.propiedad_foto f WHERE f.junta_id=p.junta_id AND f.propiedad_id=p.id) AS "tieneFoto"`),
    );
  }

  getPhoto(req: IdentityRequest, junta: string, id: string) {
    return this.db.run(req, junta, false, (tx) =>
      found(
        tx.$queryRaw<
          { imagen: Uint8Array }[]
        >`SELECT imagen FROM multi_junta.propiedad_foto WHERE junta_id=${junta}::uuid AND propiedad_id=${id}::uuid`,
      ),
    );
  }

  savePhoto(req: IdentityRequest, junta: string, id: string, photo: Buffer) {
    return this.db.run(req, junta, true, async (tx) => {
      await found(
        tx.$queryRaw<
          unknown[]
        >`SELECT id FROM multi_junta.propiedad WHERE junta_id=${junta}::uuid AND id=${id}::uuid`,
      );
      await tx.$executeRaw`INSERT INTO multi_junta.propiedad_foto(junta_id,propiedad_id,imagen) VALUES (${junta}::uuid,${id}::uuid,${photo}::bytea)
        ON CONFLICT (junta_id,propiedad_id) DO UPDATE SET imagen=EXCLUDED.imagen`;
    });
  }
}
