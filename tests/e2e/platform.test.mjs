import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { createApplication } from '../../apps/api/dist/app.js';
import { PrismaClient } from '../../apps/api/dist/generated/prisma/client.js';
import { hashPassword } from '../../apps/api/dist/modules/platform/identity/password.js';

function checkFixture() {
  const app = new URL(process.env.APP_DATABASE_URL);
  const admin = new URL(process.env.IDENTITY_TEST_ADMIN_URL);
  for (const url of [app, admin]) {
    assert.ok(['postgresql:', 'postgres:'].includes(url.protocol));
    assert.match(url.pathname, /^\/multi_junta_test_[a-z0-9_]+$/);
    assert.ok(!url.hash && !url.searchParams.get('options'));
    assert.ok(
      [...url.searchParams].every(
        ([key, value]) => key === 'schema' && value === 'multi_junta',
      ),
    );
  }
  assert.equal(app.host, admin.host);
  assert.equal(app.pathname, admin.pathname);
  assert.equal(app.username, 'multi_junta_app');
  assert.notEqual(admin.username, app.username);
  return admin.toString();
}

async function disposableIdentity(t, suffix) {
  const db = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: checkFixture() },
      { schema: 'multi_junta' },
    ),
  });
  const platformUser = 'plataforma-' + suffix;
  const localUser = 'directiva-' + suffix;
  const secretaryUser = 'secretaria-' + suffix;
  const juntaA = 'Junta sintética A ' + suffix;
  const juntaB = 'Junta sintética B ' + suffix;
  let verified = false;
  t.after(async () => {
    try {
      if (verified) {
        await db.$transaction(async (tx) => {
          const users = await tx.cuenta.findMany({
            where: {
              nombreUsuarioNormalizado: {
                in: [platformUser, localUser, secretaryUser],
              },
            },
            select: { id: true },
          });
          const boards = await tx.junta.findMany({
            where: { nombre: { in: [juntaA, juntaB] } },
            select: { id: true },
          });
          const accounts = { in: users.map(({ id }) => id) };
          const juntas = { in: boards.map(({ id }) => id) };
          await tx.auditoriaIdentidad.deleteMany({
            where: { cuentaId: accounts },
          });
          await tx.sesion.deleteMany({ where: { cuentaId: accounts } });
          await tx.membresia.deleteMany({ where: { cuentaId: accounts } });
          await tx.cuenta.deleteMany({ where: { id: accounts } });
          await tx.junta.deleteMany({ where: { id: juntas } });
        });
      }
    } finally {
      await db.$disconnect();
    }
  });
  const [connection] = await db.$queryRaw`
    SELECT current_database() AS database, rolsuper FROM pg_roles WHERE rolname = current_user
  `;
  assert.match(connection.database, /^multi_junta_test_[a-z0-9_]+$/);
  assert.equal(connection.rolsuper, true);
  verified = true;
  const platformPassword = randomBytes(24).toString('base64url');
  await db.cuenta.create({
    data: {
      id: randomUUID(),
      nombreUsuarioNormalizado: platformUser,
      hashContrasena: await hashPassword(platformPassword),
      rolPlataformaCodigo: 'SUPER_ADMIN',
    },
  });
  return {
    platformUser,
    localUser,
    secretaryUser,
    platformPassword,
    juntaA,
    juntaB,
  };
}

