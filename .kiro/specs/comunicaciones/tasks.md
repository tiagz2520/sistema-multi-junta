# Tareas de comunicaciones

- [x] A1. Trazar RF-25, RF-26, RF-29 y RF-33 con los CU originales.
- [x] B1. Convocatoria, destinatarios y PDF interno. CO-01 y CO-05.
- [x] B2. Archivo autorizado de actas, resoluciones, acuerdos y oficios. CO-02, CO-03 y CO-05.
- [x] B3. Mensajería privada, auditoría y pruebas negativas. CO-04 y CO-05.
- [x] B4. Pantallas y recorrido de publicación y mensaje real.

## Evidencias

- [Migración de Comunicaciones](../../../apps/api/prisma/migrations/20261122032000_comunicaciones/migration.sql) — tablas con FKs por junta, RLS forzada y auditoría.
- [API](../../../apps/api/src/modules/communications/communications.controller.ts) y [cliente tipado](../../../packages/api-client/src/final.ts).
- [Pantallas](../../../apps/web/src/features/communications/communications-page.tsx).
- [Pruebas negativas con dos juntas y dos socios](../../../apps/api/test/final.integration.mjs) y [recorrido Chromium](../../../tests/e2e/final.test.mjs).

Los adjuntos PDF se almacenan y sirven con autorización. No se envían mensajes externos por correo, SMS o WhatsApp. Los documentos internos no son equivalentes a documentos tributarios.
