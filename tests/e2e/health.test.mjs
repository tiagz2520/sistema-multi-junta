import assert from 'node:assert/strict';
import { env } from 'node:process';
import { test } from 'node:test';
import { URL } from 'node:url';

const api = `http://127.0.0.1:${env.PORT ?? '3000'}`;
const web = `http://127.0.0.1:${env.WEB_PORT ?? '5173'}`;

async function request(baseUrl, path) {
  const response = await globalThis.fetch(new URL(path, baseUrl), {
    signal: globalThis.AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200);
  return response;
}

test('La API responde directamente', async () => {
  const response = await request(api, '/api/v1/health');
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('La web sirve la aplicación y reenvía la comprobación a la API', async () => {
  const page = await request(web, '/');
  assert.match(page.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await page.text(), /id="root"/);

  const response = await request(web, '/api/v1/health');
  assert.deepEqual(await response.json(), { status: 'ok' });
});
