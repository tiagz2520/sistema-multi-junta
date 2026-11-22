import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { URL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { TenantUnitOfWork } from '../dist/core/prisma/tenant-unit-of-work.js';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { MembershipRepository } from '../dist/modules/platform/identity/membership.repository.js';
import { normalizeUsername } from '../dist/modules/platform/identity/normalize-username.js';

const schema = 'multi_junta';
const appRole = 'multi_junta_app';
const migratorRole = 'multi_junta_migrator';

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
    `${variable} debe apuntar a una base de prueba multi_junta_test_…`,
  );
  assert.ok(
    [...url.searchParams].every(
      ([key, value]) => key === 'schema' && value === schema,
    ) && url.searchParams.getAll('schema').length <= 1,
    `${variable} solo admite el parámetro schema=${schema}.`,
  );
  if (expectedRole) {
    assert.equal(role, expectedRole, `${variable} tiene un rol incorrecto.`);
  }

  return {
    role,
    database: url.pathname.slice(1),
    destination: `${url.hostname}:${url.port || 5432}${url.pathname}`,
    connectionString: url.toString(),
  };
}

function connect({ connectionString }, max = 1) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max }, { schema }),
  });
}

async function checkConnection(client, url, superuser) {
  const [connection] = await client.$queryRaw`
    SELECT current_database()::text AS database, current_user::text AS role,
      session_user::text AS "sessionRole", rolsuper AS "isSuperuser", rolbypassrls AS "bypassesRls"
    FROM pg_roles WHERE rolname = current_user
  `;
  const { bypassesRls, ...identity } = connection;
  assert.deepEqual(identity, {
    database: url.database,
    role: url.role,
    sessionRole: url.role,
    isSuperuser: superuser,
  });
  if (!superuser) assert.equal(bypassesRls, false);
}

function sqlState(error) {
  return (
    error?.meta?.driverAdapterError?.cause?.originalCode ?? error?.meta?.code
  );
}

async function rejectsSql(execute, state) {
  await assert.rejects(execute, (error) => {
    assert.equal(sqlState(error), state);
    return true;
  });
}

function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const [juntaA, juntaB, otherJunta] = Array.from({ length: 3 }, randomUUID);
  const [accountA, accountB] = [randomUUID(), randomUUID()];
  const competingAccounts = [randomUUID(), randomUUID()];
  const [memberA, memberB, memberB2] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  const [sessionA, sessionB, platform, preliminary] = Array.from(
    { length: 4 },
    randomUUID,
  );
  const [extraMembership, extraSession] = [randomUUID(), randomUUID()];
  return {
    suffix,
    juntaA,
    juntaB,
    otherJunta,
    accountA,
    accountB,
    competingAccounts,
    memberA,
    memberB,
    memberB2,
    sessionA,
    sessionB,
    platform,
    preliminary,
    extraMembership,
    extraSession,
  };
}

function localSession(id, juntaId, membresiaId, cuentaId) {
  return {
    id,
    huellaToken: `huella-sintetica-${id}`,
    cuentaId,
    ambito: 'JUNTA',
    juntaId,
    membresiaId,
    versionAccesoJunta: 1,
    versionAccesoMembresia: 1,
    expiraAbsolutaEn: new Date('2099-01-01T00:00:00Z'),
    expiraInactividadEn: new Date('2098-12-31T00:00:00Z'),
  };
}