async function serve(t) {
  // Vite preview would otherwise set NODE_ENV=production in the shared process.
  process.env.NODE_ENV = 'test';
  const api = await createApplication({ logger: false });
  t.after(() => api.close());
  await api.listen(0, '127.0.0.1');
  process.env.API_PROXY_TARGET = await api.getUrl();
  const web = await preview({
    root: fileURLToPath(new URL('../../apps/web/', import.meta.url)),
    preview: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  t.after(() => web.close());
  const address = web.httpServer.address();
  assert.ok(address && typeof address === 'object');
  const origin = 'http://127.0.0.1:' + address.port;
  process.env.AUTH_ORIGIN = origin;
  return origin;
}

async function enter(page, username, password) {
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  const response = page.waitForResponse(
    (item) =>
      item.url().endsWith('/api/v1/auth/iniciar-sesion') &&
      item.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  const login = await response;
  assert.equal(
    login.status(),
    200,
    `El inicio respondió HTTP ${login.status()}`,
  );
}

async function registerJunta(page, name) {
  await page.getByRole('button', { name: 'Nueva junta', exact: true }).click();
  await page.getByLabel('Nombre de la junta', { exact: true }).fill(name);
  await page
    .getByLabel('Tipo de organización', { exact: true })
    .fill('Comunitaria');
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/plataforma/juntas') &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Registrar junta', exact: true })
    .click();
  const result = await created;
  assert.equal(result.status(), 201);
  await page.getByRole('heading', { name, exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'Volver a juntas', exact: false })
    .click();
  return result.json();
}

test(
  'la web registra y asigna una junta y restringe al administrador local',
  { timeout: 50_000 },
  async (t) => {
    const suffix = randomBytes(6).toString('hex');
    const identity = await disposableIdentity(t, suffix);
    const origin = await serve(t);
    const browser = await chromium.launch();
    t.after(() => browser.close());

    const platform = await browser.newPage();
    platform.setDefaultTimeout(10_000);
    await platform.goto(origin);
    await enter(platform, identity.platformUser, identity.platformPassword);
    const own = await registerJunta(platform, identity.juntaA);
    const foreign = await registerJunta(platform, identity.juntaB);
    await platform
      .getByRole('button', { name: own.nombre, exact: true })
      .click();
    await platform
      .getByLabel('Usuario del administrador')
      .fill(identity.localUser);
    const assignment = platform.waitForResponse(
      (response) =>
        response.url().endsWith('/administradores') &&
        response.request().method() === 'POST',
    );
    await platform
      .getByRole('button', { name: 'Asignar administrador', exact: true })
      .click();
    const assigned = await assignment;
    assert.equal(assigned.status(), 201);
    const { contrasenaTemporal } = await assigned.json();
    await platform.getByText(contrasenaTemporal, { exact: true }).waitFor();
    await platform.getByRole('button', { name: 'Cerrar credencial' }).click();
    await platform
      .getByText(contrasenaTemporal, { exact: true })
      .waitFor({ state: 'detached' });

    const local = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    local.setDefaultTimeout(10_000);
    await local.goto(origin);
    await enter(local, identity.localUser, contrasenaTemporal);
    const updated = randomBytes(24).toString('base64url');
    await local
      .getByLabel('Contraseña actual', { exact: true })
      .fill(contrasenaTemporal);
    await local.getByLabel('Nueva contraseña', { exact: true }).fill(updated);
    await local
      .getByLabel('Confirmar contraseña', { exact: true })
      .fill(updated);
    await local
      .getByRole('button', { name: 'Cambiar contraseña', exact: true })
      .click();
    await enter(local, identity.localUser, updated);
    await local.getByRole('button', { name: own.nombre, exact: false }).click();
    await local
      .getByRole('heading', { name: own.nombre, exact: true })
      .waitFor();
    assert.equal(
      await local.getByText(foreign.nombre, { exact: true }).count(),
      0,
    );
    assert.equal(
      await local
        .getByRole('button', { name: 'Nueva junta', exact: true })
        .count(),
      0,
    );
    await local
      .getByLabel('Usuario de Secretaría', { exact: true })
      .fill(identity.secretaryUser);
    await local
      .getByRole('button', { name: 'Habilitar Secretaría', exact: true })
      .click();
    const delivery = local.getByRole('dialog', { name: 'Credencial temporal' });
    await delivery.waitFor();
    await delivery.getByRole('button', { name: 'Cerrar credencial' }).click();
    const localMembership = local.getByRole('row', {
      name: new RegExp(identity.secretaryUser),
    });
    await localMembership
      .getByRole('cell', { name: 'Secretaría', exact: true })
      .waitFor();
    await localMembership
      .getByRole('button', { name: 'Editar', exact: true })
      .click();
    const editor = local.getByRole('region', { name: 'Editar membresía' });
    await editor.locator('select[name="rol"]').selectOption('TESORERIA');
    await editor.locator('select[name="estado"]').selectOption('INACTIVA');
    await local
      .getByRole('button', { name: 'Guardar cambios', exact: true })
      .click();
    await local
      .getByRole('button', { name: 'Confirmar cambios', exact: true })
      .click();
    await localMembership
      .getByRole('cell', { name: 'Tesorería', exact: true })
      .waitFor();
    await localMembership
      .getByRole('cell', { name: 'Inactiva', exact: true })
      .waitFor();
    assert.deepEqual(
      await local.evaluate(
        async ({ a, b }) =>
          Promise.all([
            globalThis
              .fetch('/api/v1/juntas/' + a + '/membresias')
              .then((r) => r.status),
            globalThis
              .fetch('/api/v1/juntas/' + b + '/membresias')
              .then((r) => r.status),
            globalThis.fetch('/api/v1/plataforma/juntas').then((r) => r.status),
          ]),
        { a: own.id, b: foreign.id },
      ),
      [200, 403, 403],
    );
    assert.equal(
      await local.evaluate(
        () => globalThis.localStorage.length + globalThis.sessionStorage.length,
      ),
      0,
    );
    await local
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click();
    await local
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .waitFor();
  },
);
