import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { URL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { createApplication } from '../dist/app.js';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { hashPassword } from '../dist/modules/platform/identity/password.js';

const origin = 'https://administracion-prueba.example';
const loopback = '127.0.0.1';
const password = 'Contraseña sintética de Administración';

function connection(variable) {
  let url;
  try {
    url = new URL(process.env[variable]);
  } catch {
    assert.fail(`Configura ${variable} para una base PostgreSQL aislada.`);
  }
  assert.ok(
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname &&
      url.username &&
      url.password &&
      !url.hash &&
      /^\/multi_junta_test_[a-z0-9_]+$/.test(url.pathname) &&
      [...url.searchParams].every(
        ([key, value]) => key === 'schema' && value === 'multi_junta',
      ),
    `${variable} debe apuntar a una base aislada multi_junta_test_…`,
  );
  return url;
}

function clientFor(url) {
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: url.toString(), max: 1 },
      { schema: 'multi_junta' },
    ),
  });
}

function http(base) {
  return async (
    path,
    { method = 'GET', session, body, csrf = session?.csrf } = {},
  ) => {
    const headers = { origin };
    if (session) headers.cookie = session.cookie;
    if (csrf) headers['x-csrf-token'] = csrf;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await globalThis.fetch(new URL(`/api/v1${path}`, base), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookies: response.headers.getSetCookie(),
    };
  };
}

function verify(response, status) {
  assert.equal(response.status, status, response.body?.message);
  return response.body;
}

function sessionFrom(response) {
  const body = verify(response, 200);
  const cookie = response.cookies.find((value) =>
    value.startsWith('multi_junta_sesion='),
  );
  assert.ok(cookie, 'La respuesta debe emitir una cookie de sesión.');
  return { csrf: body.csrfToken, cookie: cookie.split(';', 1)[0] };
}

