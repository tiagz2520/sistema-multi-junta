import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { createApplication } from '../../apps/api/dist/app.js';
import { PrismaClient } from '../../apps/api/dist/generated/prisma/client.js';
import { hashPassword } from '../../apps/api/dist/modules/platform/identity/password.js';

function fixtureUrl(value) {
  const url = new URL(value);
  assert.ok(['postgresql:', 'postgres:'].includes(url.protocol));
  assert.match(url.pathname, /^\/multi_junta_test_[a-z0-9_]+$/);
  assert.equal(url.hash, '');
  for (const [key, value] of url.searchParams) {
    assert.equal(key, 'schema');
    assert.equal(value, 'multi_junta');
  }
  return url;
}

export async function operationalFixture(t) {
  const runtime = fixtureUrl(process.env.APP_DATABASE_URL);
  const fixture = fixtureUrl(process.env.IDENTITY_TEST_ADMIN_URL);
  assert.equal(runtime.username, 'multi_junta_app');
  assert.notEqual(fixture.username, runtime.username);
  assert.equal(fixture.host, runtime.host);
  assert.equal(fixture.pathname, runtime.pathname);
  const db = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: fixture.href },
      { schema: 'multi_junta' },
    ),
  });
  t.after(() => db.$disconnect());
  const [identity] =
    await db.$queryRaw`SELECT current_database() AS db, rolsuper FROM pg_roles WHERE rolname=current_user`;
  assert.match(identity.db, /^multi_junta_test_[a-z0-9_]+$/);
  assert.equal(identity.rolsuper, true);

  const suffix = randomBytes(6).toString('hex');
  const juntas = await Promise.all(
    ['a', 'b'].map(async (group) => {
      const junta = await db.junta.create({
        data: {
          id: randomUUID(),
          tipo: 'Sintética',
          nombre: `Junta ${group} ${suffix}`,
        },
      });
      const roles = [
        ['admin', 'ADMIN_JUNTA'],
        ['secretaria', 'SECRETARIA'],
        ['tesoreria', 'TESORERIA'],
        ['socio', 'SOCIO'],
      ];
      const accounts = await Promise.all(
        roles.map(async ([clase, rolCodigo]) => {
          const usuario = `${clase}-${group}-${suffix}`;
          const contrasena = randomBytes(24).toString('base64url');
          const cuenta = await db.cuenta.create({
            data: {
              id: randomUUID(),
              nombreUsuarioNormalizado: usuario,
              hashContrasena: await hashPassword(contrasena),
            },
          });
          await db.membresia.create({
            data: {
              id: randomUUID(),
              juntaId: junta.id,
              cuentaId: cuenta.id,
              rolCodigo,
            },
          });
          return [clase, { usuario, contrasena, cuentaId: cuenta.id }];
        }),
      );
      return { ...junta, ...Object.fromEntries(accounts) };
    }),
  );

  return { db, juntas };
}

export async function serveApi(t) {
  process.env.NODE_ENV = 'test';
  const app = await createApplication({ logger: false });
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  process.env.AUTH_ORIGIN = origin;
  return origin;
}

export async function login(origin, credentials, juntaId) {
  let cookie;
  let csrf;
  async function request(path, method = 'GET', body) {
    const headers = {
      Origin: process.env.AUTH_ORIGIN,
      'X-CSRF-Token': csrf ?? 'inicio',
    };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined && !(body instanceof globalThis.FormData))
      headers['Content-Type'] = 'application/json';
    const response = await globalThis.fetch(origin + '/api/v1' + path, {
      method,
      headers,
      body:
        body instanceof globalThis.FormData
          ? body
          : body === undefined
            ? undefined
            : JSON.stringify(body),
    });
    const next = response.headers.get('set-cookie');
    if (next) cookie = next.split(';')[0];
    return response;
  }
  const signedIn = await request('/auth/iniciar-sesion', 'POST', {
    usuario: credentials.usuario,
    contrasena: credentials.contrasena,
  });
  assert.equal(signedIn.status, 200);
  csrf = (await signedIn.json()).csrfToken;
  const context = await request('/auth/contexto', 'POST', { juntaId });
  assert.equal(context.status, 200);
  csrf = (await context.json()).csrfToken;
  return request;
}

export async function responseData(result, status = 200) {
  const json = await result.json();
  assert.equal(result.status, status, JSON.stringify(json));
  return json;
}
