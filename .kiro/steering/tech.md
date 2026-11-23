# Tecnología

## Stack

- **Monorepositorio** con npm workspaces y un archivo de bloqueo en la raíz.
- **Frontend:** React, TypeScript, Vite y Tailwind CSS (`apps/web`).
- **Backend:** NestJS y TypeScript con API REST bajo `/api/v1` (`apps/api`).
- **Base de datos:** PostgreSQL con Prisma y migraciones versionadas.
- **Entorno local:** Docker Compose (PostgreSQL, API y web). Node.js 24 LTS o 26 LTS y npm 11 o posterior.

## Convenciones

- Monolito modular con propiedad de datos por módulo. Los módulos se integran mediante interfaces de servicio explícitas.
- Los controladores gestionan HTTP; los casos de uso gobiernan las reglas y las transacciones.
- Formato con Prettier y análisis con ESLint sin advertencias (`--max-warnings 0`).
- Datos sintéticos en código y pruebas. Los valores locales desechables viven en `.env.example`; las credenciales reales quedan fuera del repositorio.
- Trabajo en ramas de tarea; los commits y la publicación requieren aprobación.

## Seguridad obligatoria

- El contexto de junta se resuelve en el servidor a partir de una sesión y una membresía activas. Los identificadores del navegador son solo entradas.
- Toda tabla operativa tiene `junta_id`, claves foráneas que impiden relaciones entre juntas y RLS forzada con denegación sin contexto.
- La API usa un rol sin `BYPASSRLS`; las migraciones usan otro rol distinto.
- Sesiones revocables en el servidor, cookies `HttpOnly`, protección CSRF, caducidad y contraseñas con Argon2id.
- Cada ruta privada declara su guarda de sesión, su ámbito y la lista explícita de roles.
- Archivos, búsquedas, exportaciones y descargas aplican el ámbito de junta y la titularidad.

## Estrategia de pruebas

| Nivel                       | Comando                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Formato y análisis estático | `npm run format:check`, `npm run lint`                                                          |
| Esquema Prisma              | `npm run db:validate`                                                                           |
| Unitarias (API y web)       | `npm test`                                                                                      |
| Integración con PostgreSQL  | `npm run test:db`, `test:db:identity`, `test:db:auth`, `test:db:platform`, `test:db:operations` |
| Navegador (Playwright)      | `npm run test:e2e:platform`, `test:e2e:operations`, `test:e2e:final`                            |
| Compilación                 | `npm run build`                                                                                 |

Las pruebas de integración y de navegador usan una base aislada cuyo nombre empieza por `multi_junta_test_`. Incluyen pruebas negativas con dos juntas y con dos socios de una misma junta. El flujo `ci.yml` ejecuta esta secuencia en cada solicitud de integración.
