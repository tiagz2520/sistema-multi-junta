import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkApiHealth, healthEndpoint } from './health';

afterEach(() => vi.unstubAllGlobals());

describe('checkApiHealth', () => {
  it('acepta una respuesta exitosa de la API', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    const { signal } = new AbortController();

    await expect(checkApiHealth(signal)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(healthEndpoint, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal,
    });
  });

  it.each([
    {
      scenario: 'un error HTTP con cuerpo válido',
      response: Response.json({ status: 'ok' }, { status: 503 }),
    },
    {
      scenario: 'un estado no disponible',
      response: Response.json({ status: 'unavailable' }),
    },
    {
      scenario: 'una respuesta HTML',
      response: new Response('<!doctype html>'),
    },
  ])('rechaza $scenario', async ({ response }) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response));

    await expect(checkApiHealth(new AbortController().signal)).resolves.toBe(
      false,
    );
  });

  it('maneja un fallo de red', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Error de red')),
    );

    await expect(checkApiHealth(new AbortController().signal)).resolves.toBe(
      false,
    );
  });
});
