import assert from 'node:assert/strict';
import { test } from 'node:test';
import { URL } from 'node:url';
import { createApplication } from '../dist/app.js';

test('GET /api/v1/health responde con el estado de la API', async (context) => {
  const app = await createApplication({ logger: false });
  context.after(() => app.close());
  await app.listen(0, '127.0.0.1');

  const url = new URL('/api/v1/health', await app.getUrl());
  const response = await globalThis.fetch(url);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});
