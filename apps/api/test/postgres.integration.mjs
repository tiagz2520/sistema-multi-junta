import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaService } from '../dist/core/prisma/prisma.service.js';

function sqlState(error) {
  return (
    error?.meta?.driverAdapterError?.cause?.originalCode ?? error?.meta?.code
  );
}

async function assertDenied(client, statement, description) {
  const unexpectedlyAllowed = new Error('PostgreSQL autorizó la operación.');

  await assert.rejects(
    client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(statement);
      throw unexpectedlyAllowed;
    }),
    (error) => {
      assert.notEqual(
        error,
        unexpectedlyAllowed,
        `${description} se permitió y se revirtió.`,
      );
      assert.equal(
        sqlState(error),
        '42501',
        `${description} debe rechazarse por privilegios.`,
      );
      return true;
    },
  );
}

test('la conexión de ejecución usa un rol PostgreSQL restringido', async (context) => {
  const service = new PrismaService();
  const client = service.client;
  context.after(() => service.onModuleDestroy());

  let privileges;

  try {
    [privileges] = await client.$queryRaw`
      SELECT
        current_user::text AS "currentRole",
        session_user::text AS "sessionRole",
        current_schema()::text AS "currentSchema",
        app.rolcanlogin AS "login",
        app.rolsuper AS "superuser",
        app.rolbypassrls AS "bypassRls",
        app.rolcreaterole AS "createRole",
        app.rolcreatedb AS "createDatabase",
        app.rolinherit AS "inherit",
        app.rolreplication AS "replication",
        has_database_privilege(current_database(), 'CONNECT') AS "connect",
        has_database_privilege(current_database(), 'CREATE') AS "createSchema",
        has_database_privilege(current_database(), 'TEMPORARY') AS "createTemporary",
        has_schema_privilege('multi_junta', 'USAGE') AS "useAppSchema",
        has_schema_privilege('multi_junta', 'CREATE') AS "createInAppSchema",
        has_schema_privilege('public', 'USAGE') AS "usePublicSchema",
        has_schema_privilege('public', 'CREATE') AS "createInPublic",
        pg_has_role('multi_junta_migrator', 'MEMBER') AS "memberOfMigrator",
        pg_has_role('multi_junta_migrator', 'SET') AS "setMigrator",
        EXISTS (SELECT 1 FROM pg_auth_members WHERE member = app.oid) AS "hasRoleMembership",
        EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = app.oid) AS "ownsSchema",
        EXISTS (
          SELECT 1 FROM pg_class WHERE relowner = app.oid AND relkind IN ('r', 'p', 'f')
        ) AS "ownsTable"
      FROM pg_roles AS app
      WHERE app.rolname = current_user
    `;
  } catch (error) {
    const code = sqlState(error) ?? error?.code;
    const suffix = /^[A-Z0-9]{5}$/.test(code) ? ` (${code})` : '';
    assert.fail(
      `No se pudieron comprobar los privilegios de ejecución${suffix}.`,
    );
  }

  assert.deepEqual(privileges, {
    currentRole: 'multi_junta_app',
    sessionRole: 'multi_junta_app',
    currentSchema: 'multi_junta',
    login: true,
    superuser: false,
    bypassRls: false,
    createRole: false,
    createDatabase: false,
    inherit: false,
    replication: false,
    connect: true,
    createSchema: false,
    createTemporary: false,
    useAppSchema: true,
    createInAppSchema: false,
    usePublicSchema: false,
    createInPublic: false,
    memberOfMigrator: false,
    setMigrator: false,
    hasRoleMembership: false,
    ownsSchema: false,
    ownsTable: false,
  });

  const probe = `multi_junta_probe_${randomUUID().replaceAll('-', '')}`;
  const operations = [
    [`CREATE SCHEMA "${probe}"`, 'Crear un esquema'],
    [
      `CREATE TABLE multi_junta."${probe}" (id integer)`,
      'Crear una tabla en multi_junta',
    ],
    [
      `CREATE TABLE public."${probe}" (id integer)`,
      'Crear una tabla en public',
    ],
    [`CREATE TEMP TABLE "${probe}" (id integer)`, 'Crear una tabla temporal'],
    ['SET ROLE multi_junta_migrator', 'Asumir el rol de migraciones'],
  ];

  for (const [statement, description] of operations) {
    await context.test(description, () =>
      assertDenied(client, statement, description),
    );
  }
});