async function seed(admin, data) {
  const {
    suffix,
    juntaA,
    juntaB,
    accountA,
    accountB,
    memberA,
    memberB,
    memberB2,
  } = data;
  await admin.$transaction(async (tx) => {
    await tx.junta.createMany({
      data: [
        {
          id: juntaA,
          nombre: 'Junta sintética A',
          tipo: 'PRUEBA',
          ruc: `ruc-prueba-${suffix}`,
        },
        { id: juntaB, nombre: 'Junta sintética B', tipo: 'PRUEBA' },
        {
          id: data.otherJunta,
          nombre: 'Junta sintética sin RUC',
          tipo: 'PRUEBA',
          estado: 'INACTIVA',
        },
      ],
    });
    await tx.cuenta.createMany({
      data: [
        {
          id: accountA,
          nombreUsuarioNormalizado: normalizeUsername(`  Socio_A-${suffix}  `),
          hashContrasena: 'solo-prueba',
        },
        {
          id: accountB,
          nombreUsuarioNormalizado: `socio_b-${suffix}`,
          hashContrasena: 'solo-prueba',
          rolPlataformaCodigo: 'SUPER_ADMIN',
        },
      ],
    });
    await tx.membresia.createMany({
      data: [
        {
          id: memberA,
          juntaId: juntaA,
          cuentaId: accountA,
          rolCodigo: 'SOCIO',
        },
        {
          id: memberB,
          juntaId: juntaB,
          cuentaId: accountA,
          rolCodigo: 'TESORERIA',
        },
        {
          id: memberB2,
          juntaId: juntaB,
          cuentaId: accountB,
          rolCodigo: 'SOCIO',
        },
      ],
    });
    const sessionA = localSession(data.sessionA, juntaA, memberA, accountA);
    const sessionB = localSession(data.sessionB, juntaB, memberB, accountA);
    await tx.sesion.createMany({
      data: [
        sessionA,
        sessionB,
        ...['PLATAFORMA', 'PREVIA'].map((ambito) => {
          const id = ambito === 'PLATAFORMA' ? data.platform : data.preliminary;
          return {
            id,
            huellaToken: `huella-sintetica-${id}`,
            cuentaId: accountB,
            ambito,
            expiraAbsolutaEn: sessionA.expiraAbsolutaEn,
            expiraInactividadEn: sessionA.expiraInactividadEn,
          };
        }),
      ],
    });
  });
}

async function cleanup(admin, data) {
  const accountIds = [data.accountA, data.accountB, ...data.competingAccounts];
  await admin.$transaction(async (tx) => {
    await tx.sesion.deleteMany({ where: { cuentaId: { in: accountIds } } });
    await tx.membresia.deleteMany({ where: { cuentaId: { in: accountIds } } });
    await tx.cuenta.deleteMany({ where: { id: { in: accountIds } } });
    await tx.junta.deleteMany({
      where: { id: { in: [data.juntaA, data.juntaB, data.otherJunta] } },
    });
  });
}

function storeIdentities(tx, data) {
  const accounts = [data.accountA, data.accountB];
  return Promise.all([
    tx.membresia.findMany({
      where: { cuentaId: { in: accounts } },
      select: { id: true },
      orderBy: { id: 'asc' },
    }),
    tx.sesion.findMany({
      where: { cuentaId: { in: accounts } },
      select: { id: true },
      orderBy: { id: 'asc' },
    }),
  ]);
}

async function assertVisible(tx, data, juntaId) {
  const [memberships, sessions] = await storeIdentities(tx, data);
  const membershipIds =
    juntaId === data.juntaA
      ? [data.memberA]
      : juntaId === data.juntaB
        ? [data.memberB, data.memberB2].sort()
        : [];
  const sessionIds =
    juntaId === data.juntaA
      ? [data.sessionA]
      : juntaId === data.juntaB
        ? [data.sessionB]
        : [];
  assert.deepEqual(
    memberships.map(({ id }) => id),
    membershipIds,
  );
  assert.deepEqual(
    sessions.map(({ id }) => id),
    sessionIds,
  );
}

async function connectionContext(tx) {
  const [context] = await tx.$queryRaw`
    SELECT pg_backend_pid() AS pid, NULLIF(current_setting('app.junta_id', true), '') AS junta
  `;
  return context;
}

test('normalización de nombres de usuario ASCII de 3 a 32 caracteres', () => {
  assert.equal(normalizeUsername('  Ab0  '), 'ab0');
  assert.equal(normalizeUsername(' A.Z_9-J '), 'a.z_9-j');
  assert.equal(normalizeUsername('X'.repeat(32)), 'x'.repeat(32));

  for (const value of [
    'ab',
    'a'.repeat(33),
    'abc def',
    'abc\tdef',
    'ñabc',
    'Ａbc',
    'abc@def',
  ]) {
    assert.throws(
      () => normalizeUsername(value),
      `Entrada inválida: ${JSON.stringify(value)}`,
    );
  }
});

