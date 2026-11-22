import {
  ApiError,
  createApiClient,
  type Sesion,
} from '@multi-junta/api-client';
import { describe, expect, it, vi } from 'vitest';

const session: Sesion = {
  ambito: 'PREVIA',
  cuentaId: 'cuenta-sintetica',
  csrfToken: 'csrf-sintetico',
  juntaId: null,
  membresiaId: null,
  requiereCambioContrasena: false,
  rol: null,
};

describe('cliente REST', () => {
  it('inicia sesión con JSON y la cabecera CSRF de inicio', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(session));
    const client = createApiClient(fetcher);

    await expect(
      client.auth.login('usuario-ficticio', 'Ejemplo de contraseña'),
    ).resolves.toEqual(session);
    const [path, options] = fetcher.mock.calls[0];
    expect(path).toBe('/api/v1/auth/iniciar-sesion');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({
        usuario: 'usuario-ficticio',
        contrasena: 'Ejemplo de contraseña',
      }),
    });
    expect(new Headers(options?.headers).get('X-CSRF-Token')).toBe('inicio');
  });

  it('usa el CSRF entregado por la sesión para editar y cerrar', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ estado: 'INACTIVA' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createApiClient(fetcher);

    await client.tenant.updateMembership(
      'junta',
      'miembro',
      { estado: 'INACTIVA' },
      session.csrfToken,
    );
    await expect(
      client.auth.logout(session.csrfToken),
    ).resolves.toBeUndefined();
    expect(
      fetcher.mock.calls.map(([path, options]) => [
        path,
        options?.method,
        new Headers(options?.headers).get('X-CSRF-Token'),
      ]),
    ).toEqual([
      ['/api/v1/juntas/junta/membresias/miembro', 'PATCH', session.csrfToken],
      ['/api/v1/auth/cerrar-sesion', 'POST', session.csrfToken],
    ]);
  });

  it('conserva el código de autorización en errores HTTP', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ message: 'Sin sesión.' }, { status: 401 }),
      );
    await expect(createApiClient(fetcher).auth.session()).rejects.toEqual(
      new ApiError(401, 'Sin sesión.'),
    );
  });

  it('envía respaldo multipart y deja que el navegador añada el boundary', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: 'gasto' }));
    const form = new FormData();
    form.set('concepto', 'Compra de prueba');
    form.set(
      'archivo',
      new Blob(['%PDF-ficticio'], { type: 'application/pdf' }),
      'prueba.pdf',
    );

    await createApiClient(fetcher).finance.makeExpense(
      'junta-a',
      form,
      session.csrfToken,
    );

    const [path, options] = fetcher.mock.calls[0];
    expect(path).toBe('/api/v1/juntas/junta-a/finanzas/gastos');
    expect(options).toMatchObject({
      method: 'POST',
      body: form,
      credentials: 'same-origin',
    });
    const headers = new Headers(options?.headers);
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.get('X-CSRF-Token')).toBe(session.csrfToken);
  });

  it('descarga el comprobante como Blob desde el ámbito indicado', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('%PDF-ficticio', {
        headers: { 'Content-Type': 'application/pdf' },
      }),
    );
    const blob = await createApiClient(fetcher).finance.receipt(
      'junta-a',
      'pago-a',
    );

    expect(blob.type).toBe('application/pdf');
    await expect(blob.text()).resolves.toBe('%PDF-ficticio');
    expect(fetcher.mock.calls[0][0]).toBe(
      '/api/v1/juntas/junta-a/finanzas/pagos/pago-a/comprobante',
    );
  });
});
