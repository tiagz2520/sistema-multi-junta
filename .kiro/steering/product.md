# Producto: Sistema Multi-Junta

## Propósito

Plataforma multitenant para la gestión integral de juntas de riego, parroquiales y comunitarias del Ecuador. Cada junta es un tenant independiente: sus socios, actividades, finanzas, recursos y comunicaciones no son visibles para otra junta.

## Actores y roles

- **Superadministrador de plataforma:** registra juntas y asigna su primer administrador. No opera los datos internos de una junta.
- **Administrador de junta:** configura sectores y tarifas, gestiona membresías, invitaciones, servicios semanales y mensajes con socios.
- **Secretaría:** mantiene el padrón, actividades, asistencias, justificaciones y propiedades; publica convocatorias y documentos.
- **Tesorería:** registra pagos, gastos, inventario y activos; consulta reportes financieros.
- **Socio:** consulta únicamente su información propia desde el Portal del Socio.

## Capacidades (una especificación SDD por cada una)

| Capacidad                  | Especificación en `.kiro/specs/` |
| -------------------------- | -------------------------------- |
| Identidad y aislamiento    | `identidad-y-aislamiento`        |
| Plataforma y juntas        | `gestion-plataforma-juntas`      |
| Administración comunitaria | `administracion-comunitaria`     |
| Finanzas y recursos        | `finanzas-recursos`              |
| Comunicaciones             | `comunicaciones`                 |
| Portal del Socio           | `portal-socio`                   |
| Reportes y horarios        | `reportes-horarios`              |

## Reglas de producto

- Los comprobantes son documentos internos; no hay facturación electrónica SRI.
- Un pago de obligación cubre su saldo completo; no hay pagos parciales.
- La vinculación de un Socio con el padrón no se deduce de la cédula: la autoriza el Administrador con un código de un solo uso.
- Los documentos y mensajes admiten solo PDF de hasta 2 MiB.
- Los datos de ejemplo son sintéticos. Solo los nombres de las organizaciones de la demostración provienen de referencias públicas.

## Fuera de alcance

Pagos parciales, reintegros automáticos, recuperación general de credenciales, cartografía comercial, facturación electrónica SRI, mensajería externa y despliegue público endurecido.
