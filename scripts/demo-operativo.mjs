import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { createApplication } from '../apps/api/dist/app.js';
import { PrismaClient } from '../apps/api/dist/generated/prisma/client.js';
import {
  hashPassword,
  isNewPasswordValid,
} from '../apps/api/dist/modules/platform/identity/password.js';

const host = '127.0.0.1';
const origin = `http://${host}`;
const runtimeRole = 'multi_junta_app';
const marker = 'DEMO_OPERATIVO_INICIALIZADO';
const presentationMarker = 'DEMO_TUNGURAHUA_PRESENTACION_V1';
const roles = {
  admin: 'ADMIN_JUNTA',
  secretaria: 'SECRETARIA',
  tesoreria: 'TESORERIA',
  socio: 'SOCIO',
};
// Organizaciones reales según Gobierno Provincial de Tungurahua.
// Son nombres de referencia: cuentas, RUC, finanzas y socios son SIEMPRE sintéticos.
// https://www.tungurahua.gob.ec/entrega-de-los-planes-de-mejora-de-las-juntas-de-riego-fortalece-la-gestion-del-agua-en-tungurahua/
const examples = [
  {
    key: 'rio',
    nombre: 'Junta de Riego de la Acequia Mocha Huachi (DEMO)',
    previousName: 'Junta Demo Río Claro',
    zona: 'Cevallos',
    lat: '-1.350000',
    lng: '-78.620000',
    tipo: 'RIEGO',
    ruc: '0000000000001',
    activityType: 'ASAMBLEA',
  },
  {
    key: 'valle',
    nombre: 'Junta de Riego Quillán La Playa (DEMO)',
    previousName: 'Junta Demo Valle Verde',
    zona: 'Ambato',
    lat: '-1.240000',
    lng: '-78.620000',
    tipo: 'RIEGO',
    ruc: '0000000000002',
    activityType: 'MINGA',
  },
  {
    key: 'lalama',
    nombre: 'Junta de Riego Acequia Lalama (DEMO)',
    zona: 'Ambato',
    lat: '-1.250000',
    lng: '-78.610000',
    tipo: 'RIEGO',
    ruc: '0000000000003',
    activityType: 'ASAMBLEA',
  },
  {
    key: 'loro',
    nombre: 'Junta de Riego Loro Guachana El Molino (DEMO)',
    zona: 'Patate',
    lat: '-1.310000',
    lng: '-78.490000',
    tipo: 'RIEGO',
    ruc: '0000000000004',
    activityType: 'MINGA',
  },
  {
    key: 'clementina',
    nombre: 'Junta de Riego Santa Rosa La Clementina (DEMO)',
    zona: 'Pelileo',
    lat: '-1.330000',
    lng: '-78.540000',
    tipo: 'RIEGO',
    ruc: '0000000000005',
    activityType: 'ASAMBLEA',
  },
];

class DemoError extends Error {}

