import assert from 'node:assert/strict';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
import {
  operationalFixture,
  serveApi,
} from '../helpers/operational-fixture.mjs';

const button = (page, name) => page.getByRole('button', { name, exact: true });
const label = (page, name) => page.getByLabel(name, { exact: true });
const select = (page, name) => page.locator(`select[name="${name}"]`);
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guayaquil',
  dateStyle: 'short',
});

async function clickRequest(page, name, method, suffix, status = 200) {
  const [reply] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/') &&
        new URL(response.url()).pathname.endsWith(suffix) &&
        response.request().method() === method,
    ),
    button(page, name).click(),
  ]);
  const data = await reply.json();
  assert.equal(reply.status(), status, JSON.stringify(data));
  return data;
}

async function enter(browser, origin, credentials, junta) {
  const page = await browser.newPage({ acceptDownloads: true });
  page.setDefaultTimeout(14_000);
  await page.goto(origin);
  await label(page, 'Usuario').fill(credentials.usuario);
  await label(page, 'Contraseña').fill(credentials.contrasena);
  await clickRequest(page, 'Iniciar sesión', 'POST', '/auth/iniciar-sesion');
  await clickRequest(page, junta.nombre, 'POST', '/auth/contexto');
  return page;
}

async function registerMember(page, sectorId, cedula, nombres) {
  await button(page, 'Socios').click();
  await button(page, 'Nuevo socio').click();
  const form = page.getByRole('region', { name: 'Nuevo socio' });
  await label(form, 'Cédula').fill(cedula);
  await label(form, 'Nombres').fill(nombres);
  await label(form, 'Apellidos').fill('Prueba');
  await select(form, 'sectorId').selectOption(sectorId);
  const member = await clickRequest(
    page,
    'Registrar socio',
    'POST',
    '/administracion/socios',
    201,
  );
  await page
    .getByRole('heading', { name: nombres + ' Prueba', exact: true })
    .waitFor();
  await page.getByRole('button', { name: /Volver al padrón/ }).click();
  return member;
}

