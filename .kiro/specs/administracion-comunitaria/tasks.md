# Tareas de administración comunitaria

- [x] A0. Trazar RF-02 y RF-07 a RF-09 con CU 2 y CU 5–7. Criterios AC-01 a AC-05.
- [x] A1. Migraciones y contratos de sectores y padrón. Probar unicidad local, referencias y baja lógica. AC-01, AC-02, AC-05.
- [x] A2. Pantallas de sectores, búsqueda, listado y ficha de socios. AC-01, AC-02.
- [x] B1. Actividades, participantes, cierre y registro de asistencia. AC-03, AC-04.
- [x] B2. Justificaciones y correcciones, con historial y enlace financiero. AC-04.
- [x] B3. Pantallas, pruebas API y recorrido Chromium. AC-01 a AC-05.

El contexto operativo, la migración y las pruebas HTTP de A/B se verificaron en una base aislada actualizada desde 1C. El recorrido en Chromium registra socios, asigna sectores, cierra una minga y confirma que la justificación excluye la ausencia del cobro. [Pruebas de administración](../../../apps/api/test/administration.integration.mjs) · [Recorrido integrado](../../../tests/e2e/macro2.test.mjs)
