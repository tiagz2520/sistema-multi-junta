import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { promisify } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { createApplication } from '../dist/app.js';
import { TenantUnitOfWork } from '../dist/core/prisma/tenant-unit-of-work.js';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { hashPassword } from '../dist/modules/platform/identity/password.js';

const origin = 'https://pruebas.example';
const cookieName = 'multi_junta_sesion';
const password = 'Clave ficticia para pruebas 1B.3';
const replacementPassword = 'Clave nueva ficticia para pruebas 1B.3';
const appRole = 'multi_junta_app';
const migratorRole = 'multi_junta_migrator';
const identityRole = 'multi_junta_identity';
const loopback = '127.0.0.1';

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

async function verifyConnection(client, url) {
  const [connection] = await client.$queryRaw`
    SELECT current_database()::text AS database, current_user::text AS role,
      session_user::text AS "sessionRole", rolsuper AS "isSuperuser"
    FROM pg_roles WHERE rolname = current_user
  `;
  assert.deepEqual(connection, {
    database: url.database,
    role: url.role,
    sessionRole: url.role,
    isSuperuser: ![appRole, migratorRole].includes(url.role),
  });
}

async function assertDenied(client, action) {
  await assert.rejects(
    client.$transaction(async (tx) => {
      await action(tx);
      assert.fail('La operación de la cuenta de ejecución se permitió.');
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

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function seed(admin) {
  const suffix = randomUUID().slice(0, 8);
  const storedHash = await hashPassword(password);
  const juntas = ['a', 'b', 'c', 'd', 'e'].map((suffixJunta) => ({
    id: randomUUID(),
    nombre: `Junta de prueba ${suffixJunta}`,
    tipo: 'PRUEBA',
    estado: suffixJunta === 'd' ? 'INACTIVA' : 'ACTIVA',
  }));
  const accounts = ['local', 'pendiente', 'inactiva', 'ciclo'].map((tipo) => ({
    id: randomUUID(),
    nombreUsuarioNormalizado: `${tipo}-${suffix}`,
    hashContrasena: storedHash,
    requiereCambioContrasena: tipo === 'pendiente',
    estado: tipo === 'inactiva' ? 'INACTIVA' : 'ACTIVA',
  }));
  const memberships = juntas.slice(0, 4).map(({ id: juntaId }, index) => ({
    id: randomUUID(),
    juntaId,
    cuentaId: accounts[0].id,
    rolCodigo: index === 1 ? 'TESORERIA' : 'SOCIO',
    estado: index === 2 ? 'INACTIVA' : 'ACTIVA',
  }));
  memberships.push({
    id: randomUUID(),
    juntaId: juntas[0].id,
    cuentaId: accounts[1].id,
    rolCodigo: 'SOCIO',
    estado: 'ACTIVA',
  });
  memberships.push(
    ...memberships.slice(0, 2).map((membership) => ({
      ...membership,
      id: randomUUID(),
      cuentaId: accounts[3].id,
    })),
  );
  await admin.$transaction(async (tx) => {
    await tx.junta.createMany({ data: juntas });
    await tx.cuenta.createMany({ data: accounts });
    await tx.membresia.createMany({ data: memberships });
  });
  return { suffix, juntas, accounts, memberships };
}

async function cleanup(
  admin,
  fixture,
  bootstrapName,
  attemptHashes,
  priorIpAttempts,
) {
  const bootstrapped = await admin.cuenta.findUnique({
    where: { nombreUsuarioNormalizado: bootstrapName },
    select: { id: true },
  });
  const ids = fixture.accounts.map(({ id }) => id);
  if (bootstrapped) ids.push(bootstrapped.id);
  await admin.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM multi_junta.intento_autenticacion WHERE huella = ANY(${attemptHashes}::text[])`;
    for (const {
      dimension,
      huella,
      ventana_inicio,
      intentos,
    } of priorIpAttempts) {
      await tx.$executeRaw`
        INSERT INTO multi_junta.intento_autenticacion (dimension, huella, ventana_inicio, intentos)
        VALUES (${dimension}, ${huella}, ${ventana_inicio}, ${intentos})
      `;
    }
    await tx.$executeRaw`DELETE FROM multi_junta.auditoria_identidad WHERE cuenta_id = ANY(${ids}::uuid[])`;
    await tx.sesion.deleteMany({ where: { cuentaId: { in: ids } } });
    await tx.membresia.deleteMany({ where: { cuentaId: { in: ids } } });
    await tx.cuenta.deleteMany({ where: { id: { in: ids } } });
    await tx.junta.deleteMany({
      where: { id: { in: fixture.juntas.map(({ id }) => id) } },
    });
  });
}

function authCall(baseUrl) {
  return async (
    path,
    {
      session,
      method = 'GET',
      body,
      csrf,
      from = origin,
      type = 'application/json',
      extraHeaders = {},
      scope = 'auth',
    } = {},
  ) => {
    const headers = { ...extraHeaders };
    if (from) headers.origin = from;
    if (session) headers.cookie = `${cookieName}=${session.token}`;
    if (csrf !== undefined) headers['x-csrf-token'] = csrf;
    if (body !== undefined) headers['content-type'] = type;

    const response = await globalThis.fetch(
      new URL(`/api/v1/${scope}/${path}`, baseUrl),
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return {
      status: response.status,
      body: response.status === 204 ? undefined : await response.json(),
      cookie: response.headers
        .getSetCookie()
        .find((value) => value.startsWith(`${cookieName}=`)),
    };
  };
}

function readSession(response, expected) {
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.ok(response.cookie);
  assert.match(response.cookie, /(?:^|;\s*)HttpOnly(?:;|$)/i);
  assert.match(response.cookie, /(?:^|;\s*)SameSite=Strict(?:;|$)/i);
  assert.match(response.cookie, /(?:^|;\s*)Secure(?:;|$)/i);
  assert.match(response.cookie, /(?:^|;\s*)Path=\/api\/v1(?:;|$)/i);
  assert.doesNotMatch(response.cookie, /(?:^|;\s*)Domain=/i);
  const token = response.cookie.split(';', 1)[0].slice(cookieName.length + 1);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const { csrfToken, ...publicSession } = response.body;
  assert.equal(typeof csrfToken, 'string');
  assert.ok(csrfToken.length >= 32 && csrfToken !== token);
  assert.deepEqual(publicSession, expected);
  return { token, csrfToken };
}

function login(call, usuario, contrasena = password, overrides = {}) {
  return call('iniciar-sesion', {
    method: 'POST',
    body: { usuario, contrasena },
    csrf: 'inicio',
    ...overrides,
  });
}

function mutate(call, path, session, body, extras = {}) {
  return call(path, {
    method: 'POST',
    session,
    body,
    csrf: session.csrfToken,
    ...extras,
  });
}

function expectedSession(account, membership, changes = {}) {
  return {
    cuentaId: account.id,
    juntaId: membership?.juntaId ?? null,
    membresiaId: membership?.id ?? null,
    ambito: membership ? 'JUNTA' : 'PREVIA',
    rol: membership?.rolCodigo ?? null,
    requiereCambioContrasena: false,
    ...changes,
  };
}

test('autenticación HTTP y frontera PostgreSQL con identidades sintéticas', async (context) => {
  const appUrl = fixtureUrl('APP_DATABASE_URL', appRole);
  const migratorUrl = fixtureUrl('MIGRATION_DATABASE_URL', migratorRole);
  const adminUrl = fixtureUrl('IDENTITY_TEST_ADMIN_URL');
  assert.equal(appUrl.destination, migratorUrl.destination);
  assert.equal(appUrl.destination, adminUrl.destination);
  assert.ok(![appRole, migratorRole, identityRole].includes(adminUrl.role));

  const runtime = connect(appUrl);
  const admin = connect(adminUrl);
  const migrator = connect(migratorUrl);
  context.after(() =>
    Promise.all(
      [runtime, admin, migrator].map((client) => client.$disconnect()),
    ),
  );
  await Promise.all([
    verifyConnection(runtime, appUrl),
    verifyConnection(admin, adminUrl),
    verifyConnection(migrator, migratorUrl),
  ]);
  const [{ locked }] = await admin.$queryRaw`
    SELECT pg_try_advisory_lock(hashtext(current_database()), hashtext('identidad-fixture')) AS locked
  `;
  assert.equal(
    locked,
    true,
    'La base de prueba ya ejecuta una suite de identidad.',
  );

  process.env.AUTH_ORIGIN = origin;
  process.env.AUTH_IDLE_SECONDS = '1800';
  process.env.AUTH_ABSOLUTE_SECONDS = '43200';
  const app = await createApplication({ logger: false });
  context.after(() => app.close());
  await app.listen(0, loopback);
  const baseUrl = await app.getUrl();
  const call = authCall(baseUrl);
  const ipHash = digest(loopback);
  const priorIpAttempts = await admin.$queryRaw`
    SELECT dimension::text, huella, ventana_inicio, intentos FROM multi_junta.intento_autenticacion WHERE huella = ${ipHash}
  `;
  const fixture = await seed(admin);
  const [local, pending, inactive, cycle] = fixture.accounts;
  const [
    membershipA,
    membershipB,
    inactiveMembership,
    inactiveJunta,
    ,
    cycleA,
    cycleB,
  ] = fixture.memberships;
  const bootstrapName = `inicio-${fixture.suffix}`;
  const unavailable = `limitado-${fixture.suffix}`;
  const unknownUsername = `inexistente-${fixture.suffix}`;
  const attemptHashes = [
    local.nombreUsuarioNormalizado,
    pending.nombreUsuarioNormalizado,
    inactive.nombreUsuarioNormalizado,
    cycle.nombreUsuarioNormalizado,
    unavailable,
    unknownUsername,
    bootstrapName,
    loopback,
  ].map(digest);

  try {
    await context.test(
      'el rol de ejecución accede solo a rutinas acotadas',
      async () => {
        const [role] = await runtime.$queryRaw`
        SELECT rolcanlogin AS login, rolbypassrls AS bypass, rolsuper AS superuser,
          pg_has_role('multi_junta_identity', 'SET') AS "canSet",
          has_schema_privilege('multi_junta_identity', 'multi_junta', 'CREATE') AS "canCreate",
          EXISTS (SELECT 1 FROM pg_class WHERE relowner = pg_roles.oid AND relkind IN ('r', 'p')) AS "ownsTables",
          EXISTS (SELECT 1 FROM pg_class WHERE relowner = current_user::regrole AND relkind IN ('r', 'p')) AS "runtimeOwnsTables"
        FROM pg_roles WHERE rolname = 'multi_junta_identity'
      `;
        assert.deepEqual(role, {
          login: false,
          bypass: false,
          superuser: false,
          canSet: false,
          canCreate: false,
          ownsTables: false,
          runtimeOwnsTables: false,
        });
        const routines = await runtime.$queryRaw`
        SELECT p.proname::text AS name, p.prosecdef AS definer,
          pg_get_userbyid(p.proowner)::text AS owner, p.proconfig AS settings,
          has_function_privilege(p.oid, 'EXECUTE') AS "runtimeExec",
          EXISTS (
            SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
            WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
          ) AS "publicExec"
        FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'multi_junta' AND starts_with(p.proname, 'auth_')
      `;
        assert.deepEqual(routines.map(({ name }) => name).sort(), [
          'auth_attempt',
          'auth_contexts',
          'auth_credential',
          'auth_live_session',
          'auth_logout',
          'auth_membership',
          'auth_own_credential',
          'auth_password',
          'auth_start',
          'auth_switch',
          'auth_validate',
        ]);
        for (const routine of routines) {
          assert.equal(
            routine.definer,
            routine.name !== 'auth_live_session',
            routine.name,
          );
          assert.equal(routine.owner, identityRole, routine.name);
          assert.equal(routine.publicExec, false, routine.name);
          assert.equal(
            routine.runtimeExec,
            routine.name !== 'auth_live_session',
            routine.name,
          );
          assert.ok(
            routine.settings?.some((value) =>
              value.startsWith('search_path=pg_catalog'),
            ),
            routine.name,
          );
        }
        await assertDenied(
          runtime,
          (tx) => tx.$queryRaw`SELECT hash_contrasena FROM multi_junta.cuenta`,
        );
        await assertDenied(
          runtime,
          (tx) => tx.$queryRaw`SELECT huella_token FROM multi_junta.sesion`,
        );
        await assertDenied(
          runtime,
          (tx) => tx.$queryRaw`SELECT id FROM multi_junta.auditoria_identidad`,
        );
        await assertDenied(
          runtime,
          (tx) =>
            tx.$queryRaw`SELECT * FROM multi_junta.auth_live_session(${digest('sesion-inexistente')})`,
        );
        await assertDenied(
          runtime,
          (tx) =>
            tx.$executeRaw`CREATE TABLE multi_junta.prueba_ddl_auth (id integer)`,
        );
        await assertDenied(
          runtime,
          (tx) => tx.$executeRaw`SET ROLE multi_junta_identity`,
        );
        await assertDenied(
          runtime,
          (tx) => tx.$executeRaw`SET ROLE multi_junta_migrator`,
        );
        assert.deepEqual(
          await runtime.$queryRaw`SELECT * FROM multi_junta.auth_membership(${digest('sesion-inexistente')})`,
          [],
        );
      },
    );

    await context.test(
      'login exige Origin y CSRF y usa respuestas uniformes',
      async () => {
        assert.equal((await call('sesion')).status, 401);
        const malformed = await globalThis.fetch(
          new URL('/api/v1/auth/iniciar-sesion', baseUrl),
          {
            method: 'POST',
            headers: {
              origin,
              'x-csrf-token': 'inicio',
              'content-type': 'application/json',
            },
            body: 'filtracion_sintetica',
          },
        );
        assert.equal(malformed.status, 400);
        assert.doesNotMatch(await malformed.text(), /filtracion_sintetica/);
        assert.equal(
          (
            await login(call, local.nombreUsuarioNormalizado, password, {
              from: null,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await login(call, local.nombreUsuarioNormalizado, password, {
              from: 'https://ajeno.example',
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await login(call, local.nombreUsuarioNormalizado, password, {
              csrf: undefined,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await login(call, local.nombreUsuarioNormalizado, password, {
              type: 'text/plain',
            })
          ).status,
          415,
        );
        const unknown = await login(call, unknownUsername);
        const wrong = await login(
          call,
          local.nombreUsuarioNormalizado,
          'Contraseña incorrecta ficticia',
        );
        const disabled = await login(call, inactive.nombreUsuarioNormalizado);
        assert.equal(unknown.status, 401);
        assert.deepEqual(wrong, unknown);
        assert.deepEqual(disabled, unknown);
      },
    );

    await context.test(
      'un token opera en una sola junta y el cambio rota su autoridad',
      async () => {
        const initial = readSession(
          await login(
            call,
            `  ${local.nombreUsuarioNormalizado.toUpperCase()}  `,
          ),
          expectedSession(local),
        );
        const contexts = await call('contextos', { session: initial });
        assert.equal(contexts.status, 200);
        assert.deepEqual(
          new Map(
            contexts.body.map(({ juntaId, nombre, rol }) => [
              juntaId,
              [nombre, rol],
            ]),
          ),
          new Map([
            [
              membershipA.juntaId,
              [fixture.juntas[0].nombre, membershipA.rolCodigo],
            ],
            [
              membershipB.juntaId,
              [fixture.juntas[1].nombre, membershipB.rolCodigo],
            ],
          ]),
        );
        assert.equal(
          (
            await mutate(
              call,
              'contexto',
              initial,
              { juntaId: membershipA.juntaId },
              { csrf: 'csrf-incorrecto' },
            )
          ).status,
          403,
        );
        for (const juntaId of [
          fixture.juntas[4].id,
          inactiveMembership.juntaId,
          inactiveJunta.juntaId,
        ]) {
          assert.equal(
            (await mutate(call, 'contexto', initial, { juntaId })).status,
            403,
          );
        }
        const absoluteExpiry = (
          await admin.sesion.findUniqueOrThrow({
            where: { huellaToken: digest(initial.token) },
          })
        ).expiraAbsolutaEn;
        const switches = await Promise.all(
          Array.from({ length: 2 }, () =>
            mutate(call, 'contexto', initial, { juntaId: membershipA.juntaId }),
          ),
        );
        assert.equal(switches.filter(({ status }) => status === 200).length, 1);
        assert.ok(
          [401, 403].includes(
            switches.find(({ status }) => status !== 200).status,
          ),
        );
        const localA = readSession(
          switches.find(({ status }) => status === 200),
          expectedSession(local, membershipA),
        );
        assert.notEqual(localA.token, initial.token);
        assert.equal((await call('sesion', { session: initial })).status, 401);
        const own = await call(`${membershipA.juntaId}/mi/membresia`, {
          session: localA,
          scope: 'juntas',
        });
        assert.equal(own.status, 200);
        assert.deepEqual(own.body, {
          cuentaId: local.id,
          juntaId: membershipA.juntaId,
          membresiaId: membershipA.id,
          rol: membershipA.rolCodigo,
        });
        assert.equal(
          (
            await call(`${membershipB.juntaId}/mi/membresia`, {
              session: localA,
              scope: 'juntas',
              extraHeaders: { 'x-junta-id': membershipB.juntaId },
            })
          ).status,
          403,
        );
        assert.deepEqual(
          await runtime.$queryRaw`SELECT * FROM multi_junta.auth_membership(${digest(initial.token)})`,
          [],
        );
        const tenantWork = new TenantUnitOfWork({ client: runtime });
        const membershipQuery = (tx) =>
          tx.$queryRaw`SELECT * FROM multi_junta.auth_membership(${digest(localA.token)})`;
        assert.deepEqual(await membershipQuery(runtime), []);
        assert.deepEqual(
          await tenantWork.run(membershipB.juntaId, membershipQuery),
          [],
        );
        assert.deepEqual(
          await tenantWork.run(membershipA.juntaId, membershipQuery),
          [
            {
              cuenta_id: local.id,
              junta_id: membershipA.juntaId,
              membresia_id: membershipA.id,
              rol: membershipA.rolCodigo,
            },
          ],
        );
        const localB = readSession(
          await mutate(call, 'contexto', localA, {
            juntaId: membershipB.juntaId,
          }),
          expectedSession(local, membershipB),
        );
        assert.notEqual(localB.token, localA.token);
        assert.notEqual(localB.csrfToken, localA.csrfToken);
        assert.equal((await call('sesion', { session: localA })).status, 401);
        assert.deepEqual(
          await tenantWork.run(membershipA.juntaId, membershipQuery),
          [],
        );
        assert.deepEqual(
          (
            await admin.sesion.findUniqueOrThrow({
              where: { huellaToken: digest(localB.token) },
            })
          ).expiraAbsolutaEn,
          absoluteExpiry,
        );
        const loggedOut = await mutate(call, 'cerrar-sesion', localB);
        assert.equal(loggedOut.status, 204);
        assert.match(loggedOut.cookie, new RegExp(`^${cookieName}=;`, 'i'));
        assert.equal((await call('sesion', { session: localB })).status, 401);
      },
    );

    await context.test(
      'la contraseña temporal debe cambiar antes de seleccionar junta',
      async () => {
        const temporary = readSession(
          await login(call, pending.nombreUsuarioNormalizado),
          expectedSession(pending, null, { requiereCambioContrasena: true }),
        );
        assert.equal(
          (await call('sesion', { session: temporary })).status,
          200,
        );
        assert.equal(
          (await call('contextos', { session: temporary })).status,
          403,
        );
        assert.equal(
          (
            await mutate(call, 'contexto', temporary, {
              juntaId: membershipA.juntaId,
            })
          ).status,
          403,
        );
        const changed = await mutate(call, 'cambiar-contrasena', temporary, {
          contrasenaActual: password,
          nuevaContrasena: replacementPassword,
        });
        assert.equal(changed.status, 204);
        assert.match(changed.cookie, new RegExp(`^${cookieName}=;`, 'i'));
        assert.equal(
          (await call('sesion', { session: temporary })).status,
          401,
        );
        assert.equal(
          (await login(call, pending.nombreUsuarioNormalizado)).status,
          401,
        );
        const replacement = readSession(
          await login(
            call,
            pending.nombreUsuarioNormalizado,
            replacementPassword,
          ),
          expectedSession(pending),
        );
        assert.equal(
          (await call('contextos', { session: replacement })).status,
          200,
        );
      },
    );

    await context.test(
      'caducidad y cambios de estado o rol invalidan sesiones',
      async () => {
        async function openLocal(junta) {
          const preliminary = readSession(
            await login(call, cycle.nombreUsuarioNormalizado),
            expectedSession(cycle),
          );
          return readSession(
            await mutate(call, 'contexto', preliminary, {
              juntaId: junta.juntaId,
            }),
            expectedSession(cycle, junta),
          );
        }
        const a = await openLocal(cycleA);
        const b = await openLocal(cycleB);
        const absolute = await openLocal(cycleA);
        await admin.sesion.update({
          where: { huellaToken: digest(absolute.token) },
          data: { expiraAbsolutaEn: new Date(0) },
        });
        assert.equal((await call('sesion', { session: absolute })).status, 401);
        await admin.sesion.update({
          where: { huellaToken: digest(a.token) },
          data: { expiraInactividadEn: new Date(0) },
        });
        assert.equal((await call('sesion', { session: a })).status, 401);
        assert.equal((await call('sesion', { session: b })).status, 200);
        await admin.membresia.update({
          where: { id: cycleB.id },
          data: { rolCodigo: 'SECRETARIA' },
        });
        assert.equal((await call('sesion', { session: b })).status, 401);
        const active = await openLocal(cycleA);
        await admin.junta.update({
          where: { id: cycleA.juntaId },
          data: { estado: 'INACTIVA' },
        });
        assert.equal((await call('sesion', { session: active })).status, 401);
        await admin.junta.update({
          where: { id: cycleA.juntaId },
          data: { estado: 'ACTIVA' },
        });
        assert.equal((await call('sesion', { session: active })).status, 401);
        const accountState = await openLocal(cycleA);
        await admin.cuenta.update({
          where: { id: cycle.id },
          data: { estado: 'INACTIVA' },
        });
        assert.equal(
          (await call('sesion', { session: accountState })).status,
          401,
        );
      },
    );

    await context.test(
      'los intentos repetidos se limitan sin confiar en IP de cabecera',
      async () => {
        let status;
        for (let attempt = 0; attempt < 20 && status !== 429; attempt++) {
          const response = await login(call, unavailable, password, {
            extraHeaders: { 'x-forwarded-for': `192.0.2.${attempt + 1}` },
          });
          status = response.status;
          assert.ok([401, 429].includes(status));
        }
        assert.equal(status, 429);
        const [attempts] = await admin.$queryRaw`
        SELECT count(*)::int AS count FROM multi_junta.intento_autenticacion WHERE huella = ${ipHash}
      `;
        assert.ok(
          attempts.count > 0,
          'Los intentos registran la IP de la conexión.',
        );
        const [proxyAttempts] = await admin.$queryRaw`
        SELECT count(*)::int AS count FROM multi_junta.intento_autenticacion WHERE huella = ${digest('192.0.2.1')}
      `;
        assert.equal(proxyAttempts.count, 0);
      },
    );

    await context.test(
      'el arranque concurrente crea un solo Super Administrador y su auditoría',
      async () => {
        const cli = fileURLToPath(
          new URL(
            '../dist/modules/platform/identity/bootstrap-super-admin.js',
            import.meta.url,
          ),
        );
        const run = () =>
          promisify(execFile)(process.execPath, [cli], {
            env: {
              ...process.env,
              BOOTSTRAP_SUPER_ADMIN_USERNAME: bootstrapName,
              BOOTSTRAP_SUPER_ADMIN_PASSWORD: password,
            },
          });
        const results = await Promise.all([run(), run()]);
        assert.equal(
          results.filter(({ stdout }) => /inicial registrado/.test(stdout))
            .length,
          1,
        );
        assert.equal(
          results.filter(({ stdout }) => /ya se realizó/.test(stdout)).length,
          1,
        );
        assert.match((await run()).stdout, /ya se realizó/);
        const global = await admin.cuenta.findMany({
          where: { rolPlataformaCodigo: 'SUPER_ADMIN' },
        });
        assert.equal(global.length, 1);
        assert.equal(global[0].nombreUsuarioNormalizado, bootstrapName);
        const [{ count }] = await admin.$queryRaw`
        SELECT count(*)::int AS count FROM multi_junta.auditoria_identidad
        WHERE cuenta_id = ${global[0].id}::uuid AND evento = 'SUPER_ADMIN_INICIALIZADO'
      `;
        assert.equal(count, 1);
        const platform = readSession(
          await login(call, bootstrapName),
          expectedSession(global[0], null, {
            ambito: 'PLATAFORMA',
            rol: 'SUPER_ADMIN',
          }),
        );
        assert.equal(
          (
            await call(`${membershipA.juntaId}/mi/membresia`, {
              session: platform,
              scope: 'juntas',
            })
          ).status,
          403,
        );
      },
    );
  } finally {
    await cleanup(
      admin,
      fixture,
      bootstrapName,
      attemptHashes,
      priorIpAttempts,
    );
  }
});