test(
  'la operación comunitaria llega de la nómina al pago y PDF desde Chromium',
  { timeout: 110_000 },
  async (t) => {
    const {
      juntas: [a, b],
    } = await operationalFixture(t);
    const api = await serveApi(t);
    process.env.API_PROXY_TARGET = api;
    const web = await preview({
      root: fileURLToPath(new URL('../../apps/web/', import.meta.url)),
      preview: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    t.after(() => web.close());
    const address = web.httpServer.address();
    assert.ok(address && typeof address === 'object');
    const origin = 'http://127.0.0.1:' + address.port;
    process.env.AUTH_ORIGIN = origin;
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const today = day.format(new Date());
    const admin = await enter(browser, origin, a.admin, a);
    await button(admin, 'Sectores').click();
    await button(admin, 'Nuevo sector').click();
    await label(admin, 'Nombre del sector').fill('Sector de prueba');
    await label(admin, 'Clasificación').fill('Comunitario');
    const sector = await clickRequest(
      admin,
      'Registrar sector',
      'POST',
      '/administracion/sectores',
      201,
    );
    await button(admin, 'Tarifas').click();
    await button(admin, 'Nueva tarifa').click();
    await select(admin, 'tipo').selectOption('MINGA');
    await label(admin, 'Monto').fill('12.50');
    await label(admin, 'Vigente desde').fill(today);
    await clickRequest(
      admin,
      'Registrar tarifa',
      'POST',
      '/finanzas/tarifas',
      201,
    );

    const secretary = await enter(browser, origin, a.secretaria, a);
    const justified = await registerMember(
      secretary,
      sector.id,
      '0000000001',
      'Socio Justificado',
    );
    const owing = await registerMember(
      secretary,
      sector.id,
      '0000000002',
      'Socio Obligación',
    );
    await button(secretary, 'Actividades').click();
    await button(secretary, 'Nueva actividad').click();
    await select(secretary, 'tipo').selectOption('MINGA');
    await label(secretary, 'Título').fill('Minga sintética');
    await label(secretary, 'Inicio').fill(today + 'T08:00');
    await label(secretary, 'Fin').fill(today + 'T12:00');
    await label(secretary, 'Lugar').fill('Salón de prueba');
    const activity = await clickRequest(
      secretary,
      'Registrar actividad',
      'POST',
      '/administracion/actividades',
      201,
    );
    for (const name of [justified, owing]) {
      const participant = secretary.getByRole('row', {
        name: new RegExp(name.nombres),
      });
      await button(participant, 'Gestionar asistencia').click();
      await select(secretary, 'estado').selectOption('AUSENTE');
      await clickRequest(
        secretary,
        'Guardar asistencia',
        'PUT',
        '/asistencias/' + name.id,
      );
    }
    await button(
      secretary.getByRole('row', { name: /Socio Justificado/ }),
      'Gestionar asistencia',
    ).click();
    const attendance = '/asistencias/' + justified.id + '/justificaciones';
    await label(secretary, 'Motivo de justificación').fill(
      'Respaldo sintético',
    );
    const justification = await clickRequest(
      secretary,
      'Registrar justificación',
      'POST',
      attendance,
      201,
    );
    await select(secretary, 'decision').selectOption('ACEPTADA');
    await label(secretary, 'Motivo de decisión').fill('Revisión sintética');
    await clickRequest(
      secretary,
      'Resolver justificación',
      'PATCH',
      attendance + '/' + justification.id,
    );
    await button(secretary, 'Cerrar actividad').click();
    await clickRequest(
      secretary,
      'Confirmar cierre',
      'POST',
      '/actividades/' + activity.id + '/cerrar',
    );
    assert.equal(await button(secretary, 'Pagos').count(), 0);

    const treasury = await enter(browser, origin, a.tesoreria, a);
    await button(treasury, 'Multas').click();
    await button(treasury, 'Generar multas').click();
    await treasury.getByRole('combobox').selectOption(activity.id);
    const checks = treasury.getByRole('checkbox');
    await checks.first().waitFor();
    assert.equal(await checks.count(), 1);
    await treasury.getByRole('checkbox', { name: /Socio Obligación/ }).check();
    const generated = await clickRequest(
      treasury,
      'Confirmar multas',
      'POST',
      '/finanzas/multas',
      201,
    );
    assert.equal(generated.length, 1);
    await button(treasury, 'Pagos').click();
    await button(treasury, 'Registrar pago').click();
    const paymentForm = treasury.getByRole('region', {
      name: 'Registrar pago',
    });
    await paymentForm.getByRole('combobox').first().selectOption('multa');
    await paymentForm
      .getByRole('combobox')
      .nth(1)
      .selectOption(generated[0].id);
    const paid = await clickRequest(
      treasury,
      'Confirmar pago',
      'POST',
      '/finanzas/pagos',
      201,
    );
    assert.equal(paid.monto, '12.50');
    const [download] = await Promise.all([
      treasury.waitForEvent('download'),
      button(treasury, 'Descargar PDF').click(),
    ]);
    assert.match(download.suggestedFilename(), /comprobante-\d+\.pdf/);
    assert.equal(await download.failure(), null);
    assert.equal(
      await treasury.evaluate(
        async (id) =>
          (await globalThis.fetch(`/api/v1/juntas/${id}/finanzas/pagos`))
            .status,
        b.id,
      ),
      403,
    );

    await button(treasury, 'Inventario').click();
    await button(treasury, 'Nuevo artículo').click();
    await label(treasury, 'Nombre del artículo').fill('Insumo sintético');
    await label(treasury, 'Categoría').fill('Consumible');
    await label(treasury, 'Unidad').fill('unidad');
    const article = await clickRequest(
      treasury,
      'Registrar artículo',
      'POST',
      '/recursos/inventario',
      201,
    );
    await button(treasury, 'Registrar movimiento').click();
    await select(treasury, 'tipo').selectOption('ENTRADA');
    await label(treasury, 'Cantidad').fill('3');
    await label(treasury, 'Motivo').fill('Recepción sintética');
    const movement = await clickRequest(
      treasury,
      'Confirmar movimiento',
      'POST',
      '/inventario/' + article.id + '/movimientos',
      201,
    );
    assert.equal(movement.stockResultante, '3.000');
  },
);
