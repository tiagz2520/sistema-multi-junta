import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  login,
  operationalFixture,
  responseData,
  serveApi,
} from '../../../tests/helpers/operational-fixture.mjs';

test('recursos aislados con PostgreSQL y roles operativos', async (t) => {
  const {
    juntas: [a, b],
  } = await operationalFixture(t);
  const origin = await serveApi(t);
  const adminA = await login(origin, a.admin, a.id);
  const adminB = await login(origin, b.admin, b.id);
  const sec = await login(origin, a.secretaria, a.id);
  const treasury = await login(origin, a.tesoreria, a.id);
  const foreignTreasury = await login(origin, b.tesoreria, b.id);
  const base = (junta) => `/juntas/${junta.id}/recursos`;

  await t.test(
    'evita sobregiro de inventario al competir por el mismo saldo',
    async () => {
      const article = await responseData(
        await treasury(base(a) + '/inventario', 'POST', {
          nombre: 'Insumo sintético',
          categoria: 'Materiales',
          unidad: 'unidad',
          costoUnitario: '2.50',
        }),
        201,
      );
      const route = base(a) + '/inventario/' + article.id + '/movimientos';
      await responseData(
        await treasury(route, 'POST', {
          tipo: 'ENTRADA',
          cantidad: '3.500',
          motivo: 'Entrada sintética',
        }),
        201,
      );
      const outgoing = await Promise.all(
        [1, 2].map(() =>
          treasury(route, 'POST', {
            tipo: 'SALIDA',
            cantidad: '2.25',
            motivo: 'Salida sintética',
          }),
        ),
      );
      assert.deepEqual(outgoing.map(({ status }) => status).sort(), [201, 409]);
      const current = await responseData(
        await treasury(base(a) + '/inventario/' + article.id),
      );
      assert.equal(current.stock, '1.250');
      assert.equal((await responseData(await treasury(route))).length, 2);
      assert.equal((await sec(base(a) + '/inventario')).status, 403);
      assert.equal(
        (await foreignTreasury(base(a) + '/inventario')).status,
        403,
      );
      assert.equal(
        (await foreignTreasury(base(b) + '/inventario/' + article.id)).status,
        404,
      );
    },
  );

  await t.test(
    'da de baja un activo y conserva código, motivo e historial',
    async () => {
      const asset = await responseData(
        await treasury(base(a) + '/activos', 'POST', {
          nombre: 'Bien sintético',
          descripcion: 'Equipo de prueba',
          ubicacion: 'Bodega',
          fechaAdquisicion: '2026-10-01',
          valor: '42.10',
          vidaUtil: 5,
          documento: 'REF-SINTETICA',
        }),
        201,
      );
      const uri = base(a) + '/activos/' + asset.id;
      const retired = await responseData(
        await treasury(uri + '/baja', 'POST', { motivo: 'Baja sintética' }),
      );
      assert.equal(retired.estado, 'INACTIVA');
      assert.equal(retired.motivoBaja, 'Baja sintética');
      assert.equal(
        (await responseData(await treasury(uri))).codigo,
        asset.codigo,
      );
      assert.equal(
        (await treasury(uri, 'PATCH', { nombre: 'No aplicar' })).status,
        409,
      );
    },
  );

  await t.test(
    'valida referencias, coordenadas y autorización de la fotografía',
    async () => {
      const sector = await responseData(
        await adminA(`/juntas/${a.id}/administracion/sectores`, 'POST', {
          nombre: 'Sector A',
          clasificacion: 'Comunitario',
        }),
        201,
      );
      const foreignSector = await responseData(
        await adminB(`/juntas/${b.id}/administracion/sectores`, 'POST', {
          nombre: 'Sector B',
          clasificacion: 'Comunitario',
        }),
        201,
      );
      const socio = await responseData(
        await sec(`/juntas/${a.id}/administracion/socios`, 'POST', {
          cedula: '0000000001',
          nombres: 'Socio',
          apellidos: 'Sintético',
          sectorId: sector.id,
        }),
        201,
      );
      const uri = base(a) + '/propiedades';
      const body = {
        nombre: 'Predio de prueba',
        socioId: socio.id,
        sectorId: sector.id,
        dimensiones: '12 × 20 m',
        latitud: '-0.200000',
        longitud: '-78.000000',
      };
      assert.equal(
        (await sec(uri, 'POST', { ...body, latitud: '91' })).status,
        400,
      );
      assert.equal(
        (await sec(uri, 'POST', { ...body, sectorId: foreignSector.id }))
          .status,
        400,
      );
      const item = await responseData(await sec(uri, 'POST', body), 201);
      assert.equal(item.tieneFoto, false);
      const invalid = new globalThis.FormData();
      invalid.append(
        'archivo',
        new globalThis.Blob(['contenido sintético'], { type: 'text/plain' }),
        'prueba.txt',
      );
      assert.equal(
        (await sec(uri + '/' + item.id + '/foto', 'PUT', invalid)).status,
        400,
      );
      const photo = new globalThis.FormData();
      const photoBytes = new Uint8Array(2 * 1024 * 1024);
      photoBytes.set([255, 216, 255, 224]);
      photoBytes.set([255, 217], photoBytes.length - 2);
      photo.append(
        'archivo',
        new globalThis.Blob([photoBytes], { type: 'image/jpeg' }),
        'foto-sintetica.jpg',
      );
      assert.equal(
        (await sec(uri + '/' + item.id + '/foto', 'PUT', photo)).status,
        204,
      );
      const binary = await sec(uri + '/' + item.id + '/foto');
      assert.equal(binary.status, 200);
      assert.equal(binary.headers.get('content-type'), 'image/jpeg');
      assert.equal((await binary.arrayBuffer()).byteLength, photoBytes.length);
      assert.equal((await treasury(uri + '/' + item.id + '/foto')).status, 403);
    },
  );
});
