import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import process from 'node:process';
import { hashPassword } from '../dist/modules/platform/identity/password.js';
import {
  login,
  operationalFixture,
  responseData,
  serveApi,
} from '../../../tests/helpers/operational-fixture.mjs';

test('Portal del Socio y Comunicaciones: titularidad, archivos y aislamiento reales', async (t) => {
  const {
    db,
    juntas: [a, b],
  } = await operationalFixture(t);
  const origin = await serveApi(t);
  const admin = await login(origin, a.admin, a.id);
  const sec = await login(origin, a.secretaria, a.id);
  const socio = await login(origin, a.socio, a.id);
  const foreign = await login(origin, b.socio, b.id);
  const foreignAdmin = await login(origin, b.admin, b.id);
  const prefix = `/juntas/${a.id}`;
  const portal = `${prefix}/portal`;
  const comm = `${prefix}/comunicaciones`;

  const newUser = 'segundo-' + randomBytes(5).toString('hex');
  const password = 'Clave-de-pruebas-' + randomUUID();
  const ownAccount = await db.cuenta.create({
    data: {
      nombreUsuarioNormalizado: newUser,
      hashContrasena: await hashPassword(password),
    },
  });
  const ownMembership = await db.membresia.create({
    data: { juntaId: a.id, cuentaId: ownAccount.id, rolCodigo: 'SOCIO' },
  });
  const second = await login(
    origin,
    { usuario: newUser, contrasena: password },
    a.id,
  );
  const member = await db.membresia.findFirstOrThrow({
    where: { juntaId: a.id, cuentaId: a.socio.cuentaId },
  });
  const adminMembership = await db.membresia.findFirstOrThrow({
    where: { juntaId: a.id, cuentaId: a.admin.cuentaId },
  });

  const sector = await responseData(
    await admin(`${prefix}/administracion/sectores`, 'POST', {
      nombre: 'Sector de prueba',
      clasificacion: 'Comunitario',
    }),
    201,
  );
  const cedula =
    '17' +
    randomBytes(4).readUInt32BE(0).toString().padStart(8, '0').slice(0, 8);
  const memberPerson = await responseData(
    await sec(`${prefix}/administracion/socios`, 'POST', {
      cedula,
      nombres: 'Socia',
      apellidos: 'Primera',
      sectorId: sector.id,
    }),
    201,
  );
  const person2 = await responseData(
    await sec(`${prefix}/administracion/socios`, 'POST', {
      cedula:
        '18' +
        randomBytes(4).readUInt32BE(0).toString().padStart(8, '0').slice(0, 8),
      nombres: 'Socio',
      apellidos: 'Segundo',
      sectorId: sector.id,
    }),
    201,
  );
  assert.notEqual(person2.id, memberPerson.id);

  await t.test(
    'requiere invitación autenticada y vincula únicamente al destinatario',
    async () => {
      assert.deepEqual(await responseData(await socio(portal + '/perfil')), {
        perfil: null,
      });
      assert.equal((await foreign(portal + '/perfil')).status, 403);
      assert.equal(
        (
          await foreignAdmin(portal + '/invitaciones', 'POST', {
            socioId: memberPerson.id,
            membresiaId: member.id,
          })
        ).status,
        403,
      );
      const invite = await responseData(
        await admin(portal + '/invitaciones', 'POST', {
          socioId: memberPerson.id,
          membresiaId: member.id,
        }),
        201,
      );
      assert.equal(invite.membresiaId, member.id);
      assert.match(invite.codigo, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(
        (await second(portal + '/confirmar', 'POST', { codigo: invite.codigo }))
          .status,
        404,
      );
      const activated = await responseData(
        await socio(portal + '/confirmar', 'POST', { codigo: invite.codigo }),
        201,
      );
      assert.equal(activated.estado, 'ACTIVO');
      assert.equal(activated.socioId, memberPerson.id);
      assert.equal(
        (await responseData(await socio(portal + '/perfil'))).perfil.id,
        memberPerson.id,
      );
      assert.deepEqual(await responseData(await second(portal + '/perfil')), {
        perfil: null,
      });
      assert.equal(
        (await socio(portal + '/confirmar', 'POST', { codigo: invite.codigo }))
          .status,
        404,
      );
      assert.equal(
        (await responseData(await admin(portal + '/vinculos')))[0].estado,
        'ACTIVO',
      );
    },
  );

  await t.test(
    'el comprobante personal no es accesible desde otra membresía',
    async () => {
      const treasury = await login(origin, a.tesoreria, a.id);
      const payment = await responseData(
        await treasury(prefix + '/finanzas/pagos', 'POST', {
          socioId: memberPerson.id,
          concepto: 'Aporte de prueba para el portal',
          monto: '12.00',
          fecha: '2026-11-22',
          metodo: 'EFECTIVO',
          solicitudId: randomUUID(),
        }),
        201,
      );
      const ownPayments = await responseData(await socio(portal + '/pagos'));
      assert.ok(ownPayments.some((row) => row.id === payment.id));
      const ownReceipt = await socio(
        portal + '/pagos/' + payment.id + '/comprobante',
      );
      assert.equal(ownReceipt.status, 200);
      assert.match(ownReceipt.headers.get('content-type'), /application\/pdf/);
      const otherReceipt = await second(
        portal + '/pagos/' + payment.id + '/comprobante',
      );
      assert.equal(otherReceipt.status, 404);
      assert.equal(
        (await responseData(await second(portal + '/pagos'))).length,
        0,
      );
    },
  );

  await t.test(
    'crear una cuenta Socio nueva exige cambio inicial y confirmación propia',
    async () => {
      const username = 'portal-' + randomBytes(6).toString('hex');
      const invite = await responseData(
        await admin(portal + '/invitaciones', 'POST', {
          socioId: person2.id,
          usuario: username,
        }),
        201,
      );
      assert.match(invite.codigo, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(typeof invite.contrasenaTemporal, 'string');
      const start = await globalThis.fetch(
        origin + '/api/v1/auth/iniciar-sesion',
        {
          method: 'POST',
          headers: {
            Origin: process.env.AUTH_ORIGIN,
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'inicio',
          },
          body: JSON.stringify({
            usuario: username,
            contrasena: invite.contrasenaTemporal,
          }),
        },
      );
      const session = await responseData(start);
      assert.equal(session.ambito, 'PREVIA');
      assert.equal(session.requiereCambioContrasena, true);
      const cookie = start.headers.get('set-cookie')?.split(';')[0];
      assert.ok(cookie);
      const changedPassword =
        'Clave nueva de prueba ' + randomBytes(12).toString('hex');
      const change = await globalThis.fetch(
        origin + '/api/v1/auth/cambiar-contrasena',
        {
          method: 'POST',
          headers: {
            Origin: process.env.AUTH_ORIGIN,
            Cookie: cookie,
            'Content-Type': 'application/json',
            'X-CSRF-Token': session.csrfToken,
          },
          body: JSON.stringify({
            contrasenaActual: invite.contrasenaTemporal,
            nuevaContrasena: changedPassword,
          }),
        },
      );
      assert.equal(change.status, 204);
      const newcomer = await login(
        origin,
        { usuario: username, contrasena: changedPassword },
        a.id,
      );
      const accepted = await responseData(
        await newcomer(portal + '/confirmar', 'POST', {
          codigo: invite.codigo,
        }),
        201,
      );
      assert.equal(accepted.socioId, person2.id);
      assert.equal(
        (await responseData(await newcomer(portal + '/perfil'))).perfil.id,
        person2.id,
      );
      assert.equal(
        (await responseData(await newcomer(portal + '/pagos'))).length,
        0,
      );
    },
  );

  await t.test(
    'mantiene mensajes y convocatorias privados dentro de la junta',
    async () => {
      const activity = await responseData(
        await sec(`${prefix}/administracion/actividades`, 'POST', {
          tipo: 'MINGA',
          titulo: 'Minga sintética',
          inicio: '2026-12-15T14:00:00.000Z',
          fin: '2026-12-15T16:00:00.000Z',
          lugar: 'Salón',
        }),
        201,
      );
      const call = await responseData(
        await sec(comm + '/convocatorias', 'POST', {
          actividadId: activity.id,
          asunto: 'Convocatoria de prueba',
          contenido: 'Se convoca a reunión.',
          destinatarios: [member.id, adminMembership.id],
        }),
        201,
      );
      assert.equal(call.destinatarios, 2);
      const visible = await responseData(await socio(comm + '/convocatorias'));
      assert.equal(visible.length, 1);
      assert.equal(
        (await responseData(await second(comm + '/convocatorias'))).length,
        0,
      );
      assert.equal((await foreign(comm + '/convocatorias')).status, 403);
      const pdf = await socio(comm + `/convocatorias/${call.id}/pdf`);
      assert.equal(pdf.status, 200);
      assert.match(pdf.headers.get('content-type'), /application\/pdf/);
      assert.equal(
        (await second(comm + `/convocatorias/${call.id}/pdf`)).status,
        404,
      );

      const message = await responseData(
        await socio(comm + '/mensajes', 'POST', {
          destinatarioId: adminMembership.id,
          texto: 'Consulta sintética',
        }),
        201,
      );
      assert.equal(message.destinatarioId, adminMembership.id);
      assert.equal(
        (await responseData(await admin(comm + '/mensajes'))).length,
        1,
      );
      assert.equal(
        (await responseData(await second(comm + '/mensajes'))).length,
        0,
      );
      assert.equal((await sec(comm + '/mensajes')).status, 403);
      assert.equal(
        (await second(comm + '/mensajes/' + message.id + '/archivo')).status,
        404,
      );
      const answer = await responseData(
        await admin(comm + '/mensajes', 'POST', {
          destinatarioId: member.id,
          texto: 'Respuesta sintética',
        }),
        201,
      );
      assert.equal(answer.destinatarioId, member.id);
      assert.equal(
        (await responseData(await socio(comm + '/mensajes'))).length,
        2,
      );
      assert.equal(
        (
          await admin(comm + '/mensajes', 'POST', {
            destinatarioId: ownMembership.id,
            texto: 'Socio de prueba',
          })
        ).status,
        201,
      );
    },
  );

  await t.test(
    'protege los documentos reservados y las descargas',
    async () => {
      const pdfBuffer = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<</Type/Catalog>>\nendobj\n%%EOF\n',
      );
      const body = new globalThis.FormData();
      body.set('tipo', 'ACTA');
      body.set('titulo', 'Acta de prueba');
      body.set('fecha', '2026-12-15');
      body.set('descripcion', 'Documento sintético');
      body.set(
        'archivo',
        new globalThis.Blob([pdfBuffer], { type: 'application/pdf' }),
        'acta.pdf',
      );
      const document = await responseData(
        await sec(comm + '/documentos', 'POST', body),
        201,
      );
      assert.equal(document.tipo, 'ACTA');
      assert.equal(
        (await socio(comm + `/documentos/${document.id}/archivo`)).status,
        200,
      );
      assert.equal(
        (await foreign(comm + `/documentos/${document.id}/archivo`)).status,
        403,
      );
      const officeForm = new globalThis.FormData();
      for (const [key, val] of Object.entries({
        tipo: 'OFICIO',
        titulo: 'Oficio prueba',
        fecha: '2026-12-15',
        descripcion: 'Oficio interno',
        institucion: 'Organización ficticia',
      }))
        officeForm.set(key, val);
      officeForm.set(
        'archivo',
        new globalThis.Blob([pdfBuffer], { type: 'application/pdf' }),
        'oficio.pdf',
      );
      const office = await responseData(
        await sec(comm + '/documentos', 'POST', officeForm),
        201,
      );
      assert.equal(
        (await socio(comm + `/documentos/${office.id}/archivo`)).status,
        404,
      );
      assert.equal(
        (await sec(comm + `/documentos/${office.id}/archivo`)).status,
        200,
      );
      await responseData(
        await sec(comm + `/documentos/${document.id}/archivar`, 'PATCH', {}),
      );
      assert.equal(
        (await socio(comm + `/documentos/${document.id}/archivo`)).status,
        404,
      );
    },
  );

  await t.test(
    'la revocación del vínculo invalida la sesión del Socio',
    async () => {
      const links = await responseData(await admin(portal + '/vinculos'));
      const current = links.find((link) => link.socioId === memberPerson.id);
      assert.ok(current);
      await responseData(
        await admin(portal + `/vinculos/${current.id}/revocar`, 'POST', {
          motivo: 'Verificación de revocación sintética',
        }),
        201,
      );
      assert.equal((await socio(portal + '/perfil')).status, 401);
      assert.deepEqual(await responseData(await second(portal + '/perfil')), {
        perfil: null,
      });
    },
  );
});

test('Horarios y reportes: filtros, solapamientos, roles y exportaciones', async (t) => {
  const {
    db,
    juntas: [a, b],
  } = await operationalFixture(t);
  const origin = await serveApi(t);
  const admin = await login(origin, a.admin, a.id);
  const sec = await login(origin, a.secretaria, a.id);
  const treasury = await login(origin, a.tesoreria, a.id);
  const socio = await login(origin, a.socio, a.id);
  const other = await login(origin, b.socio, b.id);
  const otherTreasury = await login(origin, b.tesoreria, b.id);
  const base = `/juntas/${a.id}`;
  const schedules = base + '/horarios';
  const reports = base + '/reportes';

  const sector = await responseData(
    await admin(base + '/administracion/sectores', 'POST', {
      nombre: 'Zona de riego',
      clasificacion: 'Agrícola',
    }),
    201,
  );
  const person = await responseData(
    await sec(base + '/administracion/socios', 'POST', {
      cedula:
        '19' +
        randomBytes(4).readUInt32BE(0).toString().padStart(8, '0').slice(0, 8),
      nombres: '=1+1',
      apellidos: 'Sintética',
      sectorId: sector.id,
    }),
    201,
  );
  const member = await db.membresia.findFirstOrThrow({
    where: { juntaId: a.id, cuentaId: a.socio.cuentaId },
  });
  const invitation = await responseData(
    await admin(base + '/portal/invitaciones', 'POST', {
      socioId: person.id,
      membresiaId: member.id,
    }),
    201,
  );
  await responseData(
    await socio(base + '/portal/confirmar', 'POST', {
      codigo: invitation.codigo,
    }),
    201,
  );

  await t.test(
    'valida programación concurrente y el sector propio del Socio',
    async () => {
      const service = await responseData(
        await admin(schedules + '/servicios', 'POST', {
          nombre: 'Agua potable',
        }),
        201,
      );
      const data = {
        servicioId: service.id,
        sectorId: sector.id,
        dia: 1,
        inicio: '08:00',
        fin: '10:00',
        desde: '2026-12-01',
        hasta: '2026-12-31',
      };
      const scheduled = await responseData(
        await sec(schedules, 'POST', data),
        201,
      );
      assert.equal(scheduled.estado, 'PUBLICADO');
      assert.equal((await responseData(await socio(schedules))).length, 1);
      assert.equal((await other(schedules)).status, 403);
      const overlapping = await Promise.all([
        sec(schedules, 'POST', { ...data, inicio: '09:00', fin: '10:30' }),
        sec(schedules, 'POST', { ...data, inicio: '09:30', fin: '10:45' }),
      ]);
      assert.deepEqual(
        overlapping.map((x) => x.status),
        [409, 409],
      );
      const adjacent = await responseData(
        await sec(schedules, 'POST', {
          ...data,
          inicio: '10:00',
          fin: '11:00',
        }),
        201,
      );
      assert.ok(adjacent.id !== scheduled.id);
      assert.equal((await responseData(await socio(schedules))).length, 2);
      const archived = await responseData(
        await sec(schedules + '/' + scheduled.id, 'PATCH', {
          estado: 'ARCHIVADO',
        }),
      );
      assert.equal(archived.estado, 'ARCHIVADO');
      assert.equal((await responseData(await socio(schedules))).length, 1);
      assert.equal((await treasury(schedules)).status, 403);
    },
  );

  await t.test(
    'permite reportes propios y bloquea exportaciones ajenas',
    async () => {
      const padron = await responseData(await admin(reports + '/padron'));
      assert.equal(padron.filas.length, 1);
      assert.equal(padron.filas[0].cedula, person.cedula);
      assert.equal((await sec(reports + '/pagos')).status, 403);
      assert.equal((await otherTreasury(reports + '/pagos')).status, 403);
      const finance = await responseData(
        await treasury(reports + '/resumen-financiero'),
      );
      assert.equal(finance.resumen.ingresos, '0.00');
      assert.equal(finance.resumen.gastos, '0.00');
      const csv = await admin(reports + '/padron/exportar?formato=csv');
      assert.equal(csv.status, 200);
      assert.match(csv.headers.get('content-type'), /text\/csv/);
      assert.ok((await csv.text()).includes(`"'=1+1"`));
      const pdf = await admin(reports + '/padron/exportar?formato=pdf');
      assert.equal(pdf.status, 200);
      assert.match(pdf.headers.get('content-type'), /application\/pdf/);
      assert.equal((await other(reports + '/padron')).status, 403);
      assert.equal((await sec(reports + '/padron?desconocido=1')).status, 400);
      assert.equal((await sec(reports + '/asistencia?desde=mal')).status, 400);
    },
  );
});
