# Sistema Multi-Junta

Sistema de Gestión Integral para Juntas Parroquiales y Comunitarias del Ecuador. El monorepositorio reúne la web, la API y PostgreSQL. La web muestra el estado de la API a través del proxy local de Vite. El Incremento 1B.1 separa las credenciales de PostgreSQL para el aprovisionamiento, las migraciones y la ejecución de la API.

## Desarrollo con Docker Compose

Requiere Docker con contenedores Linux y Docker Compose. Desde la raíz, copia `.env.example` a `.env`. Los valores son desechables y están destinados al entorno local.

```powershell
Copy-Item .env.example .env
docker compose up --build --wait
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
