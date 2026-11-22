# Sistema Multi-Junta

Sistema de Gestión Integral para Juntas Parroquiales y Comunitarias del Ecuador. El monorepositorio reúne la web, la API y PostgreSQL. La web muestra el estado de la API a través del proxy local de Vite. El Incremento 1B.1 separa las credenciales de PostgreSQL para el aprovisionamiento, las migraciones y la ejecución de la API.

## Inicio rápido

Esta es la ruta recomendada para **descargar el proyecto por primera vez** y quieren ver las cinco juntas de riego de Tungurahua con datos sintéticos. No necesita una base de datos compartida ni modificar el código. Cada compañero trabaja con **su propia base de demostración**.

> **Importante:** todo lo descrito aquí es **solo para localhost y uso académico**. Las contraseñas, RUC, cédulas, socios, multas, pagos, ubicaciones de parcelas y actividades son ficticios. Los nombres de las cinco juntas se basan en referencias públicas; no representan sus registros oficiales. No publiques este entorno ni uses los valores de ejemplo con datos reales.

### Requisitos previos

- **Git** para clonar el repositorio.
- **Docker Desktop** abierto y en modo **contenedores Linux**, con Docker Compose.
- **Node.js 24.15 o posterior de la línea 24, o Node.js 26**, con **npm 11 o posterior**. Se utiliza en el equipo para migraciones y preparación de datos; los servicios web y API corren en Docker.
- **Windows PowerShell** para copiar los comandos siguientes. En macOS/Linux, usa un terminal Bash y adapta `Copy-Item` a `cp`.

Verifica la instalación de Git, Node y Docker con `git --version`, `node --version`, `npm --version` y `docker compose version`.

### Primera ejecución, desde cero

**1. Descargar el proyecto y crear la configuración local.**

```powershell
git clone https://github.com/tiagz2520/sistema-multi-junta.git
cd sistema-multi-junta
Copy-Item .env.demo.example .env
```

El archivo `.env.demo.example` está preparado exclusivamente para esta demostración: utiliza la base `multi_junta_demo_tungurahua` y un ejemplo de contraseña **ficticia**. Si ya tienes un archivo `.env`, **no lo sobrescribas**; revísalo antes de continuar. El archivo `.env` no se sube a Git.

**2. Instalar dependencias del equipo y preparar PostgreSQL.**

```powershell
npm ci
docker compose -p multi-junta-grupo up -d --wait postgres
docker compose -p multi-junta-grupo run --rm --no-deps postgres-roles
```

Usamos el proyecto Compose `multi-junta-grupo` en todos los comandos, para identificar fácilmente **un solo entorno de presentación** en Docker Desktop. `postgres-roles` prepara los permisos de la base antes de aplicar las migraciones.

**3. Crear las tablas, compilar la API y cargar las cinco juntas.**

```powershell
npm exec --workspace @multi-junta/api -- prisma migrate deploy
npm run build -w @multi-junta/api
node --env-file=.env scripts/demo-operativo.mjs
```

Espera a que aparezcan los mensajes `Presentación completada` para las cinco juntas. El proceso crea cuentas, sectores, socios ficticios, actividades, tarifas, asistencias, multas, predios y vínculos del Portal del Socio. **No requiere ingresar socios ni usuarios manualmente** para comenzar la presentación.

**4. Iniciar la aplicación completa.**

```powershell
docker compose -p multi-junta-grupo up -d --build --wait
docker compose -p multi-junta-grupo ps
```

