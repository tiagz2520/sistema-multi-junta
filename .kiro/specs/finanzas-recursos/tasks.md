# Tareas de finanzas y recursos

- [x] C0. Trazar fuentes, reglas monetarias y permisos. FR-01 a FR-07.
- [x] C1. Tarifas, ausencias elegibles, obligaciones y correcciones. FR-01, FR-07.
- [x] C2. Pagos, gastos, anulaciones y PDF interno correlativo. FR-02 a FR-04.
- [x] D1. Inventario, movimientos y activos fijos. FR-05.
- [x] D2. Propiedades, coordenadas y foto con autorización. FR-06.
- [x] E1. Pantallas, datos ficticios controlados y E2E integrado. FR-01 a FR-07.
- [x] E2. Verificar migraciones nuevas y de actualización, regresiones y concurrencia en local. FR-01 a FR-07.

La suite de Finanzas comprueba vigencia, concurrencia, correcciones y la instantánea del comprobante. La suite de Recursos comprueba existencias, bajas, referencias y autorización de foto. Chromium ejecuta el recorrido principal de multa, pago, PDF e inventario. La demostración conserva los registros al repetirla y rechaza producción. [Finanzas](../../../apps/api/test/finance.integration.mjs) · [Recursos](../../../apps/api/test/resources.integration.mjs) · [Chromium](../../../tests/e2e/macro2.test.mjs)
