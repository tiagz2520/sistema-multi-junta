# Tareas del portal del socio

- [x] A2. Trazar RF-05, RF-32 y CU 4 y 21.
- [x] C1. Alta Socio con invitación y confirmación autenticada. PS-01 y PS-04.
- [x] C2. Revocación, auditoría y RLS por titularidad. PS-02 y PS-04.
- [x] C3. Pantallas de vinculación y portal. PS-01 a PS-04.
- [x] C4. Pruebas con dos socios de la misma junta y otra organización. PS-02 a PS-04.
- [x] C5. Predios y fotos propios con FORCE RLS, vista Google Maps consentida y pruebas de bajas y aislamiento. PS-05.

## Evidencias

- [Migración de Portal y vínculo](../../../apps/api/prisma/migrations/20261122031000_portal_socio/migration.sql).
- [Operaciones de vínculo y consulta](../../../apps/api/src/modules/communications/portal.service.ts), [API REST](../../../apps/api/src/modules/communications/portal.controller.ts).
- [Pantallas administrativas y personales](../../../apps/web/src/features/portal/portal-page.tsx).
- [Pruebas de identidad, titularidad y revocación](../../../apps/api/test/final.integration.mjs) y [Chromium](../../../tests/e2e/final.test.mjs).

El vínculo se confirma solamente desde la cuenta Socio autenticada con un código opaco temporal. El padrón sigue separado de la cuenta. No se implementa recuperación de cuenta ni reasignación sin autorización; el operador entrega las credenciales e invitaciones por un canal privado.
