# Decisión de arquitectura de identidad y aislamiento

**Estado** Aprobada para el Incremento 1B. Este registro fija las decisiones que guiarán la especificación en Kiro. La implementación funcional sigue pendiente.

## Decisiones aprobadas

1. El nombre de usuario se normaliza al registrarlo y al iniciar sesión. Su unicidad es global y la comparación ignora diferencias de mayúsculas y minúsculas.
2. Una cuenta puede pertenecer a varias juntas mediante membresías independientes. Cada membresía otorga acceso únicamente a su propia junta.
3. Una sesión de operación local tiene el contexto de una sola junta. El servidor valida la membresía activa de la cuenta para ese contexto. El Super Administrador opera en un ámbito de plataforma separado.
4. Una cuenta puede ser Administrador de la Junta en una sola junta a la vez. Puede conservar membresías con otros roles en otras juntas.
5. Cada membresía tiene un solo rol en el alcance inicial.
6. El Administrador de la Junta puede registrar al primer Secretario de su propia junta mediante un flujo excepcional y auditable. Esta decisión permite iniciar la operación y conserva la responsabilidad ordinaria de Secretaría sobre la nómina.
7. El primer Super Administrador se crea mediante una inicialización controlada de la plataforma.
8. Las sesiones se mantienen en el servidor y son revocables. El navegador recibe un identificador opaco mediante una cookie `HttpOnly`, `Secure` en HTTPS y con `SameSite`. Las operaciones que cambian estado requieren protección CSRF.

## Detalles para la especificación SDD

- Precisar la normalización y el formato admitido para nombres de usuario, los estados de membresía y el flujo para seleccionar o cambiar de junta.
- Diseñar las restricciones de datos, las transacciones y las políticas RLS que materializan el aislamiento. Incluir pruebas de acceso cruzado con cuentas de una y de varias juntas.
- Definir la caducidad y revocación de sesiones, la política `SameSite`, el mecanismo CSRF y el tratamiento de las sesiones al cambiar permisos o contexto.
- Detallar cómo se autorizan, ejecutan y registran los flujos de inicialización. Probar su repetición y concurrencia, y usar datos sintéticos en los escenarios.
