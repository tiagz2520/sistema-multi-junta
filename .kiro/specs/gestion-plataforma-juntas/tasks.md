# Tareas de gestión de plataforma y juntas

- [x] 1. Registrar D-01 a D-03 y el contrato REST. Cobertura GP-01 a GP-07. Verificar trazabilidad con RF-01, RF-04, RF-05 y los CU 1, 3 y 4.
- [x] 2. Implementar migración, auditoría, permisos y rutinas. Depende de 1. Cobertura GP-01 a GP-07. Verificar credenciales PostgreSQL, alta nueva, actualización y concurrencia.
- [x] 3. Implementar controladores, credencial temporal y validación de servidor. Depende de 1 y 2. Cobertura GP-01 a GP-07. Probar sesiones de plataforma y locales, rechazo cruzado y CSRF.
- [x] 4. Implementar cliente y pantallas de sesión, plataforma y junta. Depende de 1. Cobertura GP-01 a GP-07. Probar estados y recorrido con API real.
- [x] 5. Verificar regresiones, auditoría y entorno Docker. Depende de 2 a 4. Ejecutar las suites automatizadas, compilación y el recorrido de aceptación.

## Evidencia

- GP-01 a GP-07: [integración de Plataforma con PostgreSQL](../../../apps/api/test/platform.integration.mjs).
- GP-01, GP-03, GP-05 a GP-07: [recorrido de plataforma y junta en navegador](../../../tests/e2e/platform.test.mjs).