function demoId(key) {
  const hex = createHash('sha256')
    .update(`sistema-multi-junta:demo-operativo:${key}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function databaseUrl(variable) {
  let url;
  let user;
  try {
    url = new URL(process.env[variable]);
    user = decodeURIComponent(url.username);
  } catch {
    throw new DemoError(
      `Configura ${variable} con la URL PostgreSQL de la demo.`,
    );
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !user ||
    !url.password ||
    url.hash ||
    !/^\/multi_junta_demo_[a-z0-9_]+$/.test(url.pathname) ||
    url.searchParams.getAll('schema').length > 1 ||
    [...url.searchParams].some(
      ([key, value]) => key !== 'schema' || value !== 'multi_junta',
    )
  ) {
    throw new DemoError(
      `${variable} debe apuntar a una base multi_junta_demo_… en loopback y solo admite schema=multi_junta.`,
    );
  }
  return {
    user,
    database: url.pathname.slice(1),
    destination: `${url.hostname}:${url.port || 5432}${url.pathname}`,
    connectionString: url.toString(),
  };
}

function connect({ connectionString }) {
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString, max: 1 },
      { schema: 'multi_junta' },
    ),
  });
}

async function verifyConnection(client, info, privileged) {
  const [actual] = await client.$queryRaw`
    SELECT current_database() AS db, current_user::text AS role, session_user::text AS login,
      rolsuper AS superuser, rolbypassrls AS bypass
    FROM pg_catalog.pg_roles WHERE rolname = current_user
  `;
  if (
    !actual ||
    actual.db !== info.database ||
    actual.role !== info.user ||
    actual.login !== info.user ||
    actual.superuser !== privileged ||
    (!privileged && actual.bypass)
  ) {
    throw new DemoError(
      'La conexión real de PostgreSQL no coincide con la base y el rol esperados de la demo.',
    );
  }
}

function username(example, role) {
  return `demo-${example.key}-${role}`;
}

async function ensureAccount(tx, name, passwordHash, platformRole = null) {
  const id = demoId(name);
  const prior = await tx.cuenta.findUnique({
    where: { nombreUsuarioNormalizado: name },
  });
  if (
    prior &&
    (prior.id !== id ||
      prior.rolPlataformaCodigo !== platformRole ||
      prior.estado !== 'ACTIVA' ||
      prior.requiereCambioContrasena)
  ) {
    throw new DemoError(
      `La cuenta ${name} ya existe con otra configuración. Se conserva como está.`,
    );
  }
  if (!prior)
    await tx.cuenta.create({
      data: {
        id,
        nombreUsuarioNormalizado: name,
        hashContrasena: passwordHash,
        rolPlataformaCodigo: platformRole,
      },
    });
  return id;
}

async function prepareIdentity(admin, password) {
  const platformName = 'demo-plataforma';
  const anchor = demoId(platformName);
  const existing = await admin.auditoriaIdentidad.findMany({
    where: { cuentaId: anchor, evento: marker },
    select: { juntaId: true },
  });
  const pending = examples
    .map((example) => ({ ...example, id: demoId(`junta:${example.key}`) }))
    .filter(
      (example) => !existing.some(({ juntaId }) => juntaId === example.id),
    );
  if (pending.length === 0) return { anchor, pending };

  const names = [
    platformName,
    ...pending.flatMap((example) =>
      Object.keys(roles).map((role) => username(example, role)),
    ),
  ];
  const hashes = new Map();
  for (const name of names) hashes.set(name, await hashPassword(password));
  await admin.$transaction(async (tx) => {
    await ensureAccount(
      tx,
      platformName,
      hashes.get(platformName),
      'SUPER_ADMIN',
    );
    for (const example of pending) {
      const prior = await tx.junta.findUnique({ where: { id: example.id } });
      if (prior?.estado === 'INACTIVA')
        throw new DemoError(
          `La junta demo ${example.key} está inactiva. Se conserva su estado.`,
        );
      if (!prior) {
        await tx.junta.create({
          data: {
            id: example.id,
            nombre: example.nombre,
            tipo: example.tipo,
            ruc: example.ruc,
          },
        });
      }
      for (const [suffix, role] of Object.entries(roles)) {
        const name = username(example, suffix);
        const cuentaId = await ensureAccount(tx, name, hashes.get(name));
        const ids = { juntaId: example.id, cuentaId };
        const member = await tx.membresia.findUnique({
          where: { juntaId_cuentaId: ids },
        });
        if (
          member &&
          (member.rolCodigo !== role || member.estado !== 'ACTIVA')
        ) {
          throw new DemoError(
            `La membresía ${username(example, suffix)} ya existe con otro acceso. Se conserva como está.`,
          );
        }
        if (!member)
          await tx.membresia.create({ data: { ...ids, rolCodigo: role } });
      }
    }
  });
  return { anchor, pending };
}

async function synchronizeDemoNames(admin) {
  for (const example of examples) {
    const id = demoId(`junta:${example.key}`);
    const existing = await admin.junta.findUnique({ where: { id } });
    if (!existing || existing.ruc !== example.ruc)
      throw new DemoError(
        'Una junta de demostración no coincide con su identificador y RUC ficticio.',
      );
    if (existing.nombre === example.nombre && existing.tipo === example.tipo)
      continue;
    // Solo permite renombrar los dos registros sintéticos de la demo anterior.
    if (existing.nombre !== example.previousName)
      throw new DemoError(
        `La junta ${example.key} fue modificada manualmente; se conserva su nombre.`,
      );
    await admin.junta.update({
      where: { id },
      data: { nombre: example.nombre, tipo: example.tipo },
    });
  }
}

function makeRequest(base) {
  return async (
    path,
    { method = 'GET', session, csrf = session?.csrf, payload } = {},
  ) => {
    const headers = { origin };
    if (session) headers.cookie = session.cookie;
    if (csrf) headers['x-csrf-token'] = csrf;
    if (payload !== undefined) headers['content-type'] = 'application/json';
    const response = await globalThis.fetch(new URL(`/api/v1${path}`, base), {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: globalThis.AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new DemoError(
        `${method} ${path} respondió HTTP ${response.status}. Los datos existentes se conservan.`,
      );
    return response;
  };
}

async function readSession(response) {
  const view = await response.json();
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('multi_junta_sesion='));
  if (!cookie || view.requiereCambioContrasena)
    throw new DemoError('La cuenta demo no pudo abrir una sesión operativa.');
  return { cookie: cookie.split(';', 1)[0], csrf: view.csrfToken };
}

async function login(request, user, password, juntaId) {
  const initial = await readSession(
    await request('/auth/iniciar-sesion', {
      method: 'POST',
      csrf: 'inicio',
      payload: { usuario: user, contrasena: password },
    }),
  );
  try {
    return await readSession(
      await request('/auth/contexto', {
        method: 'POST',
        session: initial,
        payload: { juntaId },
      }),
    );
  } catch (error) {
    await request('/auth/cerrar-sesion', {
      method: 'POST',
      session: initial,
    }).catch(() => undefined);
    throw error;
  }
}

async function ensure(getList, submit, matches, payload) {
  return (await getList()).find(matches) ?? (await submit(payload));
}

function apiFor(request, example, session) {
  const prefix = `/juntas/${example.id}`;
  const send = async (path, method, payload) =>
    (await request(`${prefix}/${path}`, { method, session, payload })).json();
  return {
    read: (path) => send(path, 'GET'),
    add: (path, payload) => send(path, 'POST', payload),
    mark: (path, payload) => send(path, 'PUT', payload),
    response: (path) => request(`${prefix}/${path}`, { session }),
  };
}

async function seedActivity(admin, secretary, example, socios, demoDay) {
  const activityPath = 'administracion/actividades';
  const title = `Actividad demo ${example.key}`;
  let activity = (await secretary.read(activityPath)).find(
    ({ titulo }) => titulo === title,
  );
  const day = activity?.inicio.slice(0, 10) ?? demoDay;
  const tarifs = await admin.read('finanzas/tarifas');
  if (
    !tarifs.some(
      ({ tipo, vigenteDesde }) =>
        tipo === example.activityType && vigenteDesde <= day,
    )
  ) {
    await admin.add('finanzas/tarifas', {
      tipo: example.activityType,
      vigenteDesde: day,
      monto: '4.50',
    });
  }
  if (!activity) {
    activity = await secretary.add(activityPath, {
      tipo: example.activityType,
      titulo: title,
      lugar: 'Sede comunitaria demo',
      inicio: `${day}T09:00:00-05:00`,
      fin: `${day}T11:00:00-05:00`,
    });
  }

  const detailPath = `${activityPath}/${activity.id}`;
  const detail = await secretary.read(detailPath);
  const absent = detail.participantes.find(
    ({ socioId }) => socioId === socios[0].id,
  );
  if (!absent)
    throw new DemoError(
      `La actividad demo ${example.key} ya existe sin el participante demo esperado.`,
    );
  for (const participant of detail.participantes) {
    if (participant.estado === null) {
      await secretary.mark(`${detailPath}/asistencias/${participant.socioId}`, {
        estado: participant.id === absent.id ? 'AUSENTE' : 'PRESENTE',
      });
    }
  }
  if (detail.estado === 'ABIERTA') await secretary.add(`${detailPath}/cerrar`);
  return { activity, absent, day };
}

async function seedPayment(treasury, example, { activity, absent, day }) {
  const fines = await treasury.read('finanzas/multas');
  let obligation = fines.find(({ asistenciaId }) => asistenciaId === absent.id);
  if (!obligation) {
    const candidates = await treasury.read(
      `finanzas/multas/candidatas?actividadId=${activity.id}`,
    );
    if (
      !candidates.some(
        ({ asistenciaId, tarifaId }) => asistenciaId === absent.id && tarifaId,
      )
    ) {
      throw new DemoError(
        `La ausencia demo ${example.key} ya no es multable. Se conserva la asistencia actual.`,
      );
    }
    [obligation] = await treasury.add('finanzas/multas', {
      actividadId: activity.id,
      asistenciaIds: [absent.id],
    });
  }
  const payments = await treasury.read('finanzas/pagos');
  const payment =
    payments.find(({ obligacionId }) => obligacionId === obligation.id) ??
    (await treasury.add('finanzas/pagos', {
      obligacionId: obligation.id,
      monto: obligation.monto,
      fecha: day,
      metodo: 'Efectivo demo',
      solicitudId: demoId(`pago:${example.key}`),
    }));
  const receipt = await treasury.response(
    `finanzas/pagos/${payment.id}/comprobante`,
  );
  const bytes = Buffer.from(await receipt.arrayBuffer());
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-')
    throw new DemoError('El comprobante demo no se pudo verificar.');
}

async function seedResources(treasury, secretary, example, sector, socio, day) {
  const inventory = 'recursos/inventario';
  const inventoryName = `Insumo demo ${example.key}`;
  const article = await ensure(
    () => treasury.read(inventory),
    (body) => treasury.add(inventory, body),
    ({ nombre }) => nombre === inventoryName,
    {
      nombre: inventoryName,
      categoria: 'Materiales',
      unidad: 'unidad',
      costoUnitario: '2.50',
    },
  );
  const movements = `${inventory}/${article.id}/movimientos`;
  const stockReason = `Carga inicial demo ${example.key}`;
  await ensure(
    () => treasury.read(movements),
    (body) => treasury.add(movements, body),
    ({ motivo }) => motivo === stockReason,
    { tipo: 'ENTRADA', cantidad: '12', motivo: stockReason },
  );
  const assetCode = `DEMO-${example.key.toUpperCase()}`;
  await ensure(
    () => treasury.read('recursos/activos'),
    (body) => treasury.add('recursos/activos', body),
    ({ codigo }) => codigo === assetCode,
    {
      codigo: assetCode,
      nombre: `Equipo demo ${example.key}`,
      descripcion: 'Equipo sintético de muestra',
      ubicacion: 'Bodega demo',
      fechaAdquisicion: day,
      valor: '42.10',
      vidaUtil: 5,
      documento: 'REF-DEMO',
    },
  );
  const propertyName = `Predio demo ${example.key}`;
  await ensure(
    () => secretary.read('recursos/propiedades'),
    (body) => secretary.add('recursos/propiedades', body),
    ({ nombre }) => nombre === propertyName,
    {
      nombre: propertyName,
      socioId: socio.id,
      sectorId: sector.id,
      dimensiones: '12 × 20 m',
      latitud: '-0.200000',
      longitud: '-78.000000',
    },
  );
}

async function seedJunta(request, example, password, demoDay) {
  const sessions = [];
  try {
    for (const role of ['admin', 'secretaria', 'tesoreria']) {
      sessions.push(
        await login(request, username(example, role), password, example.id),
      );
    }
    const [admin, secretary, treasury] = sessions.map((session) =>
      apiFor(request, example, session),
    );
    const sectorName = `Sector demo ${example.key}`;
    const sector = await ensure(
      () => admin.read('administracion/sectores'),
      (body) => admin.add('administracion/sectores', body),
      ({ nombre }) => nombre === sectorName,
      { nombre: sectorName, clasificacion: 'Comunitario' },
    );
    const socios = [];
    for (const [cedula, apellidos] of [
      ['0000000001', 'Registro Uno'],
      ['0000000002', 'Registro Dos'],
    ]) {
      socios.push(
        await ensure(
          () => secretary.read(`administracion/socios?q=${cedula}`),
          (body) => secretary.add('administracion/socios', body),
          ({ cedula: current }) => current === cedula,
          {
            cedula,
            nombres: 'Socio sintético demo',
            apellidos,
            sectorId: sector.id,
          },
        ),
      );
    }
    const context = await seedActivity(
      admin,
      secretary,
      example,
      socios,
      demoDay,
    );
    await seedPayment(treasury, example, context);
    await seedResources(
      treasury,
      secretary,
      example,
      sector,
      socios[0],
      context.day,
    );
  } finally {
    await Promise.allSettled(
      sessions.map((session) =>
        request('/auth/cerrar-sesion', { method: 'POST', session }),
      ),
    );
  }
}

const presentationProfiles = [
  ['0000000101', 'Daniela', 'Viteri Cobo'],
  ['0000000102', 'Mateo', 'Lema Paredes'],
  ['0000000103', 'Valeria', 'Naranjo Sánchez'],
  ['0000000104', 'Jorge', 'Quishpe Andrade'],
  ['0000000105', 'Camila', 'Guevara Torres'],
  ['0000000106', 'Andrés', 'Moposita Ruiz'],
];

function shiftDay(day, amount) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

// Complementos para la presentación: nombres y cédulas de personas inventados,
// zonas y coordenadas de parcelas referenciales, nunca padrones oficiales.
async function enrichPresentation(request, example, password, demoDay) {
  const sessions = [];
  try {
    for (const role of ['admin', 'secretaria', 'tesoreria', 'socio']) {
      sessions.push(
        await login(request, username(example, role), password, example.id),
      );
    }
    const [admin, secretary, treasury] = sessions
      .slice(0, 3)
      .map((session) => apiFor(request, example, session));

    const sectorName = `Sector referencial ${example.key}`;
    const sector = await ensure(
      () => admin.read('administracion/sectores'),
      (body) => admin.add('administracion/sectores', body),
      ({ nombre }) => nombre === sectorName,
      { nombre: sectorName, clasificacion: 'Comunitario' },
    );
    const socios = [];
    for (const [cedula, nombres, apellidos] of presentationProfiles) {
      socios.push(
        await ensure(
          () => secretary.read(`administracion/socios?q=${cedula}`),
          (body) => secretary.add('administracion/socios', body),
          (row) => row.cedula === cedula,
          { cedula, nombres, apellidos, sectorId: sector.id },
        ),
      );
    }

    // Tarifas vigentes desde hoy: la aplicación no permite crear tarifas retroactivas.
    const pastDate = shiftDay(demoDay, -1);
    for (const tipo of ['ASAMBLEA', 'MINGA']) {
      await ensure(
        () => admin.read('finanzas/tarifas'),
        (body) => admin.add('finanzas/tarifas', body),
        (row) => row.tipo === tipo && row.vigenteDesde === pastDate,
        {
          tipo,
          vigenteDesde: pastDate,
          monto: tipo === 'ASAMBLEA' ? '3.75' : '4.25',
        },
      );
    }

    const activityPath = 'administracion/actividades';
    const templates = [
      {
        tipo: 'ASAMBLEA',
        titulo: `Asamblea de rendición de cuentas (muestra ${example.key})`,
        day: pastDate,
        hour: '06:00:00',
        end: '07:00:00',
        closed: true,
        absent: true,
      },
      {
        tipo: 'MINGA',
        titulo: `Minga de revisión de canales (muestra ${example.key})`,
        day: pastDate,
        hour: '07:30:00',
        end: '09:00:00',
        closed: true,
        absent: false,
      },
      {
        tipo: 'ASAMBLEA',
        titulo: `Asamblea de planificación de turnos (muestra ${example.key})`,
        day: shiftDay(demoDay, 4),
        hour: '16:00:00',
        end: '18:00:00',
        closed: false,
      },
      {
        tipo: 'MINGA',
        titulo: `Minga de mantenimiento comunitario (muestra ${example.key})`,
        day: shiftDay(demoDay, 6),
        hour: '08:00:00',
        end: '12:00:00',
        closed: false,
      },
    ];
    for (const template of templates) {
      const activity = await ensure(
        () => secretary.read(activityPath),
        (body) => secretary.add(activityPath, body),
        (row) => row.titulo === template.titulo,
        {
          tipo: template.tipo,
          titulo: template.titulo,
          inicio: `${template.day}T${template.hour}-05:00`,
          fin: `${template.day}T${template.end}-05:00`,
          lugar: `Sede referencial de ${example.zona} (demo)`,
        },
      );
      if (!template.closed) continue;
      const detailPath = `${activityPath}/${activity.id}`;
      const details = await secretary.read(detailPath);
      const absentee = details.participantes.find(
        (row) => row.socioId === socios[0].id,
      );
      for (const participant of details.participantes) {
        if (participant.estado !== null) continue;
        await secretary.mark(
          `${detailPath}/asistencias/${participant.socioId}`,
          {
            estado:
              template.absent && participant.socioId === socios[0].id
                ? 'AUSENTE'
                : 'PRESENTE',
          },
        );
      }
      if (details.estado === 'ABIERTA')
        await secretary.add(`${detailPath}/cerrar`);
      if (template.absent && absentee) {
        const existing = await treasury.read('finanzas/multas');
        if (!existing.some((row) => row.asistenciaId === absentee.id)) {
          const candidates = await treasury.read(
            `finanzas/multas/candidatas?actividadId=${activity.id}`,
          );
          if (
            !candidates.some(
              (row) => row.asistenciaId === absentee.id && row.tarifaId,
            )
          )
            throw new DemoError(
              'La multa ilustrativa no tiene tarifa o asistencia elegible.',
            );
          await treasury.add('finanzas/multas', {
            actividadId: activity.id,
            asistenciaIds: [absentee.id],
          });
        }
      }
    }

    for (const [index, socio] of socios.entries()) {
      if (index >= 3) break;
      const name = `Parcela ilustrativa ${index + 1} · ${example.zona} (DEMO)`;
      await ensure(
        () => secretary.read('recursos/propiedades'),
        (body) => secretary.add('recursos/propiedades', body),
        (row) => row.nombre === name,
        {
          nombre: name,
          socioId: socio.id,
          sectorId: sector.id,
          dimensiones: `${120 + index * 30} × ${80 + index * 20} m`,
          latitud: (Number(example.lat) + index * 0.0004).toFixed(6),
          longitud: (Number(example.lng) + index * 0.0004).toFixed(6),
        },
      );
    }

    // La cuenta existente de SOCIO queda vinculada a una persona inventada.
    // Si ya fue vinculada manualmente, se respeta ese vínculo.
    const member = (await admin.read('membresias?offset=0')).find(
      (row) => row.usuario === username(example, 'socio'),
    );
    const links = await admin.read('portal/vinculos');
    if (
      member &&
      !links.some(
        (row) =>
          (row.membresiaId === member.id || row.socioId === socios[0].id) &&
          (row.estado === 'ACTIVO' || row.estado === 'PENDIENTE'),
      )
    ) {
      const invitation = await admin.add('portal/invitaciones', {
        membresiaId: member.id,
        socioId: socios[0].id,
      });
      await request(`/juntas/${example.id}/portal/confirmar`, {
        method: 'POST',
        session: sessions[3],
        payload: { codigo: invitation.codigo },
      });
    }
  } finally {
    await Promise.allSettled(
      sessions.map((session) =>
        request('/auth/cerrar-sesion', { method: 'POST', session }),
      ),
    );
  }
}

async function main() {
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production')
    throw new DemoError('La demostración está deshabilitada en producción.');
  const password = process.env.DEMO_PASSWORD;
  if (!isNewPasswordValid(password))
    throw new DemoError(
      'Configura DEMO_PASSWORD con una contraseña sintética de al menos 12 caracteres.',
    );
  const adminInfo = databaseUrl('DEMO_ADMIN_DATABASE_URL');
  const runtimeInfo = databaseUrl('APP_DATABASE_URL');
  if (
    adminInfo.destination !== runtimeInfo.destination ||
    runtimeInfo.user !== runtimeRole ||
    adminInfo.user === runtimeRole
  ) {
    throw new DemoError(
      'Las URL deben apuntar a la misma base demo y usar credenciales administrativas y de ejecución separadas.',
    );
  }

  const admin = connect(adminInfo);
  const runtime = connect(runtimeInfo);
  try {
    await Promise.all([
      verifyConnection(admin, adminInfo, true),
      verifyConnection(runtime, runtimeInfo, false),
    ]);
    const [{ locked, tomorrow }] = await admin.$queryRaw`
      SELECT pg_try_advisory_lock(hashtext(current_database()), hashtext('demo-operativo')) AS locked,
             ((statement_timestamp() AT TIME ZONE 'America/Guayaquil')::date + 1)::text AS tomorrow
    `;
    if (!locked)
      throw new DemoError(
        'Ya se está preparando una demostración en esta base.',
      );
    const { anchor, pending } = await prepareIdentity(admin, password);
    await synchronizeDemoNames(admin);
    const completed = await admin.auditoriaIdentidad.findMany({
      where: { cuentaId: anchor, evento: presentationMarker },
      select: { juntaId: true },
    });
    const presentationPending = examples
      .map((example) => ({ ...example, id: demoId(`junta:${example.key}`) }))
      .filter(
        (example) => !completed.some((row) => row.juntaId === example.id),
      );
    if (!pending.length && !presentationPending.length) {
      process.stdout.write(
        `La demostración de Tungurahua en ${runtimeInfo.database} ya está preparada.\n`,
      );
      return;
    }
    process.env.AUTH_ORIGIN = origin;
    const app = await createApplication({ logger: false });
    try {
      await app.listen(0, host);
      const request = makeRequest(await app.getUrl());
      for (const example of pending) {
        await seedJunta(request, example, password, tomorrow);
        await admin.auditoriaIdentidad.create({
          data: { cuentaId: anchor, juntaId: example.id, evento: marker },
        });
        process.stdout.write(`Preparada ${example.nombre}.\n`);
      }
      for (const example of presentationPending) {
        await enrichPresentation(request, example, password, tomorrow);
        await admin.auditoriaIdentidad.create({
          data: {
            cuentaId: anchor,
            juntaId: example.id,
            evento: presentationMarker,
          },
        });
        process.stdout.write(`Presentación completada: ${example.nombre}.\n`);
      }
    } finally {
      await app.close();
    }
  } finally {
    await Promise.allSettled([admin.$disconnect(), runtime.$disconnect()]);
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof DemoError ? error.message : 'No se pudo preparar la demostración. Revisa la base dedicada y sus migraciones.'}\n`,
  );
  process.exitCode = 1;
}
