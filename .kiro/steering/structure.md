# Estructura del repositorio

```
sistema-multi-junta/
├── apps/
│   ├── api/                 NestJS + Prisma
│   │   ├── prisma/          schema.prisma y migraciones
│   │   ├── src/core/        salud, Prisma, contexto operativo y TenantUnitOfWork
│   │   ├── src/modules/     un directorio por módulo (ver abajo)
│   │   └── test/            pruebas de integración (*.integration.mjs)
│   └── web/                 React + Vite + Tailwind
│       └── src/
│           ├── app/         arranque y espacio de trabajo de la junta
│           ├── features/    una carpeta por capacidad
│           └── shared/      cliente HTTP, componentes y estilos comunes
├── packages/api-client/     cliente derivado del contrato OpenAPI (reservado)
├── tests/e2e/               pruebas de navegador con Playwright
├── ops/postgres/            aprovisionamiento de roles y esquema
├── scripts/                 datos de demostración
├── docs/                    arquitectura, trazabilidad y guía de demostración
├── .kiro/                   especificaciones SDD y steering
└── .github/workflows/       integración continua
```

## Módulos de la API (`apps/api/src/modules/`)

| Módulo           | Responsabilidad                                        |
| ---------------- | ------------------------------------------------------ |
| `platform`       | Identidad, sesiones, juntas y membresías               |
| `administration` | Sectores, padrón, actividades y asistencias            |
| `finance`        | Tarifas, multas, pagos, gastos y comprobantes          |
| `resources`      | Propiedades, fotografías, inventario y activos         |
| `communications` | Convocatorias, documentos, mensajes y Portal del Socio |
| `schedules`      | Horarios semanales por sector                          |
| `reports`        | Reportes administrativos y financieros (CSV y PDF)     |

## Convenciones de carpetas

- Cada módulo agrupa controlador, servicio e entradas validadas; el acceso a datos pasa siempre por `TenantUnitOfWork`.
- Las migraciones se nombran con marca de tiempo y capacidad, por ejemplo `20261122021000_administracion_comunitaria`.
- Cada capacidad tiene su carpeta en `.kiro/specs/` con `requirements.md`, `design.md` y `tasks.md`.
- La matriz que une requisito, especificación, implementación y prueba está en `docs/traceability/README.md`.
