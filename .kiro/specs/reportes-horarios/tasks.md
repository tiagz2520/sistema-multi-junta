# Tareas de horarios y reportes

- [x] A3. Identificar permisos, contratos y trazabilidad RF-12 y RF-24.
- [x] D1. Servicios, horarios, solapamientos y proyección del sector. RH-01 y RH-02.
- [x] D2. Resultados filtrados, totales y exportación. RH-03 y RH-04.
- [x] D3. Interfaz, pruebas reales y alcance de exportaciones.

## Evidencias

- [Migración de Horarios](../../../apps/api/prisma/migrations/20261122033000_horarios/migration.sql) y [servicio](../../../apps/api/src/modules/schedules/schedule.service.ts).
- [Reportes parametrizados y exportación](../../../apps/api/src/modules/reports/reports.service.ts).
- [Interfaz de horarios](../../../apps/web/src/features/schedules/schedules-page.tsx), [interfaz de reportes](../../../apps/web/src/features/reports/reports-page.tsx).
- [Pruebas PostgreSQL de concurrencia, roles y exportación](../../../apps/api/test/final.integration.mjs); [Chromium](../../../tests/e2e/final.test.mjs).

Los exportes se limitan a 1000 filas por consulta y no constituyen contabilidad oficial. CSV protege contra fórmulas al abrirse en una hoja de cálculo. Los importes en revisión se distinguen de los vigentes. Los horarios publicados para Socios se restringen a su sector vinculado.
