import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { hashPassword } from '../dist/modules/platform/identity/password.js';
import {
  login,
  operationalFixture,
  responseData,
  serveApi,
} from '../../../tests/helpers/operational-fixture.mjs';

test('Predios del portal: titularidad, fotografías y bajas con RLS real', async (t) => {
  const {
    db,
    juntas: [a, b],
  } = await operationalFixture(t);
  const origin = await serveApi(t);
  const admin = await login(origin, a.admin, a.id);
  const sec = await login(origin, a.secretaria, a.id);
  const socio = await login(origin, a.socio, a.id);
  const otherJunta = await login(origin, b.socio, b.id);
  const secretaryB = await login(origin, b.secretaria, b.id);
  const adminB = await login(origin, b.admin, b.id);
  const base = `/juntas/${a.id}`;
  const portal = base + '/portal';
  const resources = base + '/recursos/propiedades';

  const otherPassword = 'Prueba-' + randomUUID();
  const account = await db.cuenta.create({
    data: {
      nombreUsuarioNormalizado:
        'socio-predio-' + randomBytes(6).toString('hex'),
      hashContrasena: await hashPassword(otherPassword),
    },
  });
  const otherMembership = await db.membresia.create({
    data: { juntaId: a.id, cuentaId: account.id, rolCodigo: 'SOCIO' },
  });
  const second = await login(
    origin,
    {
      usuario: account.nombreUsuarioNormalizado,
      contrasena: otherPassword,
    },
    a.id,
  );

  const sector = await responseData(
    await admin(base + '/administracion/sectores', 'POST', {
      nombre: 'Sector personal',
      clasificacion: 'Riego',
    }),
    201,
  );
  const remoteSector = await responseData(
    await admin(base + '/administracion/sectores', 'POST', {
      nombre: 'Sector de predios',
      clasificacion: 'Riego',
    }),
    201,
  );
  const foreignSector = await responseData(
    await adminB(`/juntas/${b.id}/administracion/sectores`, 'POST', {
      nombre: 'Sector externo',
      clasificacion: 'Riego',
    }),
    201,
  );

  const owner = await responseData(
    await sec(base + '/administracion/socios', 'POST', {
      cedula:
        '11' +
        randomBytes(4).readUInt32BE(0).toString().padStart(8, '0').slice(0, 8),
      nombres: 'Ana',
      apellidos: 'Propietaria',
      sectorId: sector.id,
    }),
    201,
  );
  const neighbor = await responseData(
    await sec(base + '/administracion/socios', 'POST', {
      cedula:
        '12' +
        randomBytes(4).readUInt32BE(0).toString().padStart(8, '0').slice(0, 8),
      nombres: 'Luis',
      apellidos: 'Vecino',
      sectorId: remoteSector.id,
    }),
    201,
  );
  const foreignOwner = await responseData(
    await secretaryB(`/juntas/${b.id}/administracion/socios`, 'POST', {
      cedula:
        '13' +
        randomBytes(4).readUInt32BE(0).toString().padStart(8, '0').slice(0, 8),
      nombres: 'Olga',
      apellidos: 'Ajena',
      sectorId: foreignSector.id,
    }),
    201,
  );

  const privateProperty = await responseData(
    await sec(resources, 'POST', {
      socioId: owner.id,
      sectorId: remoteSector.id,
      nombre: 'Predio propio verificable',
      dimensiones: '12 x 30 m',
      latitud: '-1.243100',
      longitud: '-78.618700',
    }),
    201,
  );
  const otherProperty = await responseData(
    await sec(resources, 'POST', {
      socioId: neighbor.id,
      sectorId: sector.id,
      nombre: 'Predio ajeno',
      dimensiones: '8 x 12 m',
      latitud: '-1.25',
      longitud: '-78.61',
    }),
    201,
  );
  const unrelatedProperty = await responseData(
    await secretaryB(`/juntas/${b.id}/recursos/propiedades`, 'POST', {
      socioId: foreignOwner.id,
      sectorId: foreignSector.id,
      nombre: 'Predio otra junta',
      dimensiones: '6 x 10 m',
      latitud: '-1.28',
      longitud: '-78.65',
    }),
    201,
  );

  const photoBytes = Buffer.from([255, 216, 255, 224, 1, 2, 3, 4, 5, 255, 217]);
  const photo = new globalThis.FormData();
  photo.set(
    'archivo',
    new globalThis.Blob([photoBytes], { type: 'image/jpeg' }),
    'predio.jpg',
  );
  assert.equal(
    (await sec(resources + '/' + privateProperty.id + '/foto', 'PUT', photo))
      .status,
    204,
  );

  await t.test(
    'sin vínculo, ninguna cuenta Socio accede a predios ni fotos',
    async () => {
      assert.deepEqual(
        await responseData(await socio(portal + '/propiedades')),
        [],
      );
      assert.equal(
        (await socio(portal + '/propiedades/' + privateProperty.id + '/foto'))
          .status,
        404,
      );
      assert.equal((await otherJunta(portal + '/propiedades')).status, 403);
      assert.equal((await sec(portal + '/propiedades')).status, 403);
      assert.equal((await socio(resources)).status, 403);
    },
  );

  const member = await db.membresia.findFirstOrThrow({
    where: { juntaId: a.id, cuentaId: a.socio.cuentaId },
  });
  const invite = await responseData(
    await admin(portal + '/invitaciones', 'POST', {
      socioId: owner.id,
      membresiaId: member.id,
    }),
    201,
  );
  await responseData(
    await socio(portal + '/confirmar', 'POST', { codigo: invite.codigo }),
    201,
  );
  const inviteOther = await responseData(
    await admin(portal + '/invitaciones', 'POST', {
      socioId: neighbor.id,
      membresiaId: otherMembership.id,
    }),
    201,
  );
  await responseData(
    await second(portal + '/confirmar', 'POST', { codigo: inviteOther.codigo }),
    201,
  );

  await t.test(
    'entrega metadatos, nombre de sector y foto solo al titular',
    async () => {
      const items = await responseData(await socio(portal + '/propiedades'));
      assert.equal(items.length, 1);
      assert.equal(items[0].id, privateProperty.id);
      assert.equal(items[0].dimensiones, '12 x 30 m');
      assert.equal(items[0].sectorNombre, 'Sector de predios');
      assert.equal(items[0].latitud, '-1.243100');
      assert.equal(items[0].longitud, '-78.618700');
      assert.equal(items[0].tieneFoto, true);
      const own = await socio(
        portal + '/propiedades/' + privateProperty.id + '/foto',
      );
      assert.equal(own.status, 200);
      assert.match(own.headers.get('content-type'), /image\/jpeg/);
      assert.match(own.headers.get('cache-control') ?? '', /no-store/);
      assert.deepEqual(Buffer.from(await own.arrayBuffer()), photoBytes);
      assert.equal(
        (await second(portal + '/propiedades/' + privateProperty.id + '/foto'))
          .status,
        404,
      );
      assert.equal(
        (await socio(portal + '/propiedades/' + otherProperty.id + '/foto'))
          .status,
        404,
      );
      assert.equal(
        (await socio(portal + '/propiedades/' + unrelatedProperty.id + '/foto'))
          .status,
        404,
      );
      assert.equal(
        (
          await otherJunta(
            portal + '/propiedades/' + privateProperty.id + '/foto',
          )
        ).status,
        403,
      );
      assert.deepEqual(
        (await responseData(await second(portal + '/propiedades'))).map(
          (p) => p.id,
        ),
        [otherProperty.id],
      );
    },
  );

  await t.test(
    'baja lógica oculta predio y fotografía al Socio, conserva acceso de Secretaría',
    async () => {
      const disabled = await responseData(
        await sec(resources + '/' + privateProperty.id, 'PATCH', {
          estado: 'INACTIVA',
        }),
      );
      assert.equal(disabled.estado, 'INACTIVA');
      assert.deepEqual(
        await responseData(await socio(portal + '/propiedades')),
        [],
      );
      assert.equal(
        (await socio(portal + '/propiedades/' + privateProperty.id + '/foto'))
          .status,
        404,
      );
      assert.equal(
        (await sec(resources + '/' + privateProperty.id + '/foto')).status,
        200,
      );
    },
  );
});
