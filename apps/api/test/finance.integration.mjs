import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { URL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { createApplication } from '../dist/app.js';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { hashPassword } from '../dist/modules/platform/identity/password.js';

const origin = 'https://finanzas-prueba.example';
const loopback = '127.0.0.1';
const password = 'Contraseña sintética de Finanzas';
const appRole = 'multi_junta_app';
const migratorRole = 'multi_junta_migrator';

function isolatedDatabase(variable, role) {
  let url;
  try {
    url = new URL(process.env[variable]);
  } catch {
    assert.fail(`Configura ${variable} para PostgreSQL de pruebas.`);
  }
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(url.hostname && url.username && url.password && !url.hash);
  assert.match(url.pathname, /^\/multi_junta_test_[a-z0-9_]+$/);
  assert.ok(
    [...url.searchParams].every(
      ([key, value]) => key === 'schema' && value === 'multi_junta',
    ),
  );
  assert.ok(url.searchParams.getAll('schema').length <= 1);
  const user = decodeURIComponent(url.username);
  if (role) assert.equal(user, role);
  return {
    url: url.toString(),
    user,
    path: url.pathname,
    location: `${url.hostname}:${url.port || 5432}${url.pathname}`,
  };
}

function connect({ url }) {
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: url, max: 1 },
      { schema: 'multi_junta' },
    ),
  });
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requestApi(url) {
  return (path, { method = 'GET', session, body, csrf } = {}) => {
    const headers = { origin };
    if (session) {
      headers.cookie = session.cookie;
      headers['x-csrf-token'] = csrf ?? session.csrf;
    } else if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
    const isForm = body instanceof globalThis.FormData;
    if (body !== undefined && !isForm)
      headers['content-type'] = 'application/json';
    return globalThis.fetch(new URL(`/api/v1${path}`, url), {
      method,
      headers,
      body: isForm ? body : JSON.stringify(body),
    });
  };
}

async function json(response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}

async function readSession(response) {
  const projection = await json(response);
  const setCookie = response.headers.getSetCookie()[0];
  assert.ok(setCookie);
  return { cookie: setCookie.split(';', 1)[0], csrf: projection.csrfToken };
}

async function enter(request, user, juntaId) {
  const provisional = await readSession(
    await request('/auth/iniciar-sesion', {
      method: 'POST',
      csrf: 'inicio',
      body: { usuario: user, contrasena: password },
    }),
  );
  return readSession(
    await request('/auth/contexto', {
      method: 'POST',
      session: provisional,
      body: { juntaId },
    }),
  );
}