Abre **[http://127.0.0.1:5173](http://127.0.0.1:5173)**. El inicio de sesión debe hacerse desde esa dirección exacta, **no desde `localhost:5173`**. La API se puede comprobar en [http://127.0.0.1:3000/api/v1/health](http://127.0.0.1:3000/api/v1/health).

### Cuentas para la demostración

Todas las cuentas siguientes se crean con la contraseña local **`JuntaDemo#2026-Manual!`**, definida en `DEMO_PASSWORD` dentro de `.env`. Es una contraseña sintética para pruebas: **no reutilizar en producción ni con datos reales**. Si eliges otra contraseña antes de preparar los datos, usa esa misma al ingresar. Las contraseñas de cuentas ya existentes no se restablecen automáticamente.

| Junta de riego (referencia)            | Administrador                          | Secretaría                   | Tesorería                   | Socio                   |
| -------------------------------------- | -------------------------------------- | ---------------------------- | --------------------------- | ----------------------- |
| **Plataforma completa**                | `demo-plataforma` (Superadministrador) | —                            | —                           | —                       |
| **Acequia Mocha Huachi** · Cevallos    | `demo-rio-admin`                       | `demo-rio-secretaria`        | `demo-rio-tesoreria`        | `demo-rio-socio`        |
| **Quillán La Playa** · Ambato          | `demo-valle-admin`                     | `demo-valle-secretaria`      | `demo-valle-tesoreria`      | `demo-valle-socio`      |
| **Acequia Lalama** · Ambato            | `demo-lalama-admin`                    | `demo-lalama-secretaria`     | `demo-lalama-tesoreria`     | `demo-lalama-socio`     |
| **Loro Guachana El Molino** · Patate   | `demo-loro-admin`                      | `demo-loro-secretaria`       | `demo-loro-tesoreria`       | `demo-loro-socio`       |
| **Santa Rosa La Clementina** · Pelileo | `demo-clementina-admin`                | `demo-clementina-secretaria` | `demo-clementina-tesoreria` | `demo-clementina-socio` |

**Recorrido sugerido:** inicia con `demo-plataforma` para mostrar las cinco juntas; después usa `demo-rio-admin`, `demo-rio-secretaria` y `demo-rio-tesoreria` para recorrer el padrón, las asambleas y mingas, las convocatorias, multas y reportes. Finalmente entra como `demo-rio-socio` para mostrar el portal personal. Más detalles en la [guía de demostración](docs/guia-demostracion.md).

### Cómo volver a ejecutarlo después

Abre PowerShell en la carpeta del repositorio. No vuelvas a copiar `.env.demo.example` sobre tu configuración existente.

```powershell
git switch main
git pull --ff-only origin main
docker compose -p multi-junta-grupo up -d --build --wait
```

Para **detener** los servicios sin eliminar el volumen de la base de datos:

```powershell
docker compose -p multi-junta-grupo down
```

Para **volver a iniciarlos** sin reconstruir las imágenes:

```powershell
docker compose -p multi-junta-grupo up -d --wait
```

No ejecutes `docker compose down -v` ni borres volúmenes si quieres conservar los registros. La semilla es repetible; si necesitas ejecutarla de nuevo, usa `node --env-file=.env scripts/demo-operativo.mjs` después de tener PostgreSQL disponible. Tras cambios de esquema en futuras versiones, aplica las migraciones correspondientes antes de iniciar la API.

### Problemas frecuentes y soluciones

| Problema                                                  | Qué comprobar                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **«Origen de solicitud no autorizado» al iniciar sesión** | Abre la URL exacta de `AUTH_ORIGIN`: por defecto **`http://127.0.0.1:5173`**. `http://localhost:5173` es un origen distinto. Si cambiaste `AUTH_ORIGIN` en `.env`, vuelve a crear el contenedor `api` para que lea el nuevo valor.                                                                                                       |
| **Puerto ocupado** (`5173`, `3000` o `5433`)              | Antes del primer arranque, modifica `WEB_PORT`, `PORT` o `POSTGRES_PORT` en `.env`. Haz coincidir `AUTH_ORIGIN` con `WEB_PORT` y actualiza `APP_DATABASE_URL`, `MIGRATION_DATABASE_URL` y `DEMO_ADMIN_DATABASE_URL` si cambias `POSTGRES_PORT`. `API_PROXY_TARGET` apunta al puerto nuevo solo cuando se ejecuta la web fuera de Docker. |
| **La API no inicia / faltan tablas**                      | Comprueba que se ejecutaron `postgres-roles` y `prisma migrate deploy`. Revisa `docker compose -p multi-junta-grupo logs api postgres-roles`.                                                                                                                                                                                            |
| **No aparecen las juntas o las cuentas demo**             | Verifica que la base configurada sea `multi_junta_demo_…` y ejecuta `node --env-file=.env scripts/demo-operativo.mjs` tras compilar la API. No utilices la base normal `multi_junta` para cargar la demo.                                                                                                                                |
| **`npm.ps1` está bloqueado por PowerShell**               | Repite los comandos npm utilizando `npm.cmd` en lugar de `npm`.                                                                                                                                                                                                                                                                          |
| **La web no refleja los cambios**                         | Tras actualizar `main`, ejecuta `docker compose -p multi-junta-grupo up -d --build --wait web` y recarga el navegador con `Ctrl + Shift + R`.                                                                                                                                                                                            |

Los puertos del equipo se configuran **antes de crear los contenedores**; cambiar `POSTGRES_DB` o sus credenciales después de haber creado un volumen existente no renombra la base ni cambia automáticamente los usuarios de PostgreSQL. No borres el volumen para intentar corregir un error sin antes respaldar los datos.

Si se requiere trabajar en el código en lugar de presentar el sistema, consulta el apartado [Desarrollo sin contenedores para la web y la API](#desarrollo-sin-contenedores-para-la-web-y-la-api).

---

## Desarrollo con Docker Compose (sin datos de presentación)

Este es el entorno base para desarrollar con una **base vacía**, no la demostración precargada. Para mostrar las cinco juntas y acceder con usuarios preparados, sigue el [inicio rápido para compañeros](#inicio-rápido-para-compañeros).

Requiere Docker con contenedores Linux, Docker Compose, Node.js y npm. Desde la raíz, copia `.env.example` a `.env`, prepara PostgreSQL y ejecuta las migraciones **antes** de iniciar la API:

```powershell
Copy-Item .env.example .env
npm ci
docker compose up -d --wait postgres
docker compose run --rm --no-deps postgres-roles
npm exec --workspace @multi-junta/api -- prisma migrate deploy
docker compose up -d --build --wait
```

En Bash, usa `cp .env.example .env` para crear el archivo. Con la configuración de ejemplo, los servicios escuchan en `127.0.0.1`.

| Servicio          | Dirección local                       |
| ----------------- | ------------------------------------- |
| Web React         | `http://127.0.0.1:5173/`              |
| API NestJS        | `http://127.0.0.1:3000/api/v1/health` |
| API vía proxy web | `http://127.0.0.1:5173/api/v1/health` |
| PostgreSQL        | `127.0.0.1:5433`                      |

`GET /api/v1/health` devuelve HTTP `200` y `{"status":"ok"}` cuando la API responde. PostgreSQL tiene su propia comprobación en Compose. `docker compose logs -f api web` muestra los logs de las aplicaciones. `docker compose down` detiene el entorno y conserva el volumen de PostgreSQL.

Si un puerto está ocupado, ajusta `WEB_PORT`, `PORT` o `POSTGRES_PORT` en `.env`. Para ejecutar las aplicaciones en el equipo anfitrión, actualiza también la dirección correspondiente en `API_PROXY_TARGET`, `APP_DATABASE_URL` o `MIGRATION_DATABASE_URL`. Dentro de Compose, la web usa `api:3000` y la API usa `postgres:5432`.

## Credenciales de PostgreSQL

| Uso                                      | Rol                    | Configuración                                                                                                                                            |
| ---------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aprovisionamiento de la base y los roles | `POSTGRES_USER`        | `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB` del entorno local. Compose entrega esta credencial al servicio de aprovisionamiento.                |
| Prisma CLI y migraciones                 | `multi_junta_migrator` | `POSTGRES_MIGRATION_PASSWORD` aprovisiona la contraseña. `MIGRATION_DATABASE_URL` conecta Prisma CLI al esquema `multi_junta`.                           |
| Consultas de NestJS                      | `multi_junta_app`      | `POSTGRES_APP_PASSWORD` aprovisiona la contraseña. Compose pasa los parámetros `PG*` de este rol a la API. Desde el anfitrión se usa `APP_DATABASE_URL`. |

`postgres-roles` espera a PostgreSQL, aprovisiona los roles y el esquema, y debe terminar correctamente antes de que Compose arranque la API. El migrador es propietario de `multi_junta`. La API tiene `CONNECT` y `USAGE` sobre la base y el esquema, respectivamente. La migración de identidad activa RLS forzada en membresías y sesiones y reserva el acceso a las tablas de identidad. Las futuras migraciones deberán conceder permisos mínimos por objeto y aplicar las políticas RLS correspondientes antes de permitir acceso a datos operativos.

### Actualizar un volumen local del Incremento 1A

1. Conserva el nombre de proyecto de Compose y los valores originales de `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD`. Así se reutiliza el volumen y la credencial de aprovisionamiento correspondientes.
2. Incorpora a tu `.env` los dos valores `POSTGRES_*_PASSWORD` nuevos y las dos URLs de `.env.example`. Ajusta las URLs al puerto local. Usa contraseñas distintas y codifica sus caracteres reservados en las URLs. Retira `DATABASE_URL` del entorno de este proyecto.
3. Ejecuta `docker compose up --build --wait`. El aprovisionamiento también se ejecuta con un volumen existente. Conserva las tablas y datos de 1A en `public`, retira el acceso predeterminado de `PUBLIC` a ese esquema de la base dedicada y crea `multi_junta` para las migraciones futuras. `docker compose logs postgres-roles` muestra el resultado si el arranque falla.

## Desarrollo sin contenedores para la web y la API

Instala Node.js 24 LTS desde la versión 24.15 o Node.js 26 LTS, y npm 11 o posterior. Con `.env` en la raíz, puedes ejecutar PostgreSQL y el aprovisionamiento en Compose y las aplicaciones en el anfitrión.

```sh
docker compose up -d --wait postgres
docker compose run --rm --no-deps postgres-roles
npm ci
npm exec --workspace @multi-junta/api -- prisma migrate deploy
npm run dev
```

`npm run dev` inicia las dos aplicaciones en modo de desarrollo con recarga. Si PowerShell bloquea `npm.ps1`, utiliza `npm.cmd` en los mismos comandos. Prisma se genera al iniciar o compilar la API. Después de aprovisionar los roles, aplica las migraciones revisadas con `npm exec --workspace @multi-junta/api -- prisma migrate deploy`. Prisma CLI usa `MIGRATION_DATABASE_URL`. Este comando también se aplica sobre una base aprovisionada en 1B.1 y conserva los datos existentes. Para generar migraciones con `migrate dev` se necesitará una base sombra de desarrollo preparada por separado.

## Verificación

```sh
npm run format:check
npm run lint
npm run db:validate
npm test
npm run build
docker compose --env-file .env.example config --quiet
```

`npm test` ejecuta las pruebas del cliente HTTP y de la API. Con la web y la API en ejecución, `npm run test:smoke` verifica HTTP directo y el recorrido por el proxy. `npm run format` aplica Prettier y `npm run db:generate` vuelve a generar el cliente Prisma.

Con PostgreSQL aprovisionado, ejecuta `npm run build` y `npm run test:db` para verificar los privilegios efectivos de la cuenta de la API. Si usas todo el entorno en contenedores, ejecuta `docker compose exec -T api npm run test:db`. Ejecuta estas pruebas con datos sintéticos en un entorno de desarrollo.

`npm run test:db:identity` verifica restricciones y aislamiento con PostgreSQL real. Requiere una base de pruebas dedicada cuyo nombre empiece por `multi_junta_test_`, roles aprovisionados, las migraciones aplicadas y la API compilada. Exporta `APP_DATABASE_URL` con el rol operativo, `MIGRATION_DATABASE_URL` con el migrador e `IDENTITY_TEST_ADMIN_URL` con un superusuario exclusivo de la base de pruebas. Las tres URLs deben apuntar a la misma base. La suite usa contextos y datos sintéticos y revoca sus permisos temporales al finalizar. [Configuración de la suite en CI](.github/workflows/ci.yml)

`npm run test:db:auth` usa una base aislada con la misma configuración. Verifica los flujos HTTP, caducidad y revocación, el alcance por junta, CSRF y los permisos efectivos de las rutinas.

## Autenticación y sesión

Para actualizar desde 1B.2, ejecuta `docker compose run --rm --no-deps postgres-roles` y después aplica las migraciones con `npm exec --workspace @multi-junta/api -- prisma migrate deploy`. El aprovisionamiento crea `multi_junta_identity` como rol interno sin inicio de sesión. No hay una tercera credencial de conexión para NestJS.

Compila la API con `npm run build -w @multi-junta/api`. Para inicializar el primer Super Administrador, ejecuta `npm run auth:bootstrap` como operador con `MIGRATION_DATABASE_URL` y proporciona `BOOTSTRAP_SUPER_ADMIN_USERNAME` y `BOOTSTRAP_SUPER_ADMIN_PASSWORD` al entorno del proceso desde un canal seguro. Usa una contraseña de al menos 12 caracteres y hasta 256 bytes. Retira esas variables del entorno de operación al terminar. La ejecución repetida no crea otra cuenta. Si un nombre existente impide el alta, la transacción cancela también el evento de auditoría.

Configura `AUTH_ORIGIN` con el origen exacto del navegador. Por defecto apunta a `http://127.0.0.1:5173`. En producción utiliza HTTPS y sirve web y API en ese origen. `AUTH_IDLE_SECONDS` y `AUTH_ABSOLUTE_SECONDS` controlan los vencimientos y sus valores iniciales son 1800 y 43200 segundos respectivamente.

El inicio admite hasta 5 intentos por usuario y 60 por IP de conexión en ventanas de 15 minutos. Con un proxy inverso, las solicitudes pueden compartir el límite de la IP del proxy. Si el despliegue necesita un límite por IP de cliente, aplícalo también en el proxy que recibe el tráfico externo.

Para iniciar sesión, el cliente envía JSON con `usuario` y `contrasena` a `POST /api/v1/auth/iniciar-sesion` y la cabecera `X-CSRF-Token: inicio`. Usa las cookies para las llamadas posteriores y envía el `csrfToken` recibido como `X-CSRF-Token` en las mutaciones. `GET /api/v1/auth/sesion` recupera ese valor para la sesión vigente. Tras cambiar de contexto, usa la nueva cookie y el nuevo valor CSRF. Las solicitudes de navegador incluyen el `Origin` del despliegue. [Contratos de identidad](.kiro/specs/identidad-y-aislamiento/design.md#endpoints-rest)

## Estructura

- `apps/web/` contiene React, TypeScript, Vite y Tailwind CSS.
- `apps/api/` contiene NestJS, Prisma y los módulos de Plataforma, Administrativa, Financiera y Comunicaciones.
- `packages/api-client/` reserva el espacio para el cliente derivado del contrato OpenAPI.
- `tests/e2e/` contiene la prueba de comunicación y `ops/postgres/` contiene el aprovisionamiento de roles.
- `.kiro/specs/` contiene la especificación de identidad y aislamiento. [AGENTS.md](AGENTS.md) recoge las decisiones y reglas de desarrollo.

## Gestión de Plataforma y Juntas

Después de actualizar desde 1B.3, vuelve a ejecutar `docker compose run --rm --no-deps postgres-roles` y aplica las migraciones con `npm exec --workspace @multi-junta/api -- prisma migrate deploy`. Conserva el proyecto y volumen de Compose. La migración de 1C amplía la auditoría y concede a la API ejecución sobre rutinas de gestión acotadas.

Abre la web en `http://127.0.0.1:5173` y accede con la cuenta de plataforma inicializada. El panel permite registrar una junta, abrir su ficha y asignar un administrador nuevo. En el resultado del alta se muestra una contraseña temporal individual que el operador entrega por un canal privado. El administrador inicia sesión, establece su propia contraseña y selecciona su junta. Puede consultar y gestionar las membresías locales de su alcance y habilitar una vez la primera Secretaría.

`npm run test:db:platform` comprueba los contratos y privilegios del incremento con la misma base aislada de `test:db:auth`. Con las dos aplicaciones compiladas, instala el navegador mediante `npm exec -- playwright install --only-shell chromium` y ejecuta `npm run test:e2e:platform`, que inicia web y API locales con la base de pruebas y recorre el flujo desde un navegador real. [Especificación 1C](.kiro/specs/gestion-plataforma-juntas/requirements.md)

El alta ordinaria de miembros depende del padrón. La vinculación de cuentas existentes y la recuperación de credenciales permanecen pendientes.

## Núcleo operativo y financiero

Aplica las migraciones de PostgreSQL con el rol migrador después de ejecutar `postgres-roles`. El panel local ofrece opciones según la membresía de la sesión. Administración mantiene sectores y tarifas. Secretaría mantiene el padrón, actividades, asistencias, justificaciones y propiedades. Tesorería registra pagos, gastos, inventario y activos. Secretaría y Tesorería pueden generar multas a partir de faltas elegibles.

Configura la tarifa de cada actividad antes de generar multas. El sistema usa la fecha de la actividad en Ecuador y guarda el importe aplicado. Un pago de obligación debe cubrir su saldo completo. La aplicación emite el comprobante interno junto con el pago y conserva su número si se anula. Usa el respaldo de gasto y las fotos de propiedad en los tipos y tamaños admitidos por cada formulario. [Administración comunitaria](.kiro/specs/administracion-comunitaria/design.md) · [Finanzas y recursos](.kiro/specs/finanzas-recursos/design.md)

### Demostración local

Crea y aprovisiona una instancia aislada con una base cuyo nombre empiece por `multi_junta_demo_`. Aplica sus migraciones y compila la API. Configura `APP_DATABASE_URL` con el rol operativo de esa base, `DEMO_ADMIN_DATABASE_URL` con su cuenta administrativa de aprovisionamiento y `DEMO_PASSWORD` con una contraseña exclusivamente ficticia de al menos 12 caracteres. Ejecuta `npm run demo:operativo` desde la raíz. El proceso solo admite una base de demostración en loopback, rechaza producción y se puede repetir conservando los datos. La cuenta de ejecución de NestJS sigue siendo `multi_junta_app`.

La demostración utiliza cinco nombres de organizaciones de riego de Tungurahua como referencia: Acequia Mocha Huachi (Cevallos, clave `rio`), Quillán La Playa (`valle`), Acequia Lalama (`lalama`), Loro Guachana El Molino (`loro`) y Santa Rosa La Clementina (`clementina`). Para cada junta crea `demo-<clave>-admin`, `demo-<clave>-secretaria`, `demo-<clave>-tesoreria` y `demo-<clave>-socio`, además de conservar `demo-plataforma`. La contraseña de todas estas cuentas es la indicada en `DEMO_PASSWORD`; las cuentas de la demostración anterior no se reemplazan. El script añade socios, actividades de ambos tipos, obligaciones, predios y vínculos ilustrativos, y no duplica registros en ejecuciones posteriores. **Solo los nombres de las organizaciones son referencias reales; RUC, personas, sectores, parcelas, coordenadas, tarifas y movimientos son inventados y no representan información oficial.** Referencia de los nombres: [Gobierno Provincial de Tungurahua](https://www.tungurahua.gob.ec/entrega-de-los-planes-de-mejora-de-las-juntas-de-riego-fortalece-la-gestion-del-agua-en-tungurahua/).

### Verificación operativa

Corre `npm run test:db:operations` con las mismas URLs de la base aislada descrita para `test:db:auth`. Compila la web y utiliza `npm run test:e2e:operations` con Chromium de Playwright para recorrer el padrón, la minga, la justificación, la multa, el pago, el PDF y el inventario.

## Comunicaciones, Portal del Socio, Horarios y Reportes (Macroincremento 3)

Una vez integradas las migraciones del Portal, Comunicaciones y Horarios, vuelve a compilar e iniciar web y API. Estas capacidades se activan por ámbito y rol en el menú de la junta:

- **Secretaría** publica convocatorias asociadas a actividades, carga actas, resoluciones, acuerdos y oficios PDF, registra horarios y genera reportes administrativos.
- **Administrador** crea servicios semanales, gestiona invitaciones del padrón, intercambia mensajes privados con Socios y consulta sus reportes autorizados.
- **Socio** confirma un código de vinculación de un solo uso desde **Mi portal** y puede consultar su ficha propia, asistencias, obligaciones, pagos, comprobantes, convocatorias recibidas, mensajes y horarios de su sector.
- **Tesorería** consulta reportes financieros y patrimoniales y accede a convocatorias y documentos públicos internos autorizados.

La vinculación del padrón **no se deduce de la cédula**: el Administrador genera una invitación para una membresía Socio activa o una nueva cuenta, verifica al destinatario fuera del sistema y entrega el código por un canal privado. La membresía invitada confirma con su propia sesión. La revocación invalida su acceso. Las descargas verifican el contexto y la titularidad.

Los documentos y mensajes admiten únicamente PDF de hasta 2 MiB; las convocatorias se publican dentro de la aplicación, sin pasarelas externas. Los horarios tienen una franja semanal, un sector y una vigencia; se rechazan solapamientos. Los reportes aplican filtros y pueden descargarse en CSV o PDF. El resumen financiero excluye pagos y gastos anulados y distingue las obligaciones que requieren revisión.

Para validar estas capacidades con una base PostgreSQL **aislada** de pruebas, configura las mismas variables de la sección de integración y ejecuta:

```sh
npm run test:db:operations
npm run test:e2e:final
```

La suite nueva de integración se encuentra en `apps/api/test/final.integration.mjs`. La regresión completa incluye también `test:e2e:platform` y `test:e2e:operations`. Las pruebas con Chromium requieren instalar Playwright como se explica anteriormente.

Consulta la [guía de presentación](docs/guia-demostracion.md), la [arquitectura](docs/architecture/README.md), la [matriz RF y pruebas](docs/traceability/README.md) y las especificaciones [Comunicaciones](.kiro/specs/comunicaciones/requirements.md), [Portal](.kiro/specs/portal-socio/requirements.md) y [Horarios y Reportes](.kiro/specs/reportes-horarios/requirements.md).

**Limitaciones:** no se implementaron pagos parciales de obligaciones, reintegros automáticos, recuperación general de credenciales, cartografía comercial, facturación electrónica SRI ni mensajería externa. Los archivos y reportes son internos, y esta configuración no representa por sí sola un despliegue público endurecido.
