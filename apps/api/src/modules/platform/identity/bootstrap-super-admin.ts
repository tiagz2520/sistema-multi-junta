import { PrismaPg } from '@prisma/adapter-pg';
import { validatePostgresUrl } from '../../../core/prisma/postgres-url.js';
import { PrismaClient } from '../../../generated/prisma/client.js';
import { normalizeUsername } from './normalize-username.js';
import { hashPassword, isNewPasswordValid } from './password.js';

async function bootstrapSuperAdmin(): Promise<boolean> {
  const {
    BOOTSTRAP_SUPER_ADMIN_USERNAME: username,
    BOOTSTRAP_SUPER_ADMIN_PASSWORD: password,
    MIGRATION_DATABASE_URL: migrationUrl,
  } = process.env;
  delete process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;

  if (!username || !isNewPasswordValid(password) || !migrationUrl) {
    throw new Error(
      'Faltan los datos de inicialización o su formato es inválido.',
    );
  }

  const nombreUsuarioNormalizado = normalizeUsername(username);
  const connectionString = validatePostgresUrl(
    migrationUrl,
    'MIGRATION_DATABASE_URL',
  );
  const hashContrasena = await hashPassword(password);
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }, { schema: 'multi_junta' }),
  });

  try {
    return await client.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT 1 FROM pg_catalog.pg_advisory_xact_lock(47268, 3)
      `;
      const [installation] = await tx.$queryRaw<{ initialized: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM multi_junta.auditoria_identidad
          WHERE evento = 'SUPER_ADMIN_INICIALIZADO'
        ) OR EXISTS (
          SELECT 1 FROM multi_junta.cuenta WHERE rol_plataforma_codigo = 'SUPER_ADMIN'
        ) AS initialized
      `;
      if (installation?.initialized) {
        return false;
      }

      const account = await tx.cuenta.create({
        data: {
          nombreUsuarioNormalizado,
          hashContrasena,
          rolPlataformaCodigo: 'SUPER_ADMIN',
        },
        select: { id: true },
      });
      await tx.$executeRaw`
        INSERT INTO multi_junta.auditoria_identidad (cuenta_id, evento)
        VALUES (${account.id}::uuid, 'SUPER_ADMIN_INICIALIZADO')
      `;
      return true;
    });
  } finally {
    await client.$disconnect();
  }
}

try {
  const created = await bootstrapSuperAdmin();
  console.info(
    created
      ? 'Super Administrador inicial registrado.'
      : 'La inicialización de Super Administrador ya se realizó.',
  );
} catch {
  console.error(
    'Falló la inicialización. Comprueba las variables, el formato, la migración y la disponibilidad del usuario.',
  );
  process.exitCode = 1;
}