test('finanzas, correcciones y aislamiento con PostgreSQL real', async (context) => {
  const appConfig = isolatedDatabase('APP_DATABASE_URL', appRole);
  const migratorConfig = isolatedDatabase(
    'MIGRATION_DATABASE_URL',
    migratorRole,
  );
  const adminConfig = isolatedDatabase('IDENTITY_TEST_ADMIN_URL');
  assert.equal(appConfig.location, migratorConfig.location);
  assert.equal(appConfig.location, adminConfig.location);
  assert.ok(
    ![appRole, migratorRole, 'multi_junta_identity'].includes(adminConfig.user),
  );

  const runtime = connect(appConfig);
  const admin = connect(adminConfig);
  context.after(() =>
    Promise.all([runtime.$disconnect(), admin.$disconnect()]),
  );
  const [[runtimeIdentity], [adminIdentity]] = await Promise.all(
    [runtime, admin].map(
      (client) => client.$queryRaw`
    SELECT current_database()::text AS db, current_user::text AS user, rolsuper AS superuser, rolbypassrls AS bypass
    FROM pg_roles WHERE rolname = current_user
  `,
    ),
  );
  assert.deepEqual(runtimeIdentity, {
    db: appConfig.path.slice(1),
    user: appRole,
    superuser: false,
    bypass: false,
  });
  assert.equal(adminIdentity.db, adminConfig.path.slice(1));
  assert.equal(adminIdentity.user, adminConfig.user);
  assert.equal(adminIdentity.superuser, true);
  const [{ locked }] = await admin.$queryRaw`
    SELECT pg_try_advisory_lock(hashtext(current_database()), hashtext('identidad-fixture')) AS locked
  `;
  assert.ok(locked);
  const oldIpAttempts = await admin.$queryRaw`
    SELECT dimension, huella, ventana_inicio, intentos FROM multi_junta.intento_autenticacion WHERE huella = ${digest(loopback)}
  `;

  const [juntaA, juntaB, activity] = Array.from({ length: 3 }, randomUUID);
  const suffix = juntaA.slice(0, 8);
  const ruc =
    '000' +
    BigInt('0x' + suffix)
      .toString(10)
      .padStart(10, '0');
  const [adminUser, secretaryUser, treasuryUser] = [
    'admin',
    'secre',
    'tesorero',
  ].map((role) => `fin-${role}-${suffix}`);
  const accounts = [adminUser, secretaryUser, treasuryUser].map(
    (nombreUsuarioNormalizado) => ({
      id: randomUUID(),
      nombreUsuarioNormalizado,
    }),
  );
  const accountIds = accounts.map(({ id }) => id);
  const juntaIds = [juntaA, juntaB];
  const [socioA, socioB, socioC] = Array.from({ length: 3 }, randomUUID);
  const [attendancePaid, attendanceUnpaid, attendancePending] = Array.from(
    { length: 3 },
    randomUUID,
  );

  process.env.AUTH_ORIGIN = origin;
  const app = await createApplication({ logger: false });
  context.after(() => app.close());
  await app.listen(0, loopback);
  const request = requestApi(await app.getUrl());
  const finance = (junta, path) => `/juntas/${junta}/finanzas/${path}`;
  const hash = await hashPassword(password);
  const [{ pastDay, firstDay, laterDay }] = await admin.$queryRaw`
    WITH clock AS (SELECT (statement_timestamp() AT TIME ZONE 'America/Guayaquil')::date AS today)
    SELECT (today - 1)::text AS "pastDay", (today + 1)::text AS "firstDay", (today + 2)::text AS "laterDay" FROM clock
  `;
  try {
    await admin.$transaction(async (tx) => {
      await tx.junta.createMany({
        data: juntaIds.map((id) => ({
          id,
          nombre: `Junta sintética ${id.slice(0, 8)}`,
          tipo: 'PRUEBA',
          ruc: id === juntaA ? ruc : null,
        })),
      });
      await tx.cuenta.createMany({
        data: accounts.map((account) => ({ ...account, hashContrasena: hash })),
      });
      await tx.membresia.createMany({
        data: [
          {
            juntaId: juntaA,
            cuentaId: accountIds[0],
            rolCodigo: 'ADMIN_JUNTA',
          },
          { juntaId: juntaA, cuentaId: accountIds[1], rolCodigo: 'SECRETARIA' },
          { juntaId: juntaA, cuentaId: accountIds[2], rolCodigo: 'TESORERIA' },
          { juntaId: juntaB, cuentaId: accountIds[2], rolCodigo: 'TESORERIA' },
        ],
      });
      for (const [index, id] of [socioA, socioB, socioC].entries()) {
        const document = String(index + 1).padStart(10, '0');
        await tx.$executeRaw`
          INSERT INTO multi_junta.socio (id, junta_id, cedula, nombres, apellidos)
          VALUES (${id}::uuid, ${juntaA}::uuid, ${document}, 'Socio sintético', ${String(index + 1)})
        `;
      }
      await tx.$executeRaw`
        INSERT INTO multi_junta.actividad (id, junta_id, tipo, titulo, inicio, fin, lugar, estado)
        VALUES (${activity}::uuid, ${juntaA}::uuid, 'ASAMBLEA', 'Asamblea sintética', ${`${laterDay}T01:00Z`}::timestamptz,
          ${`${laterDay}T02:00Z`}::timestamptz, 'Sede sintética', 'CERRADA')
      `;
      for (const [index, id] of [
        attendancePaid,
        attendanceUnpaid,
        attendancePending,
      ].entries()) {
        const socio = [socioA, socioB, socioC][index];
        await tx.$executeRaw`
          INSERT INTO multi_junta.asistencia (id, junta_id, actividad_id, socio_id, nombres, apellidos, estado)
          VALUES (${id}::uuid, ${juntaA}::uuid, ${activity}::uuid, ${socio}::uuid, 'Socio sintético', ${String(index + 1)}, 'AUSENTE')
        `;
      }
      await tx.$executeRaw`
        INSERT INTO multi_junta.justificacion (junta_id, asistencia_id, motivo)
        VALUES (${juntaA}::uuid, ${attendancePending}::uuid, 'Motivo sintético')
      `;
    });

    const administrator = await enter(request, adminUser, juntaA);
    const secretary = await enter(request, secretaryUser, juntaA);
    const treasury = await enter(request, treasuryUser, juntaA);
    const treasuryB = await enter(request, treasuryUser, juntaB);

    const tariffPayload = {
      tipo: 'ASAMBLEA',
      vigenteDesde: firstDay,
      monto: '5.75',
    };
    const addTariff = (session, body) =>
      request(finance(juntaA, 'tarifas'), { method: 'POST', session, body });
    assert.equal((await addTariff(secretary, tariffPayload)).status, 403);
    assert.equal(
      (
        await addTariff(administrator, {
          ...tariffPayload,
          vigenteDesde: pastDay,
        })
      ).status,
      400,
    );
    assert.equal(
      (await addTariff(administrator, { ...tariffPayload, monto: '5.751' }))
        .status,
      400,
    );
    const tariff = await json(
      await addTariff(administrator, tariffPayload),
      201,
    );
    await json(
      await addTariff(administrator, {
        ...tariffPayload,
        vigenteDesde: laterDay,
        monto: '10.25',
      }),
      201,
    );
    assert.equal((await addTariff(administrator, tariffPayload)).status, 409);

    const candidates = await json(
      await request(
        finance(juntaA, `multas/candidatas?actividadId=${activity}`),
        { session: secretary },
      ),
    );
    assert.deepEqual(
      candidates.map(({ asistenciaId }) => asistenciaId).sort(),
      [attendancePaid, attendanceUnpaid].sort(),
    );
    assert.ok(
      candidates.every(
        ({ tarifaId, monto }) => tarifaId === tariff.id && monto === '5.75',
      ),
    );
    const finesRequest = (asistenciaIds) =>
      request(finance(juntaA, 'multas'), {
        method: 'POST',
        session: secretary,
        body: { actividadId: activity, asistenciaIds },
      });
    assert.equal(
      (await finesRequest([attendancePaid, attendancePending])).status,
      409,
    );
    const fines = await json(
      await finesRequest([attendancePaid, attendanceUnpaid]),
      201,
    );
    assert.equal((await finesRequest([attendancePaid])).status, 409);
    const paidFine = fines.find(
      ({ asistenciaId }) => asistenciaId === attendancePaid,
    );
    const unpaidFine = fines.find(
      ({ asistenciaId }) => asistenciaId === attendanceUnpaid,
    );
    assert.equal(fines.length, 2);

    const body = {
      obligacionId: paidFine.id,
      monto: '5.75',
      fecha: laterDay,
      metodo: 'Efectivo',
      solicitudId: randomUUID(),
    };
    const pay = (payload, session = treasury) =>
      request(finance(juntaA, 'pagos'), {
        method: 'POST',
        session,
        body: payload,
      });
    assert.equal((await pay(body, secretary)).status, 403);
    assert.equal((await pay({ ...body, monto: '5.00' })).status, 409);
    const payments = await Promise.all([pay(body), pay(body)]);
    const [payment, retry] = await Promise.all(
      payments.map((response) => json(response, 201)),
    );
    assert.deepEqual(payment, retry);
    assert.equal(payment.numeroComprobante, '1');
    await admin.junta.update({ where: { id: juntaA }, data: { ruc: null } });
    const [snapshot] = await admin.$queryRaw`
      SELECT junta_ruc AS ruc FROM multi_junta.pago WHERE id = ${payment.id}::uuid
    `;
    assert.equal(snapshot.ruc, ruc);
    assert.equal((await pay({ ...body, metodo: 'Transferencia' })).status, 409);
    assert.equal(
      (
        await request(finance(juntaB, `pagos/${payment.id}/comprobante`), {
          session: treasuryB,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(finance(juntaA, `pagos/${payment.id}/comprobante`), {
          session: treasuryB,
        })
      ).status,
      403,
    );
    const receiptResponse = await request(
      finance(juntaA, `pagos/${payment.id}/comprobante`),
      { session: treasury },
    );
    assert.equal(receiptResponse.status, 200);
    assert.match(
      receiptResponse.headers.get('content-type'),
      /application\/pdf/,
    );
    const receipt = Buffer.from(await receiptResponse.arrayBuffer());
    assert.equal(receipt.subarray(0, 5).toString('ascii'), '%PDF-');

    for (const socio of [socioA, socioB]) {
      await json(
        await request(
          `/juntas/${juntaA}/administracion/actividades/${activity}/asistencias/${socio}`,
          {
            method: 'PUT',
            session: secretary,
            body: { estado: 'PRESENTE', motivo: 'Corrección sintética' },
          },
        ),
      );
    }
    const corrected = await json(
      await request(finance(juntaA, 'multas'), { session: treasury }),
    );
    assert.equal(
      corrected.find(({ id }) => id === paidFine.id).estado,
      'REVISION_PENDIENTE',
    );
    assert.equal(
      corrected.find(({ id }) => id === unpaidFine.id).estado,
      'ANULADA',
    );
    const voided = await json(
      await request(finance(juntaA, `pagos/${payment.id}/anular`), {
        method: 'POST',
        session: treasury,
        body: { motivo: 'Corrección contable sintética' },
      }),
      201,
    );
    assert.equal(voided.estado, 'ANULADO');
    assert.equal(voided.numeroComprobante, '1');
    const archivedResponse = await request(
      finance(juntaA, `pagos/${payment.id}/comprobante`),
      { session: treasury },
    );
    assert.equal(archivedResponse.status, 200);
    const archived = Buffer.from(await archivedResponse.arrayBuffer());
    assert.equal(archived.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(archived.includes(Buffer.from('ANULADO')));
    assert.notDeepEqual(archived, receipt);
    const direct = await json(
      await pay({
        socioId: socioA,
        concepto: 'Cuota sintética',
        monto: '18.00',
        fecha: laterDay,
        metodo: 'Efectivo',
        solicitudId: randomUUID(),
      }),
      201,
    );
    assert.equal(direct.numeroComprobante, '2');

    const form = new globalThis.FormData();
    for (const [key, value] of Object.entries({
      concepto: 'Insumo de prueba',
      descripcion: 'Respaldo sintético',
      monto: '4.05',
      fecha: laterDay,
      beneficiario: 'Proveedor sintético',
    })) {
      form.set(key, value);
    }
    form.set(
      'archivo',
      new globalThis.Blob([receipt], { type: 'application/pdf' }),
      'respaldo.pdf',
    );
    const expense = await json(
      await request(finance(juntaA, 'gastos'), {
        method: 'POST',
        session: treasury,
        body: form,
      }),
      201,
    );
    assert.equal(expense.monto, '4.05');
    assert.equal(expense.nombreArchivo, 'respaldo.pdf');
    const download = await request(
      finance(juntaA, `gastos/${expense.id}/archivo`),
      { session: treasury },
    );
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), receipt);
    assert.equal(
      (
        await request(finance(juntaA, `gastos/${expense.id}/archivo`), {
          session: secretary,
        })
      ).status,
      403,
    );

    assert.deepEqual(
      await runtime.$queryRaw`SELECT id FROM multi_junta.pago`,
      [],
    );
    const audit = await admin.$queryRaw`
      SELECT objeto_id AS id, evento FROM multi_junta.operacion_auditoria WHERE junta_id = ${juntaA}::uuid AND tabla = 'pago'
    `;
    assert.ok(
      audit.some(({ id, evento }) => id === payment.id && evento === 'INSERT'),
    );
    assert.ok(
      audit.some(({ id, evento }) => id === payment.id && evento === 'UPDATE'),
    );
  } finally {
    await admin.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM multi_junta.auditoria_identidad
        WHERE cuenta_id = ANY(${accountIds}::uuid[])
           OR objetivo_cuenta_id = ANY(${accountIds}::uuid[])
           OR junta_id = ANY(${juntaIds}::uuid[])
      `;
      await tx.$executeRaw`DELETE FROM multi_junta.operacion_auditoria WHERE junta_id = ANY(${juntaIds}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.pago WHERE junta_id = ANY(${juntaIds}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.gasto WHERE junta_id = ANY(${juntaIds}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.contador_comprobante WHERE junta_id = ANY(${juntaIds}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.obligacion WHERE junta_id = ANY(${juntaIds}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.tarifa_multa WHERE junta_id = ANY(${juntaIds}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.justificacion WHERE junta_id = ANY(${juntaIds}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.historial_asistencia WHERE junta_id = ANY(${juntaIds}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.asistencia WHERE junta_id = ANY(${juntaIds}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.actividad WHERE junta_id = ANY(${juntaIds}::uuid[])`;
      await tx.$executeRaw`DELETE FROM multi_junta.socio WHERE junta_id = ANY(${juntaIds}::uuid[])`;
      await tx.sesion.deleteMany({ where: { cuentaId: { in: accountIds } } });
      await tx.membresia.deleteMany({
        where: { cuentaId: { in: accountIds } },
      });
      await tx.cuenta.deleteMany({ where: { id: { in: accountIds } } });
      await tx.junta.deleteMany({ where: { id: { in: juntaIds } } });
      const attempts = [adminUser, secretaryUser, treasuryUser, loopback].map(
        digest,
      );
      await tx.$executeRaw`DELETE FROM multi_junta.intento_autenticacion WHERE huella = ANY(${attempts}::text[])`;
      for (const {
        dimension,
        huella,
        ventana_inicio,
        intentos,
      } of oldIpAttempts) {
        await tx.$executeRaw`
          INSERT INTO multi_junta.intento_autenticacion (dimension, huella, ventana_inicio, intentos)
          VALUES (${dimension}, ${huella}, ${ventana_inicio}, ${intentos})
        `;
      }
    });
  }
});