async function login(request, user) {
  const preliminary = sessionFrom(
    await request('/auth/iniciar-sesion', {
      method: 'POST',
      csrf: 'inicio',
      body: { usuario: user.name, contrasena: password },
    }),
  );
  return sessionFrom(
    await request('/auth/contexto', {
      method: 'POST',
      session: preliminary,
      body: { juntaId: user.junta },
    }),
  );
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('administración comunitaria con PostgreSQL y dos juntas', async (context) => {
  const appUrl = connection('APP_DATABASE_URL');
  const adminUrl = connection('IDENTITY_TEST_ADMIN_URL');
  assert.equal(
    `${adminUrl.hostname}:${adminUrl.port || 5432}${adminUrl.pathname}`,
    `${appUrl.hostname}:${appUrl.port || 5432}${appUrl.pathname}`,
  );
  assert.equal(decodeURIComponent(appUrl.username), 'multi_junta_app');

  const admin = clientFor(adminUrl);
  const runtime = clientFor(appUrl);
  context.after(() =>
    Promise.all([admin.$disconnect(), runtime.$disconnect()]),
  );
  const [adminConnection] = await admin.$queryRaw`
    SELECT current_database() AS database, rolsuper AS superuser FROM pg_catalog.pg_roles WHERE rolname = current_user
  `;
  assert.deepEqual(adminConnection, {
    database: adminUrl.pathname.slice(1),
    superuser: true,
  });
  const [{ locked }] = await admin.$queryRaw`
    SELECT pg_try_advisory_lock(hashtext(current_database()), hashtext('identidad-fixture')) AS locked
  `;
  assert.equal(
    locked,
    true,
    'La base de pruebas debe estar disponible para esta fixture.',
  );

  const suffix = randomUUID().slice(0, 8);
  const juntaA = randomUUID();
  const juntaB = randomUUID();
  const juntas = [juntaA, juntaB];
  const users = [
    ['admin-a', juntaA, 'ADMIN_JUNTA'],
    ['admin-b', juntaB, 'ADMIN_JUNTA'],
    ['sec-a', juntaA, 'SECRETARIA'],
    ['sec-b', juntaB, 'SECRETARIA'],
    ['tes-a', juntaA, 'TESORERIA'],
    ['socio-a1', juntaA, 'SOCIO'],
    ['socio-a2', juntaA, 'SOCIO'],
  ].map(([key, junta, role]) => ({
    id: randomUUID(),
    name: `ac-${key}-${suffix}`,
    key,
    junta,
    role,
  }));
  const accounts = users.map(({ id }) => id);
  const hashes = [...users.map(({ name }) => digest(name)), digest(loopback)];
  const previousIp = await admin.$queryRaw`
    SELECT dimension, huella, ventana_inicio, intentos FROM multi_junta.intento_autenticacion WHERE huella = ${digest(loopback)}
  `;
  await admin.$executeRaw`DELETE FROM multi_junta.intento_autenticacion WHERE huella = ${digest(loopback)}`;

  try {
    const hash = await hashPassword(password);
    await admin.$transaction(async (tx) => {
      await tx.junta.createMany({
        data: juntas.map((id, index) => ({
          id,
          nombre: `Junta sintética AC ${suffix} ${index}`,
          tipo: 'PRUEBA',
        })),
      });
      await tx.cuenta.createMany({
        data: users.map(({ id, name }) => ({
          id,
          nombreUsuarioNormalizado: name,
          hashContrasena: hash,
        })),
      });
      await tx.membresia.createMany({
        data: users.map(({ id, junta, role }) => ({
          cuentaId: id,
          juntaId: junta,
          rolCodigo: role,
        })),
      });
    });

    process.env.AUTH_ORIGIN = origin;
    const app = await createApplication({ logger: false });
    try {
      await app.listen(0, loopback);
      const request = http(await app.getUrl());
      const sessions = {};
      for (const user of users) sessions[user.key] = await login(request, user);
      const pathA = `/juntas/${juntaA}/administracion`;
      const pathB = `/juntas/${juntaB}/administracion`;
      const adminA = sessions['admin-a'];
      const adminB = sessions['admin-b'];
      const secretaryA = sessions['sec-a'];
      const secretaryB = sessions['sec-b'];
      const treasurerA = sessions['tes-a'];
      const sectorBody = {
        nombre: 'Sector sintético',
        clasificacion: 'PRUEBA',
      };
      const sectorA = verify(
        await request(`${pathA}/sectores`, {
          method: 'POST',
          session: adminA,
          body: sectorBody,
        }),
        201,
      );
      const sectorB = verify(
        await request(`${pathB}/sectores`, {
          method: 'POST',
          session: adminB,
          body: sectorBody,
        }),
        201,
      );
      verify(
        await request(`${pathA}/sectores`, {
          method: 'POST',
          session: secretaryA,
          body: sectorBody,
        }),
        403,
      );
      verify(
        await request(`${pathA}/sectores`, {
          method: 'POST',
          session: adminA,
          csrf: null,
          body: sectorBody,
        }),
        403,
      );
      assert.equal(
        verify(await request(`${pathA}/sectores`, { session: secretaryA }), 200)
          .length,
        1,
      );
      verify(
        await request(`${pathA}/sectores/${sectorB.id}`, { session: adminA }),
        404,
      );
      verify(await request(`${pathB}/sectores`, { session: adminA }), 403);

      const socioBody = {
        cedula: '0000000001',
        nombres: 'Socio sintético',
        apellidos: 'Registro A',
        sectorId: sectorA.id,
      };
      const socioA = verify(
        await request(`${pathA}/socios`, {
          method: 'POST',
          session: secretaryA,
          body: socioBody,
        }),
        201,
      );
      const secondA = verify(
        await request(`${pathA}/socios`, {
          method: 'POST',
          session: secretaryA,
          body: {
            ...socioBody,
            cedula: '0000000002',
            apellidos: 'Registro segundo',
          },
        }),
        201,
      );
      verify(
        await request(`${pathA}/socios`, {
          method: 'POST',
          session: secretaryA,
          body: socioBody,
        }),
        409,
      );
      verify(
        await request(`${pathA}/socios`, {
          method: 'POST',
          session: secretaryA,
          body: { ...socioBody, cedula: '0000000003', sectorId: sectorB.id },
        }),
        400,
      );
      const socioB = verify(
        await request(`${pathB}/socios`, {
          method: 'POST',
          session: secretaryB,
          body: { ...socioBody, sectorId: sectorB.id },
        }),
        201,
      );
      verify(
        await request(`${pathA}/socios/${socioB.id}`, { session: secretaryA }),
        404,
      );
      for (const key of ['socio-a1', 'socio-a2']) {
        verify(
          await request(`${pathA}/socios/${socioA.id}`, {
            session: sessions[key],
          }),
          403,
        );
      }
      const [treasuryView] = verify(
        await request(`${pathA}/socios?q=Registro%20A`, {
          session: treasurerA,
        }),
        200,
      );
      assert.equal(treasuryView.id, socioA.id);
      assert.equal('cedula' in treasuryView, false);
      assert.equal(
        verify(
          await request(`${pathA}/socios?q=0000000001`, {
            session: secretaryA,
          }),
          200,
        )[0].id,
        socioA.id,
      );

      const activityBody = {
        tipo: 'ASAMBLEA',
        titulo: 'Asamblea sintética',
        lugar: 'Sede sintética',
        inicio: '2030-07-10T09:00:00-05:00',
        fin: '2030-07-10T11:00:00-05:00',
      };
      const activity = verify(
        await request(`${pathA}/actividades`, {
          method: 'POST',
          session: secretaryA,
          body: activityBody,
        }),
        201,
      );
      verify(
        await request(`${pathA}/socios/${secondA.id}`, {
          method: 'PATCH',
          session: secretaryA,
          body: { estado: 'INACTIVA' },
        }),
        200,
      );
      const detailPath = `${pathA}/actividades/${activity.id}`;
      const first = verify(
        await request(detailPath, { session: secretaryA }),
        200,
      );
      assert.deepEqual(
        first.participantes.map((entry) => entry.socioId).sort(),
        [socioA.id, secondA.id].sort(),
      );
      assert.ok(first.participantes.every(({ estado }) => estado === null));
      verify(
        await request(`${detailPath}/cerrar`, {
          method: 'POST',
          session: secretaryA,
        }),
        409,
      );
      const firstAttendance = `${detailPath}/asistencias/${socioA.id}`;
      const secondAttendance = `${detailPath}/asistencias/${secondA.id}`;
      verify(
        await request(firstAttendance, {
          method: 'PUT',
          session: secretaryA,
          body: { estado: 'AUSENTE' },
        }),
        200,
      );
      verify(
        await request(secondAttendance, {
          method: 'PUT',
          session: secretaryA,
          body: { estado: 'PRESENTE' },
        }),
        200,
      );
      assert.equal(
        verify(
          await request(`${detailPath}/cerrar`, {
            method: 'POST',
            session: secretaryA,
          }),
          200,
        ).estado,
        'CERRADA',
      );
      verify(
        await request(detailPath, {
          method: 'PATCH',
          session: secretaryA,
          body: { lugar: 'Cambio' },
        }),
        409,
      );
      verify(
        await request(firstAttendance, {
          method: 'PUT',
          session: secretaryA,
          body: { estado: 'PRESENTE' },
        }),
        400,
      );
      const justification = verify(
        await request(`${firstAttendance}/justificaciones`, {
          method: 'POST',
          session: secretaryA,
          body: { motivo: 'Documento sintético recibido' },
        }),
        201,
      );
      verify(
        await request(`${firstAttendance}/justificaciones`, {
          method: 'POST',
          session: secretaryA,
          body: { motivo: 'Duplicada' },
        }),
        409,
      );
      verify(
        await request(
          `${secondAttendance}/justificaciones/${justification.id}`,
          {
            method: 'PATCH',
            session: secretaryA,
            body: { decision: 'ACEPTADA', motivo: 'Prueba de vínculo' },
          },
        ),
        404,
      );
      verify(
        await request(
          `${firstAttendance}/justificaciones/${justification.id}`,
          {
            method: 'PATCH',
            session: secretaryA,
            body: { decision: 'ACEPTADA', motivo: 'Constancia revisada' },
          },
        ),
        200,
      );
      const updated = verify(
        await request(detailPath, { session: secretaryA }),
        200,
      ).participantes.find((entry) => entry.socioId === socioA.id);
      assert.equal(updated.estado, 'JUSTIFICADO');
      assert.equal(updated.justificaciones[0].estado, 'ACEPTADA');
      assert.deepEqual(
        updated.historial.map(({ estadoAnterior, estadoResultante }) => [
          estadoAnterior,
          estadoResultante,
        ]),
        [
          [null, 'AUSENTE'],
          ['AUSENTE', 'JUSTIFICADO'],
        ],
      );
      assert.deepEqual(
        await runtime.$queryRaw`SELECT id FROM multi_junta.socio`,
        [],
      );
      assert.deepEqual(
        await runtime.$queryRaw`SELECT id FROM multi_junta.asistencia`,
        [],
      );
      const [audit] = await admin.$queryRaw`
        SELECT count(*)::int AS count FROM multi_junta.operacion_auditoria
        WHERE junta_id = ${juntaA}::uuid AND tabla = 'justificacion' AND objeto_id = ${justification.id}::uuid
      `;
      assert.equal(audit.count, 2);
    } finally {
      await app.close();
    }
  } finally {
    await admin.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM multi_junta.operacion_auditoria WHERE junta_id = ANY(${juntas}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.justificacion WHERE junta_id = ANY(${juntas}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.historial_asistencia WHERE junta_id = ANY(${juntas}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.asistencia WHERE junta_id = ANY(${juntas}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.actividad WHERE junta_id = ANY(${juntas}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.socio WHERE junta_id = ANY(${juntas}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.sector WHERE junta_id = ANY(${juntas}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.auditoria_identidad WHERE cuenta_id = ANY(${accounts}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.sesion WHERE cuenta_id = ANY(${accounts}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.membresia WHERE cuenta_id = ANY(${accounts}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.cuenta WHERE id = ANY(${accounts}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.junta WHERE id = ANY(${juntas}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.intento_autenticacion WHERE huella = ANY(${hashes}::text[])`;
      for (const counter of previousIp) {
        await tx.$executeRaw`
          INSERT INTO multi_junta.intento_autenticacion (dimension, huella, ventana_inicio, intentos)
          VALUES (${counter.dimension}, ${counter.huella}, ${counter.ventana_inicio}, ${counter.intentos})
        `;
      }
    });
  }
});
