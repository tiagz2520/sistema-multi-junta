import assert from 'node:assert/strict';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { URL } from 'node:url';
import { verify } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { createApplication } from '../dist/app.js';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { hashPassword } from '../dist/modules/platform/identity/password.js';

const origin = 'https://plataforma-prueba.example';
const loopback = '127.0.0.1';
const password = 'Contraseña sintética de Plataforma 1C';
const appRole = 'multi_junta_app';
const migratorRole = 'multi_junta_migrator';
const identityRole = 'multi_junta_identity';

const api = {
  juntas: '/plataforma/juntas',
  junta: (juntaId) => `/plataforma/juntas/${juntaId}`,
  local: (juntaId) => `/juntas/${juntaId}`,
  members: (juntaId) => `/juntas/${juntaId}/membresias`,
};

function fixtureUrl(variable, expectedRole) {
  let url;
  let role;
  try {
    url = new URL(process.env[variable]);
    role = decodeURIComponent(url.username);
  } catch {
    assert.fail(`Configura ${variable} para la base PostgreSQL de pruebas.`);
  }
  assert.ok(
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname &&
      role &&
      url.password &&
      !url.hash &&
      /^\/multi_junta_test_[a-z0-9_]+$/.test(url.pathname),
    `${variable} debe apuntar a una base aislada multi_junta_test_…`,
  );
  assert.ok(
    [...url.searchParams].every(
      ([key, value]) => key === 'schema' && value === 'multi_junta',
    ) && url.searchParams.getAll('schema').length <= 1,
    `${variable} solo admite el parámetro schema=multi_junta.`,
  );
  if (expectedRole) assert.equal(role, expectedRole);
  return {
    role,
    database: url.pathname.slice(1),
    destination: `${url.hostname}:${url.port || 5432}${url.pathname}`,
    connectionString: url.toString(),
  };
}

function connect(url) {
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: url.connectionString, max: 1 },
      { schema: 'multi_junta' },
    ),
  });
}

async function verifyConnection(client, { role, database }, isSuperuser) {
  const [connection] = await client.$queryRaw`
    SELECT current_database()::text AS database, current_user::text AS role,
      session_user::text AS "sessionRole", rolsuper AS "isSuperuser"
    FROM pg_roles WHERE rolname = current_user
  `;
  assert.deepEqual(connection, {
    database,
    role,
    sessionRole: role,
    isSuperuser,
  });
}

async function assertDenied(runtime, action) {
  await assert.rejects(
    runtime.$transaction(async (tx) => {
      await action(tx);
      assert.fail('La cuenta de ejecución obtuvo un permiso directo.');
    }),
    (error) => {
      assert.equal(
        error?.meta?.driverAdapterError?.cause?.originalCode ??
          error?.meta?.code,
        '42501',
      );
      return true;
    },
  );
}

