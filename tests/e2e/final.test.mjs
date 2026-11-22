import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
import {
  login,
  operationalFixture,
  responseData,
  serveApi,
} from '../helpers/operational-fixture.mjs';

const button = (page, name) => page.getByRole('button', { name, exact: true });
const label = (page, name) => page.getByLabel(name, { exact: true });

async function clickRequest(page, name, method, suffix, expected = 200) {
  const [reply] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname.endsWith(suffix) && response.request().method() === method
      );
    }),
    button(page, name).click(),
  ]);
  assert.equal(reply.status(), expected, await reply.text());
  return reply.headers()['content-type']?.includes('application/json')
    ? reply.json()
    : null;
}
async function enter(browser, origin, account, junta) {
  const page = await browser.newPage({ acceptDownloads: true });
  page.setDefaultTimeout(15000);
  await page.goto(origin);
  await label(page, 'Usuario').fill(account.usuario);
  await label(page, 'Contraseña').fill(account.contrasena);
  await clickRequest(page, 'Iniciar sesión', 'POST', '/auth/iniciar-sesion');
  await clickRequest(page, junta.nombre, 'POST', '/auth/contexto');
  return page;
}

test(
  'Macroincremento 3: portal, convocatorias, mensajes, horarios y reporte desde Chromium',
  { timeout: 135000 },
  async (t) => {
    const {
      juntas: [a],
    } = await operationalFixture(t);
    const backend = await serveApi(t);
    const adminApi = await login(backend, a.admin, a.id);
    const secretaryApi = await login(backend, a.secretaria, a.id);
    const base = `/juntas/${a.id}`;
    const sector = await responseData(
      await adminApi(base + '/administracion/sectores', 'POST', {
        nombre: 'Sector demostración',
        clasificacion: 'Riego comunitario',
      }),
      201,
    );
    const member = await responseData(
      await secretaryApi(base + '/administracion/socios', 'POST', {
        cedula:
          '18' +
          randomBytes(4)
            .readUInt32BE(0)
            .toString()
            .padStart(8, '0')
            .slice(0, 8),
        nombres: 'María',
        apellidos: 'SocioPrueba',
        sectorId: sector.id,
      }),
      201,
    );
    const activity = await responseData(
      await secretaryApi(base + '/administracion/actividades', 'POST', {
        tipo: 'ASAMBLEA',
        titulo: 'Asamblea general',
        inicio: '2026-12-20T13:00:00.000Z',
        fin: '2026-12-20T14:00:00.000Z',
        lugar: 'Casa comunal',
      }),
      201,
    );
    process.env.API_PROXY_TARGET = backend;
    const web = await preview({
      root: fileURLToPath(new URL('../../apps/web/', import.meta.url)),
      preview: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    t.after(() => web.close());
    const addr = web.httpServer.address();
    assert.ok(addr && typeof addr === 'object');
    const origin = 'http://127.0.0.1:' + addr.port;
    process.env.AUTH_ORIGIN = origin;
    const browser = await chromium.launch();
    t.after(() => browser.close());

    const admin = await enter(browser, origin, a.admin, a);
    await button(admin, 'Vincular socios').click();
    await button(admin, 'Nueva invitación').click();
    const inviteForm = admin;
    await inviteForm.locator('select[name="socioId"]').selectOption(member.id);
    await inviteForm.locator('select').nth(1).selectOption('existente');
    const memberships = await responseData(
      await adminApi(base + '/membresias'),
    );
    const memberAccount = memberships.find((m) => m.rol === 'SOCIO');
    assert.ok(memberAccount);
    await inviteForm
      .locator('select[name="membresiaId"]')
      .selectOption(memberAccount.id);
    await clickRequest(
      admin,
      'Crear invitación',
      'POST',
      '/portal/invitaciones',
      201,
    );
    const code = await admin.locator('.credential-value').first().textContent();
    assert.match(code?.trim() ?? '', /^[A-Za-z0-9_-]{43}$/);

    const socio = await enter(browser, origin, a.socio, a);
    await button(socio, 'Mi portal').click();
    const confirmation = socio;
    await label(confirmation, 'Código de invitación').fill(code.trim());
    await clickRequest(
      socio,
      'Confirmar vínculo',
      'POST',
      '/portal/confirmar',
      201,
    );
    await socio.getByText('María SocioPrueba').waitFor();
    assert.equal(await button(socio, 'Mi portal').count(), 1);

    const secretary = await enter(browser, origin, a.secretaria, a);
    await button(secretary, 'Convocatorias').click();
    await button(secretary, 'Nueva convocatoria').click();
    const section = secretary;
    await section
      .locator('select[name="actividadId"]')
      .selectOption(activity.id);
    await label(section, 'Asunto').fill('Convocatoria de la asamblea');
    await label(section, 'Contenido').fill(
      'Se invita a todos los miembros de la junta a asistir.',
    );
    await section
      .locator('label', { hasText: memberAccount.usuario })
      .locator('input[type=checkbox]')
      .check();
    await clickRequest(
      secretary,
      'Publicar convocatoria',
      'POST',
      '/comunicaciones/convocatorias',
      201,
    );
    await secretary.getByText('Convocatoria de la asamblea').first().waitFor();

    await button(admin, 'Mensajería').click();
    await admin
      .locator('select[name="destinatarioId"]')
      .selectOption(memberAccount.id);
    await label(admin, 'Mensaje').fill('Mensaje privado de prueba.');
    await clickRequest(
      admin,
      'Enviar mensaje',
      'POST',
      '/comunicaciones/mensajes',
      201,
    );
    await socio.reload();
    await button(socio, 'Mensajería').click();
    await socio.getByText('Mensaje privado de prueba.').waitFor();
    await button(socio, 'Convocatorias').click();
    await socio.getByText('Convocatoria de la asamblea').waitFor();

    await button(admin, 'Horarios').click();
    await label(admin, 'Nombre del servicio').fill('Distribución de agua');
    await clickRequest(
      admin,
      'Agregar servicio',
      'POST',
      '/horarios/servicios',
      201,
    );
    await button(secretary, 'Horarios').click();
    await button(secretary, 'Nuevo horario').click();
    const schedule = secretary;
    await schedule.locator('select[name="servicioId"]').selectOption({
      label: 'Distribución de agua',
    });
    await schedule.locator('select[name="sectorId"]').selectOption(sector.id);
    await schedule.locator('select[name="dia"]').selectOption('1');
    await label(schedule, 'Hora de inicio').fill('08:00');
    await label(schedule, 'Hora final').fill('09:30');
    await label(schedule, 'Vigente desde').fill('2026-12-01');
    await label(schedule, 'Vigente hasta').fill('2026-12-31');
    await clickRequest(secretary, 'Publicar horario', 'POST', '/horarios', 201);
    await button(socio, 'Horarios').click();
    await socio.getByText('Distribución de agua').waitFor();

    await button(secretary, 'Reportes').click();
    await secretary.getByText('María').first().waitFor();
    const [downloadInfo] = await Promise.all([
      secretary.waitForEvent('download'),
      button(secretary, 'Exportar CSV').click(),
    ]);
    assert.match(downloadInfo.suggestedFilename(), /reporte-padron\.csv/);
  },
);
