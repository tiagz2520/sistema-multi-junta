# Sistema Multi-Junta

Sistema de Gestión Integral para Juntas Parroquiales y Comunitarias del Ecuador. El Incremento 1A prepara la aplicación web, la API y PostgreSQL en un monorepositorio con npm workspaces. La web muestra el estado de la API a través del proxy local de Vite.

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

Si un puerto está ocupado, ajusta `WEB_PORT`, `PORT` o `POSTGRES_PORT` en `.env`. Para ejecutar las aplicaciones en el equipo anfitrión, actualiza también la dirección correspondiente en `API_PROXY_TARGET` o `DATABASE_URL`. Dentro de Compose, la web usa `api:3000` y la API usa `postgres:5432`.

## Desarrollo sin contenedores para la web y la API

Instala Node.js 24 LTS desde la versión 24.15 o Node.js 26 LTS, y npm 11 o posterior. Con `.env` en la raíz, usa PostgreSQL local o levanta solo el servicio de base de datos con `docker compose up -d --wait postgres`.

```sh
npm ci
npm run dev
```

`npm run dev` inicia las dos aplicaciones en modo de desarrollo con recarga. Si PowerShell bloquea `npm.ps1`, utiliza `npm.cmd` en los mismos comandos. Prisma se genera al iniciar o compilar la API. El esquema inicial solo configura el proveedor PostgreSQL.

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

## Estructura

- `apps/web/` contiene React, TypeScript, Vite y Tailwind CSS.
- `apps/api/` contiene NestJS, Prisma y los módulos de Plataforma, Administrativa, Financiera y Comunicaciones.
- `packages/api-client/` reserva el espacio para el cliente derivado del contrato OpenAPI.
- `tests/e2e/` contiene la prueba de comunicación y `ops/` reserva la documentación de operación.
- `.kiro/specs/` prepara la estructura SDD. [AGENTS.md](AGENTS.md) recoge las decisiones y reglas de desarrollo.

Las sesiones, la autorización, las políticas de aislamiento y las funcionalidades de negocio corresponden a incrementos posteriores.
