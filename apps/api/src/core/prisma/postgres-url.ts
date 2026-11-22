export const appSchema = 'multi_junta';
export const appRole = 'multi_junta_app';
const migrationRole = 'multi_junta_migrator';

type PostgresUrlVariable = 'APP_DATABASE_URL' | 'MIGRATION_DATABASE_URL';

export function validatePostgresUrl(
  value: string,
  variable: PostgresUrlVariable,
) {
  const migration = variable === 'MIGRATION_DATABASE_URL';
  const expectedRole = migration ? migrationRole : appRole;
  let url: URL;
  let user: string;
  let password: string;

  try {
    url = new URL(value);
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    throw new Error(`${variable} debe ser una URL PostgreSQL válida.`);
  }

  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !url.hostname ||
    url.pathname.length < 2 ||
    !user ||
    !password ||
    url.hash
  ) {
    throw new Error(
      `${variable} debe incluir servidor, base, usuario y contraseña PostgreSQL.`,
    );
  }

  if (user !== expectedRole) {
    throw new Error(`${variable} debe usar el rol ${expectedRole}.`);
  }

  if (
    ['user', 'password', 'options'].some((key) => url.searchParams.has(key))
  ) {
    throw new Error(
      `${variable} no admite user, password ni options como parámetros.`,
    );
  }

  const schemas = url.searchParams.getAll('schema');

  if (
    schemas.length > 1 ||
    ((migration || schemas.length === 1) && schemas[0] !== appSchema)
  ) {
    throw new Error(`${variable} debe usar el esquema ${appSchema}.`);
  }

  return url.toString();
}
