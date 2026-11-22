# Arquitectura y decisiones técnicas

El Sistema Multi-Junta utiliza un **monolito modular**: una web React 18/TypeScript/Vite, un cliente HTTP tipado, una API REST NestJS, Prisma y PostgreSQL 18. Docker Compose crea el entorno reproducible. El código y la matriz SDD se conservan en el mismo monorepositorio.

## Componentes

| Área                   | Ruta principal                         | Responsabilidad                                                            |
| ---------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| Identidad y Plataforma | `apps/api/src/modules/platform/`       | Cuentas, Argon2id, sesión opaca, cambio de junta, administración de juntas |
| Administración         | `apps/api/src/modules/administration/` | Socios, sectores, asambleas, mingas y asistencia                           |
| Finanzas               | `apps/api/src/modules/finance/`        | Tarifas, obligaciones, pagos, comprobantes y gastos                        |
| Recursos               | `apps/api/src/modules/resources/`      | Inventario, activos fijos y propiedades                                    |
| Comunicaciones         | `apps/api/src/modules/communications/` | Convocatorias, documentos, mensajes y vinculación del portal               |
| Horarios               | `apps/api/src/modules/schedules/`      | Servicios, franjas y vigencia semanal                                      |
| Reportes               | `apps/api/src/modules/reports/`        | Consultas filtradas, balances de gestión y PDF/CSV                         |
| Web                    | `apps/web/src/`                        | Vistas por rol, formularios, navegación y descargas                        |
| Contrato HTTP          | `packages/api-client/src/`             | Cliente tipado, cookie SameSite y cabecera CSRF                            |

## Fronteras de seguridad

1. El navegador **no** conserva tokens de sesión en almacenamiento local. El servidor emite una cookie HttpOnly/SameSite con Secure bajo HTTPS, y valida origen y CSRF en mutaciones.
2. La sesión opaca se valida del lado PostgreSQL. La API determina la junta y el rol desde ella; nunca confía exclusivamente en el UUID recibido en la URL.
3. Las tablas operativas utilizan una FK de junta y **FORCE ROW LEVEL SECURITY**. La conexión `multi_junta_app` no es superusuario y no posee `BYPASSRLS`. El migrador opera con una credencial independiente.
4. Las rutinas privilegiadas de identidad tienen propietario `multi_junta_identity` (`NOLOGIN`), alcance acotado, `search_path` fijo y `EXECUTE` revocado a `PUBLIC`.
5. El contexto `app.junta_id` y la huella de la sesión operativa se establecen dentro de una transacción Prisma; las escrituras bloquean la autoridad antes de modificar registros.
6. El Portal del Socio utiliza `socio_vinculo`, token de invitación hasheado, confirmación por la membresía destinataria y acceso propio con RLS, sin vincular automáticamente por cédula.
7. Los documentos, mensajes y comprobantes se consultan mediante el mismo contexto autenticado y políticas de titularidad. Nunca se exponen archivos públicos.
8. Los importes se almacenan como NUMERIC exacto y sus proyecciones se entregan como cadenas. El correlativo de comprobantes se asigna en la transacción del pago.

## Migraciones y pruebas

Las migraciones que completan el producto son `20261122031000_portal_socio`, `20261122032000_comunicaciones` y `20261122033000_horarios`. Los reportes son consultas parametrizadas sobre entidades existentes y no requieren tablas materializadas.

La SDD de referencia se conserva en `.kiro/specs/`. El archivo [trazabilidad](../traceability/README.md) enlaza requisitos originales, módulos y pruebas. La [guía de demostración](../guia-demostracion.md) detalla los recorridos y sus límites.

No se deben usar las claves de `.env.example` fuera de un entorno local. Para producción faltan los controles operacionales del despliegue (TLS, gestión de secretos, respaldo, monitoreo y límites del proxy), que deben verificarse en la infraestructura elegida.