function apiRequest(baseUrl) {
  return async (
    path,
    { method = 'GET', session, body, from = origin, csrf = session?.csrf } = {},
  ) => {
    const headers = {};
    if (from) headers.origin = from;
    if (csrf) headers['x-csrf-token'] = csrf;
    if (session) headers.cookie = session.cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await globalThis.fetch(
      new URL(`/api/v1${path}`, baseUrl),
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return {
      status: response.status,
      body: response.status === 204 ? undefined : await response.json(),
      headers: response.headers,
    };
  };
}

function assertStatus(response, status) {
  assert.equal(response.status, status);
  return response.body;
}

function sessionFrom(response) {
  const view = assertStatus(response, 200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('multi_junta_sesion='));
  assert.ok(cookie, 'El inicio o cambio de contexto debe entregar una cookie.');
  return { view, cookie: cookie.split(';', 1)[0], csrf: view.csrfToken };
}

function authLogin(request, usuario, contrasena = password) {
  return request('/auth/iniciar-sesion', {
    method: 'POST',
    csrf: 'inicio',
    body: { usuario, contrasena },
  });
}

async function selectJunta(request, session, juntaId) {
  const selected = sessionFrom(
    await request('/auth/contexto', {
      method: 'POST',
      session,
      body: { juntaId },
    }),
  );
  assert.equal(selected.view.ambito, 'JUNTA');
  assert.equal(selected.view.juntaId, juntaId);
  return selected;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sessionFingerprint(session) {
  return digest(session.cookie.slice('multi_junta_sesion='.length));
}

function fixtureData() {
  const suffix = randomUUID().slice(0, 8);
  const usernames = Object.fromEntries(
    [
      'plataforma',
      'admin',
      'socio',
      'secretaria-a',
      'secretaria-b',
      'repetida',
      'inactiva',
    ].map((key) => [key, `1c-${key}-${suffix}`]),
  );
  const juntaNames = Object.fromEntries(
    ['A', 'B', 'RUC repetido', 'CSRF', 'RUC inválido'].map((key) => [
      key,
      `Junta sintética 1C ${key} ${suffix}`,
    ]),
  );
  const pagination = Array.from({ length: 26 }, (_, index) => ({
    id: randomUUID(),
    nombre: `Junta sintética 1C página ${suffix} ${index}`,
    tipo: 'PRUEBA',
  }));
  return {
    usernames,
    juntaNames,
    pagination,
    ruc: `00000${String(randomInt(100_000_000)).padStart(8, '0')}`,
  };
}

async function cleanup(admin, fixture, previousIpAttempts) {
  const juntas = await admin.junta.findMany({
    where: {
      nombre: {
        in: [
          ...Object.values(fixture.juntaNames),
          ...fixture.pagination.map(({ nombre }) => nombre),
        ],
      },
    },
    select: { id: true },
  });
  const accounts = await admin.cuenta.findMany({
    where: {
      nombreUsuarioNormalizado: { in: Object.values(fixture.usernames) },
    },
    select: { id: true },
  });
  const juntaIds = juntas.map(({ id }) => id);
  const accountIds = accounts.map(({ id }) => id);
  const attemptHashes = [...Object.values(fixture.usernames), loopback].map(
    digest,
  );
  await admin.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM multi_junta.auditoria_identidad
      WHERE cuenta_id = ANY(${accountIds}::uuid[])
         OR objetivo_cuenta_id = ANY(${accountIds}::uuid[])
         OR junta_id = ANY(${juntaIds}::uuid[])
    `;
    await tx.sesion.deleteMany({ where: { cuentaId: { in: accountIds } } });
    await tx.membresia.deleteMany({ where: { cuentaId: { in: accountIds } } });
    await tx.cuenta.deleteMany({ where: { id: { in: accountIds } } });
    await tx.junta.deleteMany({ where: { id: { in: juntaIds } } });
    await tx.$executeRaw`DELETE FROM multi_junta.intento_autenticacion WHERE huella = ANY(${attemptHashes}::text[])`;
    for (const {
      dimension,
      huella,
      ventana_inicio,
      intentos,
    } of previousIpAttempts) {
      await tx.$executeRaw`
        INSERT INTO multi_junta.intento_autenticacion (dimension, huella, ventana_inicio, intentos)
        VALUES (${dimension}, ${huella}, ${ventana_inicio}, ${intentos})
      `;
    }
  });
}

async function verifyTemporaryCredential(admin, alta, expected) {
  assert.deepEqual(Object.keys(alta).sort(), [
    'contrasenaTemporal',
    'membresia',
  ]);
  assert.match(alta.contrasenaTemporal, /^[A-Za-z0-9_-]{32}$/);
  assert.deepEqual(Object.keys(alta.membresia).sort(), [
    'cuentaId',
    'estado',
    'id',
    'rol',
    'usuario',
  ]);
  assert.equal(alta.membresia.usuario, expected.usuario);
  assert.equal(alta.membresia.rol, expected.rol);
  assert.equal(alta.membresia.estado, 'ACTIVA');
  const record = await admin.cuenta.findUniqueOrThrow({
    where: { id: alta.membresia.cuentaId },
  });
  assert.equal(record.requiereCambioContrasena, true);
  assert.equal(record.rolPlataformaCodigo, null);
  assert.match(record.hashContrasena, /^\$argon2id\$/);
  assert.equal(
    await verify(record.hashContrasena, alta.contrasenaTemporal),
    true,
  );
}

async function openInitialSession(request, alta, juntaId) {
  const { usuario } = alta.membresia;
  const initial = sessionFrom(
    await authLogin(request, usuario, alta.contrasenaTemporal),
  );
  assert.equal(initial.view.ambito, 'PREVIA');
  assert.equal(initial.view.requiereCambioContrasena, true);
  assertStatus(
    await request('/auth/contexto', {
      method: 'POST',
      session: initial,
      body: { juntaId },
    }),
    403,
  );
  assertStatus(await request(api.local(juntaId), { session: initial }), 403);
  assertStatus(
    await request('/auth/cambiar-contrasena', {
      method: 'POST',
      session: initial,
      body: {
        contrasenaActual: alta.contrasenaTemporal,
        nuevaContrasena: password,
      },
    }),
    204,
  );
  assertStatus(await request('/auth/sesion', { session: initial }), 401);
  assertStatus(await authLogin(request, usuario, alta.contrasenaTemporal), 401);
  const preliminary = sessionFrom(await authLogin(request, usuario));
  assert.equal(preliminary.view.requiereCambioContrasena, false);
  return selectJunta(request, preliminary, juntaId);
}

async function auditEvents(admin, juntaId) {
  return admin.$queryRaw`
    SELECT evento, cuenta_id AS actor, objetivo_cuenta_id AS cuenta,
      objetivo_membresia_id AS membresia
    FROM multi_junta.auditoria_identidad WHERE junta_id = ${juntaId}::uuid
  `;
}

test('gestión de Plataforma y juntas con PostgreSQL aislado', async (context) => {
  const appUrl = fixtureUrl('APP_DATABASE_URL', appRole);
  const migrationUrl = fixtureUrl('MIGRATION_DATABASE_URL', migratorRole);
  const adminUrl = fixtureUrl('IDENTITY_TEST_ADMIN_URL');
  assert.equal(appUrl.destination, migrationUrl.destination);
  assert.equal(appUrl.destination, adminUrl.destination);
  assert.ok(![appRole, migratorRole, identityRole].includes(adminUrl.role));

  const runtime = connect(appUrl);
  const migrator = connect(migrationUrl);
  const admin = connect(adminUrl);
  context.after(() =>
    Promise.all(
      [runtime, migrator, admin].map((client) => client.$disconnect()),
    ),
  );
  await Promise.all([
    verifyConnection(runtime, appUrl, false),
    verifyConnection(migrator, migrationUrl, false),
    verifyConnection(admin, adminUrl, true),
  ]);
  const [{ locked }] = await admin.$queryRaw`
    SELECT pg_try_advisory_lock(hashtext(current_database()), hashtext('identidad-fixture')) AS locked
  `;
  assert.equal(
    locked,
    true,
    'La base de prueba ya ejecuta una suite de identidad.',
  );
  const previousIpAttempts = await admin.$queryRaw`
    SELECT dimension::text, huella, ventana_inicio, intentos FROM multi_junta.intento_autenticacion WHERE huella = ${digest(loopback)}
  `;

  await context.test(
    'el rol de ejecución solo puede usar las firmas de gestión aprobadas',
    async () => {
      const routines = await runtime.$queryRaw`
      SELECT p.proname::text AS name, p.prosecdef AS definer, p.proconfig AS settings,
        pg_get_userbyid(p.proowner)::text AS owner,
        has_function_privilege(p.oid, 'EXECUTE') AS "runtimeExec",
        EXISTS (
          SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        ) AS "publicExec"
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'multi_junta' AND starts_with(p.proname, 'gp_')
        AND has_function_privilege(p.oid, 'EXECUTE')
    `;
      assert.deepEqual(routines.map(({ name }) => name).sort(), [
        'gp_create_admin',
        'gp_create_junta',
        'gp_create_secretaria',
        'gp_get_junta',
        'gp_list_juntas',
        'gp_list_membresias',
        'gp_local_junta',
        'gp_set_junta_estado',
        'gp_update_membresia',
      ]);
      for (const routine of routines) {
        assert.equal(routine.definer, true, routine.name);
        assert.equal(routine.owner, identityRole, routine.name);
        assert.equal(routine.runtimeExec, true, routine.name);
        assert.equal(routine.publicExec, false, routine.name);
        assert.ok(
          routine.settings?.some((value) =>
            value.startsWith('search_path=pg_catalog'),
          ),
          routine.name,
        );
      }
      const [rls] = await runtime.$queryRaw`
      SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
      FROM pg_class WHERE oid = 'multi_junta.membresia'::regclass
    `;
      assert.deepEqual(rls, { enabled: true, forced: true });
      await assertDenied(
        runtime,
        (tx) => tx.$queryRaw`SELECT * FROM multi_junta.junta`,
      );
      await assertDenied(
        runtime,
        (tx) => tx.$queryRaw`SELECT * FROM multi_junta.cuenta`,
      );
      await assertDenied(
        runtime,
        (tx) => tx.$queryRaw`SELECT * FROM multi_junta.membresia`,
      );
      await assertDenied(
        runtime,
        (tx) => tx.$queryRaw`SELECT * FROM multi_junta.auditoria_identidad`,
      );
      await assertDenied(
        runtime,
        (tx) => tx.$executeRaw`SET ROLE multi_junta_identity`,
      );
    },
  );

  process.env.AUTH_ORIGIN = origin;
  process.env.AUTH_IDLE_SECONDS = '1800';
  process.env.AUTH_ABSOLUTE_SECONDS = '43200';
  const app = await createApplication({ logger: false });
  context.after(() => app.close());
  await app.listen(0, loopback);
  const request = apiRequest(await app.getUrl());
  const fixture = fixtureData();
  const { usernames, juntaNames, ruc } = fixture;
  const storedHash = await hashPassword(password);

  try {
    const platformAccount = await admin.cuenta.create({
      data: {
        nombreUsuarioNormalizado: usernames.plataforma,
        hashContrasena: storedHash,
        rolPlataformaCodigo: 'SUPER_ADMIN',
      },
    });
    const platform = sessionFrom(
      await authLogin(request, usernames.plataforma),
    );
    assert.equal(platform.view.ambito, 'PLATAFORMA');
    assert.equal(platform.view.rol, 'SUPER_ADMIN');

    let juntaA;
    let juntaB;
    await context.test(
      'registra, lista y consulta juntas con RUC único y paginación',
      async () => {
        assertStatus(await request(api.juntas), 401);
        const fingerprint = sessionFingerprint(platform);
        const shortIdle = new Date(Date.now() + 5 * 60_000);
        await admin.sesion.update({
          where: { huellaToken: fingerprint },
          data: { expiraInactividadEn: shortIdle },
        });
        assertStatus(
          await request(api.juntas, {
            method: 'POST',
            session: platform,
            csrf: 'invalido',
            body: { nombre: juntaNames.CSRF, tipo: 'PRUEBA' },
          }),
          403,
        );
        const rejected = await admin.sesion.findUniqueOrThrow({
          where: { huellaToken: fingerprint },
        });
        assert.deepEqual(
          rejected.expiraInactividadEn,
          shortIdle,
          'CSRF se valida antes de renovar la sesión.',
        );
        assertStatus(
          await request(api.juntas, {
            method: 'POST',
            session: platform,
            from: 'https://ajeno.example',
            body: { nombre: juntaNames.CSRF, tipo: 'PRUEBA' },
          }),
          403,
        );
        assertStatus(
          await request(api.juntas, {
            method: 'POST',
            session: platform,
            body: {
              nombre: juntaNames['RUC inválido'],
              tipo: 'PRUEBA',
              ruc: 'abcdef',
            },
          }),
          400,
        );
        juntaA = assertStatus(
          await request(api.juntas, {
            method: 'POST',
            session: platform,
            body: { nombre: juntaNames.A, tipo: 'PRUEBA', ruc },
          }),
          201,
        );
        juntaB = assertStatus(
          await request(api.juntas, {
            method: 'POST',
            session: platform,
            body: { nombre: juntaNames.B, tipo: 'PRUEBA' },
          }),
          201,
        );
        assert.deepEqual(juntaA, {
          id: juntaA.id,
          nombre: juntaNames.A,
          tipo: 'PRUEBA',
          ruc,
          estado: 'ACTIVA',
        });
        assert.deepEqual(juntaB, {
          id: juntaB.id,
          nombre: juntaNames.B,
          tipo: 'PRUEBA',
          ruc: null,
          estado: 'ACTIVA',
        });
        assert.notEqual(juntaA.id, juntaB.id);
        assertStatus(
          await request(api.juntas, {
            method: 'POST',
            session: platform,
            body: { nombre: juntaNames['RUC repetido'], tipo: 'PRUEBA', ruc },
          }),
          409,
        );
        assert.equal(
          await admin.junta.count({
            where: {
              nombre: {
                in: [
                  juntaNames.CSRF,
                  juntaNames['RUC repetido'],
                  juntaNames['RUC inválido'],
                ],
              },
            },
          }),
          0,
        );
        await admin.junta.createMany({ data: fixture.pagination });
        const first = assertStatus(
          await request(api.juntas, { session: platform }),
          200,
        );
        const firstAgain = assertStatus(
          await request(`${api.juntas}?offset=0`, { session: platform }),
          200,
        );
        const second = assertStatus(
          await request(`${api.juntas}?offset=25`, { session: platform }),
          200,
        );
        assert.equal(first.length, 25);
        assert.ok(second.length > 0 && second.length <= 25);
        assert.deepEqual(firstAgain, first);
        assert.equal(
          new Set([...first, ...second].map(({ id }) => id)).size,
          first.length + second.length,
        );
        assertStatus(
          await request(`${api.juntas}?offset=-1`, { session: platform }),
          400,
        );
        assertStatus(
          await request(api.junta(randomUUID()), { session: platform }),
          404,
        );
        assert.deepEqual(
          assertStatus(
            await request(api.junta(juntaA.id), { session: platform }),
            200,
          ),
          { ...juntaA, administradores: [] },
        );
        assert.deepEqual(await auditEvents(admin, juntaA.id), [
          {
            evento: 'JUNTA_CREADA',
            actor: platformAccount.id,
            cuenta: null,
            membresia: null,
          },
        ]);
      },
    );
    assert.ok(
      juntaA && juntaB,
      'El escenario requiere las juntas creadas en la API.',
    );

    const assign = (juntaId, usuario) =>
      request(`${api.junta(juntaId)}/administradores`, {
        method: 'POST',
        session: platform,
        body: { usuario },
      });
    let localAdmin;
    await context.test(
      'asigna un Administrador nuevo, entrega una sola contraseña y aplica cambio inicial',
      async () => {
        assertStatus(
          await request(api.local(juntaA.id), { session: platform }),
          403,
        );
        assertStatus(await assign(juntaA.id, usernames.plataforma), 409);
        const created = await assign(
          juntaA.id,
          ` ${usernames.admin.toUpperCase()} `,
        );
        const alta = assertStatus(created, 201);
        assert.match(created.headers.get('cache-control'), /no-store/i);
        await verifyTemporaryCredential(admin, alta, {
          usuario: usernames.admin,
          rol: 'ADMIN_JUNTA',
        });
        assertStatus(await assign(juntaB.id, usernames.admin), 409);
        const detail = assertStatus(
          await request(api.junta(juntaA.id), { session: platform }),
          200,
        );
        assert.deepEqual(detail, {
          ...juntaA,
          administradores: [alta.membresia],
        });
        const assignments = (await auditEvents(admin, juntaA.id)).filter(
          ({ evento }) => evento === 'ADMIN_JUNTA_CREADO',
        );
        assert.deepEqual(assignments, [
          {
            evento: 'ADMIN_JUNTA_CREADO',
            actor: platformAccount.id,
            cuenta: alta.membresia.cuentaId,
            membresia: alta.membresia.id,
          },
        ]);
        assert.equal(
          await admin.membresia.count({
            where: { cuentaId: alta.membresia.cuentaId },
          }),
          1,
        );
        localAdmin = await openInitialSession(request, alta, juntaA.id);
        assert.equal(localAdmin.view.rol, 'ADMIN_JUNTA');
        assertStatus(await request(api.juntas, { session: localAdmin }), 403);
        assertStatus(
          await request(api.local(juntaB.id), { session: localAdmin }),
          403,
        );
        assertStatus(
          await request(api.members(juntaB.id), { session: localAdmin }),
          403,
        );
        assert.deepEqual(
          assertStatus(
            await request(api.local(juntaA.id), { session: localAdmin }),
            200,
          ),
          {
            ...juntaA,
            secretariaInicialDisponible: true,
          },
        );
      },
    );
    assert.ok(
      localAdmin,
      'El escenario requiere una sesión de Administrador de Junta.',
    );

    const memberAccount = await admin.cuenta.create({
      data: {
        nombreUsuarioNormalizado: usernames.socio,
        hashContrasena: storedHash,
      },
    });
    const [memberA, memberB] = await admin.$transaction(
      [juntaA, juntaB].map(({ id: juntaId }) =>
        admin.membresia.create({
          data: { juntaId, cuentaId: memberAccount.id, rolCodigo: 'SOCIO' },
        }),
      ),
    );
    const localProfile = async (junta) =>
      selectJunta(
        request,
        sessionFrom(await authLogin(request, usernames.socio)),
        junta.id,
      );
    const patchMembership = (juntaId, membershipId, body) =>
      request(`${api.members(juntaId)}/${membershipId}`, {
        method: 'PATCH',
        session: localAdmin,
        body,
      });

    await context.test(
      'la gestión local preserva historial y las sesiones válidas de otra junta',
      async () => {
        const sessionA = await localProfile(juntaA);
        const sessionB = await localProfile(juntaB);
        assertStatus(
          await request(api.members(juntaA.id), { session: sessionA }),
          403,
        );
        assertStatus(
          await request(api.local(juntaA.id), { session: sessionA }),
          403,
        );
        const members = assertStatus(
          await request(api.members(juntaA.id), { session: localAdmin }),
          200,
        );
        const member = members.find(({ id }) => id === memberA.id);
        assert.deepEqual(member, {
          id: memberA.id,
          cuentaId: memberAccount.id,
          usuario: usernames.socio,
          rol: 'SOCIO',
          estado: 'ACTIVA',
        });
        assert.ok(!members.some(({ id }) => id === memberB.id));
        assertStatus(
          await patchMembership(juntaB.id, memberB.id, { rol: 'TESORERIA' }),
          403,
        );
        assertStatus(
          await patchMembership(juntaA.id, memberB.id, { rol: 'TESORERIA' }),
          404,
        );
        assertStatus(await patchMembership(juntaA.id, memberA.id, {}), 400);
        assertStatus(
          await patchMembership(juntaA.id, memberA.id, { rol: 'SUPER_ADMIN' }),
          400,
        );
        assertStatus(
          await patchMembership(juntaA.id, localAdmin.view.membresiaId, {
            estado: 'INACTIVA',
          }),
          403,
        );
        const changed = assertStatus(
          await patchMembership(juntaA.id, memberA.id, { rol: 'TESORERIA' }),
          200,
        );
        assert.deepEqual(changed, { ...member, rol: 'TESORERIA' });
        assertStatus(await request('/auth/sesion', { session: sessionA }), 401);
        assertStatus(await request('/auth/sesion', { session: sessionB }), 200);
        const disabled = assertStatus(
          await patchMembership(juntaA.id, memberA.id, { estado: 'INACTIVA' }),
          200,
        );
        assert.equal(disabled.estado, 'INACTIVA');
        const current = await admin.membresia.findUniqueOrThrow({
          where: { id: memberA.id },
        });
        assert.ok(current.versionAcceso > memberA.versionAcceso);
        assert.equal(
          (
            await admin.cuenta.findUniqueOrThrow({
              where: { id: memberAccount.id },
            })
          ).estado,
          'ACTIVA',
        );
        await runtime.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config('app.junta_id', ${juntaB.id}, true)`;
          const [foreign] = await tx.$queryRaw`
            SELECT multi_junta.gp_local_junta(${sessionFingerprint(localAdmin)}::text, ${juntaB.id}::uuid) AS result
          `;
          assert.deepEqual(foreign.result, { error: 'forbidden' });
        });
        assertStatus(
          await patchMembership(juntaA.id, memberA.id, { estado: 'ACTIVA' }),
          200,
        );
        assertStatus(await request('/auth/sesion', { session: sessionA }), 401);
        assertStatus(await request('/auth/sesion', { session: sessionB }), 200);
        const history = (await auditEvents(admin, juntaA.id)).filter(
          ({ evento }) => evento === 'MEMBRESIA_ACTUALIZADA',
        );
        const expected = {
          evento: 'MEMBRESIA_ACTUALIZADA',
          actor: localAdmin.view.cuentaId,
          cuenta: memberAccount.id,
          membresia: memberA.id,
        };
        assert.deepEqual(history, [expected, expected, expected]);
      },
    );

    await context.test(
      'la primera Secretaría se consume una sola vez, incluso con solicitudes concurrentes',
      async () => {
        const initialize = (usuario, junta = juntaA) =>
          request(`${api.local(junta.id)}/secretaria-inicial`, {
            method: 'POST',
            session: localAdmin,
            body: { usuario },
          });
        assertStatus(await initialize(usernames['secretaria-a'], juntaB), 403);
        assertStatus(await initialize(usernames.socio), 409);
        const contenders = [
          usernames['secretaria-a'],
          usernames['secretaria-b'],
        ];
        const responses = await Promise.all(
          contenders.map((usuario) => initialize(usuario)),
        );
        assert.deepEqual(
          responses.map(({ status }) => status).sort(),
          [201, 409],
        );
        const successful = responses.findIndex(({ status }) => status === 201);
        const winner = responses[successful];
        const alta = winner.body;
        assert.match(winner.headers.get('cache-control'), /no-store/i);
        await verifyTemporaryCredential(admin, alta, {
          usuario: contenders[successful],
          rol: 'SECRETARIA',
        });
        assert.equal(
          await admin.cuenta.count({
            where: { nombreUsuarioNormalizado: { in: contenders } },
          }),
          1,
        );
        const expected = {
          evento: 'SECRETARIA_INICIAL_CREADA',
          actor: localAdmin.view.cuentaId,
          cuenta: alta.membresia.cuentaId,
          membresia: alta.membresia.id,
        };
        assert.deepEqual(
          (await auditEvents(admin, juntaA.id)).filter(
            ({ evento }) => evento === 'SECRETARIA_INICIAL_CREADA',
          ),
          [expected],
        );
        const secretary = await openInitialSession(request, alta, juntaA.id);
        assert.equal(secretary.view.rol, 'SECRETARIA');
        assertStatus(
          await request(api.members(juntaA.id), { session: secretary }),
          403,
        );
        assertStatus(
          await patchMembership(juntaA.id, alta.membresia.id, {
            estado: 'INACTIVA',
          }),
          200,
        );
        assertStatus(
          await request('/auth/sesion', { session: secretary }),
          401,
        );
        assertStatus(await initialize(usernames.repetida), 409);
        assert.equal(
          await admin.cuenta.count({
            where: { nombreUsuarioNormalizado: usernames.repetida },
          }),
          0,
        );
        assert.deepEqual(
          assertStatus(
            await request(api.local(juntaA.id), { session: localAdmin }),
            200,
          ),
          {
            ...juntaA,
            secretariaInicialDisponible: false,
          },
        );
      },
    );

    await context.test(
      'el cambio de estado de una junta invalida sesiones y conserva el historial',
      async () => {
        const setState = (estado) =>
          request(`${api.junta(juntaA.id)}/estado`, {
            method: 'PATCH',
            session: platform,
            body: { estado },
          });
        assertStatus(await setState('ELIMINADA'), 400);
        assert.deepEqual(assertStatus(await setState('ACTIVA'), 200), juntaA);
        assertStatus(
          await request('/auth/sesion', { session: localAdmin }),
          200,
        );
        const disabled = assertStatus(await setState('INACTIVA'), 200);
        assert.deepEqual(disabled, { ...juntaA, estado: 'INACTIVA' });
        assertStatus(
          await request('/auth/sesion', { session: localAdmin }),
          401,
        );
        assertStatus(await assign(juntaA.id, usernames.inactiva), 409);
        assert.equal(
          await admin.cuenta.count({
            where: { nombreUsuarioNormalizado: usernames.inactiva },
          }),
          0,
        );
        const restored = assertStatus(await setState('ACTIVA'), 200);
        assert.deepEqual(restored, juntaA);
        assertStatus(
          await request('/auth/sesion', { session: localAdmin }),
          401,
        );
        const detail = assertStatus(
          await request(api.junta(juntaA.id), { session: platform }),
          200,
        );
        assert.ok(
          detail.administradores.some(
            ({ id }) => id === localAdmin.view.membresiaId,
          ),
        );
        const changes = (await auditEvents(admin, juntaA.id)).filter(
          ({ evento }) => evento === 'JUNTA_ESTADO_CAMBIADO',
        );
        const expected = {
          evento: 'JUNTA_ESTADO_CAMBIADO',
          actor: platformAccount.id,
          cuenta: null,
          membresia: null,
        };
        assert.deepEqual(changes, [expected, expected]);
      },
    );
  } finally {
    await cleanup(admin, fixture, previousIpAttempts);
  }
});