test('modelo y aislamiento de identidad con PostgreSQL real', async (context) => {
  const appUrl = fixtureUrl('APP_DATABASE_URL', appRole);
  const migrationUrl = fixtureUrl('MIGRATION_DATABASE_URL', migratorRole);
  const adminUrl = fixtureUrl('IDENTITY_TEST_ADMIN_URL');
  assert.equal(appUrl.destination, migrationUrl.destination);
  assert.equal(appUrl.destination, adminUrl.destination);
  assert.ok(![appRole, migratorRole].includes(adminUrl.role));

  const app = connect(appUrl);
  const migrator = connect(migrationUrl);
  const admin = connect(adminUrl);
  const parallelApp = connect(appUrl, 2);
  const work = new TenantUnitOfWork({ client: app });
  const parallelWork = new TenantUnitOfWork({ client: parallelApp });
  context.after(() =>
    Promise.all(
      [app, migrator, admin, parallelApp].map((client) => client.$disconnect()),
    ),
  );

  await Promise.all([
    checkConnection(app, appUrl, false),
    checkConnection(migrator, migrationUrl, false),
    checkConnection(admin, adminUrl, true),
  ]);

  const [{ locked }] = await admin.$queryRaw`
    SELECT pg_try_advisory_lock(hashtext(current_database()), hashtext('identidad-fixture')) AS locked
  `;
  assert.equal(
    locked,
    true,
    'La base de prueba ya ejecuta la suite de identidad.',
  );

  const privileges = await app.$queryRaw`
    SELECT relname::text AS name, relrowsecurity AS enabled, relforcerowsecurity AS forced,
      pg_get_userbyid(relowner)::text AS owner,
      has_table_privilege(tables.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS granted
    FROM pg_class AS tables JOIN pg_namespace AS namespace ON namespace.oid = tables.relnamespace
    WHERE nspname = 'multi_junta'
      AND relname IN ('junta', 'cuenta', 'rol', 'membresia', 'sesion', '_prisma_migrations')
    ORDER BY relname
  `;
  assert.deepEqual(privileges.map(({ name }) => name).sort(), [
    '_prisma_migrations',
    'cuenta',
    'junta',
    'membresia',
    'rol',
    'sesion',
  ]);
  for (const { name, enabled, forced, owner, granted } of privileges) {
    const tenantTable = name === 'membresia' || name === 'sesion';
    assert.equal(owner, migratorRole, name);
    assert.equal(granted, false, name);
    assert.equal(enabled, tenantTable, name);
    assert.equal(forced, tenantTable, name);
  }
  await rejectsSql(
    () => app.$queryRaw`SELECT id FROM multi_junta.membresia`,
    '42501',
  );

  const data = fixture();
  const {
    suffix,
    juntaA,
    juntaB,
    accountA,
    accountB,
    memberA,
    memberB,
    memberB2,
  } = data;
  await seed(admin, data);
  try {
    await context.test(
      'catálogo fijo y restricciones globales y locales',
      async () => {
        const [{ states }] = await admin.$queryRaw`
          SELECT enum_range(NULL::multi_junta.estado)::text[] AS states
        `;
        assert.deepEqual(states, ['ACTIVA', 'INACTIVA']);
        const juntas = await admin.junta.findMany({
          where: { id: { in: [juntaB, data.otherJunta] } },
          select: { id: true, estado: true, ruc: true },
        });
        assert.deepEqual(
          new Map(juntas.map(({ id, estado, ruc }) => [id, [estado, ruc]])),
          new Map([
            [juntaB, ['ACTIVA', null]],
            [data.otherJunta, ['INACTIVA', null]],
          ]),
        );
        const roles = await admin.rol.findMany({
          select: { codigo: true, ambito: true },
        });
        assert.deepEqual(
          new Map(roles.map(({ codigo, ambito }) => [codigo, ambito])),
          new Map([
            ['SUPER_ADMIN', 'PLATAFORMA'],
            ['ADMIN_JUNTA', 'JUNTA'],
            ['SECRETARIA', 'JUNTA'],
            ['TESORERIA', 'JUNTA'],
            ['SOCIO', 'JUNTA'],
          ]),
        );
        await rejectsSql(
          () => admin.$executeRaw`
        UPDATE multi_junta.cuenta SET nombre_usuario_normalizado = ${normalizeUsername(`SOCIO_A-${suffix}`)} WHERE id = ${accountB}::uuid
      `,
          '23505',
        );
        await rejectsSql(
          () => admin.$executeRaw`
        UPDATE multi_junta.cuenta SET nombre_usuario_normalizado = 'Inválido' WHERE id = ${accountB}::uuid
      `,
          '23514',
        );
        await rejectsSql(
          () => admin.$executeRaw`
        UPDATE multi_junta.junta SET ruc = ${`ruc-prueba-${suffix}`} WHERE id = ${juntaB}::uuid
      `,
          '23505',
        );
        await rejectsSql(
          () => admin.$executeRaw`
        INSERT INTO multi_junta.membresia (id, junta_id, cuenta_id, rol_codigo)
        VALUES (${data.extraMembership}::uuid, ${juntaA}::uuid, ${accountA}::uuid, 'SOCIO')
      `,
          '23505',
        );
        await rejectsSql(
          () => admin.$executeRaw`
        UPDATE multi_junta.membresia SET rol_codigo = 'SUPER_ADMIN' WHERE id = ${memberA}::uuid
      `,
          '23503',
        );
        await rejectsSql(
          () => admin.$executeRaw`
        UPDATE multi_junta.cuenta SET rol_plataforma_codigo = 'SOCIO' WHERE id = ${accountA}::uuid
      `,
          '23503',
        );
        const memberships = await admin.membresia.findMany({
          where: { cuentaId: accountA },
          select: { juntaId: true, rolCodigo: true, estado: true },
        });
        assert.deepEqual(
          new Map(
            memberships.map(({ juntaId, rolCodigo, estado }) => [
              juntaId,
              [rolCodigo, estado],
            ]),
          ),
          new Map([
            [juntaA, ['SOCIO', 'ACTIVA']],
            [juntaB, ['TESORERIA', 'ACTIVA']],
          ]),
        );
      },
    );

    await context.test(
      'altas concurrentes con el mismo nombre preservan una sola cuenta',
      async () => {
        const concurrentAdmin = connect(adminUrl, 2);
        try {
          const names = [`  Concurrente-${suffix}  `, `CONCURRENTE-${suffix}`];
          const inputs = data.competingAccounts.map((id, index) => ({
            id,
            nombreUsuarioNormalizado: normalizeUsername(names[index]),
            hashContrasena: `hash-sintetico-${index}`,
          }));
          const results = await Promise.allSettled(
            inputs.map(
              (input) => concurrentAdmin.$executeRaw`
          INSERT INTO multi_junta.cuenta (id, nombre_usuario_normalizado, hash_contrasena)
          VALUES (${input.id}::uuid, ${input.nombreUsuarioNormalizado}, ${input.hashContrasena})
        `,
            ),
          );
          assert.equal(
            results.filter(({ status }) => status === 'fulfilled').length,
            1,
          );
          assert.equal(
            sqlState(
              results.find(({ status }) => status === 'rejected').reason,
            ),
            '23505',
          );
          const winner = results.findIndex(
            ({ status }) => status === 'fulfilled',
          );
          const accounts = await admin.cuenta.findMany({
            where: { id: { in: data.competingAccounts } },
            select: {
              id: true,
              nombreUsuarioNormalizado: true,
              hashContrasena: true,
            },
          });
          assert.deepEqual(accounts, [inputs[winner]]);
        } finally {
          await concurrentAdmin.$disconnect();
        }
      },
    );

    await context.test(
      'una cuenta no adquiere dos administraciones activas concurrentes',
      async () => {
        const concurrentAdmin = connect(adminUrl, 2);
        try {
          const results = await Promise.allSettled(
            [memberA, memberB].map(
              (membership) => concurrentAdmin.$executeRaw`
          UPDATE multi_junta.membresia SET rol_codigo = 'ADMIN_JUNTA' WHERE id = ${membership}::uuid
        `,
            ),
          );
          assert.equal(
            results.filter(({ status }) => status === 'fulfilled').length,
            1,
          );
          assert.equal(
            sqlState(
              results.find(({ status }) => status === 'rejected').reason,
            ),
            '23505',
          );
          const active = await admin.membresia.findFirstOrThrow({
            where: {
              cuentaId: accountA,
              rolCodigo: 'ADMIN_JUNTA',
              estado: 'ACTIVA',
            },
          });
          await admin.membresia.update({
            where: { id: active.id },
            data: { estado: 'INACTIVA' },
          });
          const other = active.id === memberA ? memberB : memberA;
          await admin.membresia.update({
            where: { id: other },
            data: { rolCodigo: 'ADMIN_JUNTA' },
          });
          assert.equal(
            await admin.membresia.count({
              where: { cuentaId: accountA, rolCodigo: 'ADMIN_JUNTA' },
            }),
            2,
          );
        } finally {
          await admin.$transaction([
            admin.membresia.update({
              where: { id: memberA },
              data: { rolCodigo: 'SOCIO', estado: 'ACTIVA' },
            }),
            admin.membresia.update({
              where: { id: memberB },
              data: { rolCodigo: 'TESORERIA', estado: 'ACTIVA' },
            }),
          ]);
          await concurrentAdmin.$disconnect();
        }
      },
    );

    await context.test(
      'la sesión exige ámbito y FK de cuenta, membresía y junta coherentes',
      async () => {
        await rejectsSql(
          () => admin.$executeRaw`
        UPDATE multi_junta.sesion SET membresia_id = ${memberB}::uuid WHERE id = ${data.sessionA}::uuid
      `,
          '23503',
        );
        await rejectsSql(
          () => admin.$executeRaw`
        UPDATE multi_junta.sesion SET membresia_id = ${memberB2}::uuid WHERE id = ${data.sessionB}::uuid
      `,
          '23503',
        );
        await rejectsSql(
          () => admin.$executeRaw`
        UPDATE multi_junta.sesion SET junta_id = NULL WHERE id = ${data.sessionA}::uuid
      `,
          '23514',
        );
        await rejectsSql(
          () => admin.$executeRaw`
        UPDATE multi_junta.sesion SET junta_id = ${juntaA}::uuid WHERE id = ${data.platform}::uuid
      `,
          '23514',
        );
        await rejectsSql(
          () => admin.$executeRaw`
        UPDATE multi_junta.sesion SET huella_token = ${`huella-sintetica-${data.sessionA}`} WHERE id = ${data.sessionB}::uuid
      `,
          '23505',
        );
      },
    );

    await admin.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON multi_junta.membresia, multi_junta.sesion TO multi_junta_app`;
    try {
      await context.test(
        'las políticas deniegan lectura y escritura sin un contexto de junta válido',
        async () => {
          await assertVisible(app, data);
          for (const value of ['', 'no-es-un-uuid', randomUUID()]) {
            await app.$transaction(async (tx) => {
              await tx.$queryRaw`SELECT set_config('app.junta_id', ${value}, true)`;
              await assertVisible(tx, data);
            });
          }
          assert.equal(
            await app.$executeRaw`UPDATE multi_junta.membresia SET version_acceso = 25 WHERE id = ${memberA}::uuid`,
            0,
          );
          assert.equal(
            await app.$executeRaw`DELETE FROM multi_junta.sesion WHERE id = ${data.sessionA}::uuid`,
            0,
          );
          await rejectsSql(
            () => app.$executeRaw`
          INSERT INTO multi_junta.membresia (id, junta_id, cuenta_id, rol_codigo)
          VALUES (${data.extraMembership}::uuid, ${juntaA}::uuid, ${accountB}::uuid, 'SOCIO')
        `,
            '42501',
          );
        },
      );

      await context.test(
        'la junta autorizada puede operar sus filas y las escrituras cruzadas se deniegan',
        async () => {
          const memberships = new MembershipRepository();
          await work.run(juntaA, async (tx) => {
            await assertVisible(tx, data, juntaA);
            assert.deepEqual(await memberships.findById(tx, juntaA, memberA), {
              id: memberA,
              juntaId: juntaA,
              cuentaId: accountA,
              rolCodigo: 'SOCIO',
              estado: 'ACTIVA',
              versionAcceso: 1,
            });
            assert.equal(await memberships.findById(tx, juntaB, memberB), null);
            assert.equal(
              await tx.$executeRaw`UPDATE multi_junta.membresia SET version_acceso = 25 WHERE id = ${memberB}::uuid`,
              0,
            );
            assert.equal(
              await tx.$executeRaw`DELETE FROM multi_junta.sesion WHERE id = ${data.sessionB}::uuid`,
              0,
            );
            const extra = await tx.membresia.create({
              data: {
                id: data.extraMembership,
                juntaId: juntaA,
                cuentaId: accountB,
                rolCodigo: 'SECRETARIA',
              },
            });
            const session = await tx.sesion.create({
              data: localSession(data.extraSession, juntaA, extra.id, accountB),
            });
            await tx.sesion.update({
              where: { id: session.id },
              data: { revocadaEn: new Date() },
            });
            await tx.sesion.delete({ where: { id: session.id } });
            await tx.membresia.delete({ where: { id: extra.id } });
          });
          await rejectsSql(
            () =>
              work.run(
                juntaA,
                (tx) => tx.$executeRaw`
          UPDATE multi_junta.membresia SET junta_id = ${juntaB}::uuid WHERE id = ${memberA}::uuid
        `,
              ),
            '42501',
          );
          await rejectsSql(
            () =>
              work.run(
                juntaA,
                (tx) => tx.$executeRaw`
          UPDATE multi_junta.sesion SET ambito = 'PLATAFORMA', junta_id = NULL, membresia_id = NULL,
            version_acceso_junta = NULL, version_acceso_membresia = NULL WHERE id = ${data.sessionA}::uuid
        `,
              ),
            '42501',
          );
          await rejectsSql(
            () =>
              work.run(
                juntaA,
                (tx) => tx.$executeRaw`
          INSERT INTO multi_junta.membresia (id, junta_id, cuenta_id, rol_codigo)
          VALUES (${data.extraMembership}::uuid, ${juntaB}::uuid, ${accountB}::uuid, 'SECRETARIA')
        `,
              ),
            '42501',
          );
          await work.run(juntaB, (tx) => assertVisible(tx, data, juntaB));
        },
      );

      await context.test(
        'la unidad de trabajo limita el contexto a una transacción, incluso al revertir',
        async () => {
          let called = false;
          await assert.rejects(
            work.run('no-es-un-uuid', () => {
              called = true;
            }),
            /UUID/,
          );
          assert.equal(called, false);
          const { pid } = await connectionContext(app);
          await work.run(juntaA, async (tx) => {
            assert.deepEqual(await connectionContext(tx), {
              pid,
              junta: juntaA,
            });
            await assertVisible(tx, data, juntaA);
          });
          assert.deepEqual(await connectionContext(app), { pid, junta: null });
          await assertVisible(app, data);
          const rollback = new Error('reversión sintética');
          await assert.rejects(
            work.run(juntaA, async (tx) => {
              assert.deepEqual(await connectionContext(tx), {
                pid,
                junta: juntaA,
              });
              await tx.membresia.update({
                where: { id: memberA },
                data: { versionAcceso: 25 },
              });
              throw rollback;
            }),
            (error) => error === rollback,
          );
          assert.deepEqual(await connectionContext(app), { pid, junta: null });
          await assertVisible(app, data);
          await work.run(juntaB, async (tx) => {
            assert.deepEqual(await connectionContext(tx), {
              pid,
              junta: juntaB,
            });
            await assertVisible(tx, data, juntaB);
          });
          assert.equal(
            (
              await admin.membresia.findUniqueOrThrow({
                where: { id: memberA },
              })
            ).versionAcceso,
            1,
          );
          const pids = await Promise.all(
            [juntaA, juntaB].map((junta) =>
              parallelWork.run(junta, async (tx) => {
                const ctx = await connectionContext(tx);
                assert.equal(ctx.junta, junta);
                await assertVisible(tx, data, junta);
                return ctx.pid;
              }),
            ),
          );
          assert.notEqual(pids[0], pids[1]);
        },
      );
    } finally {
      await admin.$executeRaw`REVOKE SELECT, INSERT, UPDATE, DELETE ON multi_junta.membresia, multi_junta.sesion FROM multi_junta_app`;
    }
  } finally {
    await cleanup(admin, data);
  }
  await rejectsSql(
    () => app.$queryRaw`SELECT id FROM multi_junta.membresia`,
    '42501',
  );
});
