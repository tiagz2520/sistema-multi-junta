# Tareas de identidad y aislamiento

**Estado** Arquitectura general y corte de persistencia de 1B.2 aprobados. Cada criterio remite a [requirements.md](requirements.md) y cada decisión técnica a [design.md](design.md). Las especificaciones funcionales del padrón, la configuración de junta y la mensajería conservan su propio alcance.

## Corte autorizado de 1B.2

1B.2 comprueba el aislamiento de persistencia con contextos sintéticos controlados. El contexto RLS limita filas y no autentica al usuario. La vinculación con una sesión autenticada se comprueba en un incremento posterior. `SECURITY DEFINER` queda fuera de 1B.2 y permanece como propuesta hasta cerrar D-05.

- [x] 1. Acordar el alcance y comprobar la línea base
  - **Depende de** Aprobación de la SDD y del corte de persistencia. El formato de usuario se aplica en 1B.2. La obligatoriedad de RUC por tipo de organización se decide para el alta funcional de la tarea 13.
  - **Requisitos** [RI-01](requirements.md#ri-01-identidad-y-roles) CA-01.1, [RI-02](requirements.md#ri-02-aprovisionamiento-y-membresías) CA-02.2 y [RI-06](requirements.md#ri-06-aislamiento-rls-y-credenciales) CA-06.4.
  - **Componentes** SDD, `docs/traceability/`, `ops/postgres/`, `apps/api/prisma.config.ts` y prueba de privilegios de 1B.1.
  - **Completa cuando** El alcance aprobado identifica qué modelos y casos entran en 1B.2, y la base de pruebas confirma los roles PostgreSQL separados y la salud de 1A.

- [x] 2. Definir Junta, Cuenta y Rol
  - **Depende de** Tarea 1 y autorización específica de 1B.2.
  - **Requisitos** [RI-01](requirements.md#ri-01-identidad-y-roles) CA-01.1 y CA-01.2, más CA-02.2 para los datos registrales acordados.
  - **Componentes** `apps/api/prisma/schema.prisma` y definición versionada del catálogo de cinco roles en `apps/api/prisma/migrations/`.
  - **Completa cuando** La validación de Prisma pasa. Según el formato de D-01 adoptado para 1B.2, se recortan los espacios exteriores y se validan la longitud de 3 a 32 caracteres y el conjunto permitido antes de convertir el nombre a minúsculas. Las pruebas aceptan letras y dígitos ASCII, punto, guion y guion bajo. Cubren los límites, los caracteres inválidos y los duplicados normalizados sin fusión de cuentas. También verifican que `Junta` y `Cuenta` solo admitan `ACTIVA` e `INACTIVA`, que el RUC pueda omitirse en el modelo inicial y que sea único globalmente cuando se registra. Se comprueban el catálogo de roles y el ámbito global separado.

- [x] 3. Definir membresía, persistencia de sesión y restricciones
  - **Depende de** Tarea 2 y de los estados iniciales `ACTIVA` e `INACTIVA` definidos en los requisitos.
  - **Requisitos** [RI-01](requirements.md#ri-01-identidad-y-roles) CA-01.2 y CA-01.3, [RI-04](requirements.md#ri-04-sesiones-y-revocación) CA-04.2 en persistencia y [RI-06](requirements.md#ri-06-aislamiento-rls-y-credenciales) CA-06.3.
  - **Componentes** `apps/api/prisma/schema.prisma` y SQL de restricciones en `apps/api/prisma/migrations/`.
  - **Completa cuando** Una cuenta tiene vínculos independientes en A y B y cada `Membresia` solo admite `ACTIVA` e `INACTIVA`. La base rechaza membresías duplicadas, roles globales en membresías y dos asignaciones activas incompatibles de Administrador para la misma cuenta, incluso con escrituras concurrentes. La FK compuesta y las restricciones de ámbito rechazan sesiones vinculadas a otra cuenta o junta y referencias locales en ámbitos de plataforma o preliminar.

- [x] 4. Incorporar las políticas RLS y verificar los permisos de base
  - **Depende de** Tarea 3.
  - **Requisitos** [RI-06](requirements.md#ri-06-aislamiento-rls-y-credenciales) CA-06.3 y CA-06.4.
  - **Componentes** `apps/api/prisma/migrations/`, `apps/api/test/postgres.integration.mjs` y `apps/api/test/identity.integration.mjs`.
  - **Completa cuando** La migración aplica en una base vacía y sobre una base de 1B.1 aislada. La prueba con `multi_junta_app` verifica `ENABLE` y `FORCE`, denegación sin contexto, rechazo de escrituras cruzadas y FK compuestas. Los permisos de la prueba se conceden por objeto en la base de prueba después de activar sus políticas. El rol operativo carece de acceso general a objetos de identidad y migración.

- [x] 5. Incorporar la unidad de trabajo con contexto de junta
  - **Depende de** Tarea 4.
  - **Requisitos** [RI-06](requirements.md#ri-06-aislamiento-rls-y-credenciales) CA-06.2 y CA-06.5 en la capa de persistencia. CA-06.1 se comprueba al integrar la sesión en la tarea 10.
  - **Componentes** `apps/api/src/core/prisma/`, `apps/api/src/modules/platform/identity/` y `apps/api/test/identity.integration.mjs`.
  - **Completa cuando** Los repositorios usan el cliente de la misma transacción que fija el contexto. Para 1B.2, el entorno de pruebas suministra los contextos sintéticos. Con un pool de una conexión, A → sin contexto → B conserva el mismo backend y cada caso se aísla tras commit y rollback. Una prueba concurrente en A y B también pasa.

- [x] 6. Revisar la evidencia de 1B.2
  - **Depende de** Tareas 1 a 5.
  - **Requisitos** CA-01.1 a CA-01.3, CA-06.2 a CA-06.5 y [RI-07](requirements.md#ri-07-auditoría-y-datos-de-prueba) CA-07.2.
  - **Componentes** `docs/traceability/` y suites de Prisma, PostgreSQL y salud en `apps/api/test/`.
  - **Completa cuando** Se vinculan criterios, tareas y pruebas ejecutadas con datos y contextos sintéticos. Pasan formato, lint, pruebas, build, `npm run db:validate` y las comprobaciones PostgreSQL aplicables. La evidencia de 1B.2 corresponde a persistencia y deja trazados los criterios pendientes de sesión y consulta previa al ámbito de junta. Cualquier rutina `SECURITY DEFINER` se reserva para un corte posterior, sujeto a la decisión D-05.

### Evidencia de 1B.2

| Criterios                   | Evidencia de persistencia                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-01.1 y parte de CA-02.2  | Normalización y límites, colisión canónica concurrente, unicidad de RUC cuando se registra y persistencia de juntas sin RUC.                              |
| CA-01.2, CA-01.3 y CA-06.3  | Catálogo de cinco roles, ámbito de asignación, membresías independientes, administrador activo único con concurrencia y rechazo de referencias cruzadas.  |
| Parte de CA-04.2            | Coincidencia de junta, cuenta y membresía en la sesión local y rechazo de referencias locales en sesiones de plataforma o preliminares.                   |
| CA-06.2 a CA-06.5 y CA-07.2 | Privilegios efectivos, RLS forzada, denegación sin contexto válido, operaciones acotadas a la junta y reutilización de conexiones tras commit y rollback. |

Las pruebas ejecutables están en [identidad](../../../apps/api/test/identity.integration.mjs) y [privilegios de PostgreSQL](../../../apps/api/test/postgres.integration.mjs). La vinculación de la sesión con el contexto de junta de CA-06.1, la verificación de estados durante la autenticación, la revocación efectiva y la titularidad entre socios de la misma junta se validarán en las tareas posteriores.

## Cortes posteriores de identidad y autorización

- [ ] 7. Preparar la consulta exacta y la verificación de credenciales
  - **Depende de** Tarea 6 y D-03 y D-05 sobre credenciales y frontera previa a la junta.
  - **Requisitos** [RI-03](requirements.md#ri-03-autenticación) CA-03.1 y CA-03.3, y CA-06.4.
  - **Componentes** `apps/api/src/modules/platform/identity/`, permisos por objeto en la migración correspondiente y `apps/api/test/`. `SECURITY DEFINER` es una propuesta para la consulta restringida, sujeta a la resolución de D-05.
  - **Completa cuando** La consulta exacta y Argon2id verifican credenciales sintéticas válidas e inválidas. La cuenta operativa solo puede ejecutar las operaciones aprobadas de identidad y los hashes quedan fuera de las respuestas y logs.

- [ ] 8. Aprovisionar al primer Super Administrador
  - **Depende de** Tareas 2 y 7, y alta inicial aprobada en D-02 y D-03. Aplicar los campos de auditoría decididos en D-05.
  - **Requisitos** [RI-02](requirements.md#ri-02-aprovisionamiento-y-membresías) CA-02.1 y [RI-07](requirements.md#ri-07-auditoría-y-datos-de-prueba) CA-07.1.
  - **Componentes** Inicialización controlada de Plataforma, servicio de credenciales, registro de auditoría y `apps/api/test/`.
  - **Completa cuando** La inicialización autorizada produce una sola alta y una evidencia auditable. Repetición, concurrencia y fallo parcial conservan un estado consistente, con secretos fuera del repositorio y de los registros.

- [ ] 9. Implementar el ciclo de sesión y la revocación
  - **Depende de** Tarea 7 y D-04 y D-05 en lo relativo al ciclo de sesión.
  - **Requisitos** [RI-04](requirements.md#ri-04-sesiones-y-revocación) CA-04.1 a CA-04.3.
  - **Componentes** Modelo `Sesion` de 1B.2, servicio de sesiones en `apps/api/src/modules/platform/identity/` y cambios de persistencia que se aprueben en D-04 y D-05.
  - **Completa cuando** Las pruebas verifican huella única, ámbitos, FK compuesta, caducidad, revocación, rotación y rechazo de una membresía de otra cuenta de la misma junta. Repetir con desactivación y reactivación de cuenta, membresía y junta.

- [ ] 10. Resolver el ámbito a partir de una sesión verificada
  - **Depende de** Tareas 5 y 9 y frontera de proyección aprobada en D-05.
  - **Requisitos** CA-03.4, CA-04.2 y [RI-06](requirements.md#ri-06-aislamiento-rls-y-credenciales) CA-06.1 a CA-06.5.
  - **Componentes** Resolver de contexto de Plataforma, proyecciones y concesiones SQL que se aprueben, más `apps/api/test/`.
  - **Completa cuando** El selector devuelve solo las membresías elegibles de la cuenta de una sesión válida. Una cuenta con A y B puede elegir cada junta, opera en una por sesión y no arrastra el estado de la anterior. Las pruebas cubren permiso de ejecución, sesión inválida, error y ausencia de contexto residual.

- [ ] 11. Exponer autenticación y transiciones de sesión por REST
  - **Depende de** Tareas 7, 9 y 10 y reglas de credenciales, frecuencia, cookie y CSRF aprobadas en D-03 y D-04.
  - **Requisitos** [RI-03](requirements.md#ri-03-autenticación) CA-03.1 a CA-03.4 y [RI-04](requirements.md#ri-04-sesiones-y-revocación) CA-04.1 a CA-04.4.
  - **Componentes** Controladores de `/api/v1/auth/`, servicio de sesiones y pruebas HTTP en `apps/api/test/`.
  - **Completa cuando** Inicio, cambio de clave inicial, selección, cambio de junta y cierre conservan el ámbito validado. Las pruebas HTTP verifican cookie, CSRF y errores sin enumeración, además de caducidad, límite de intentos y reutilización de tokens revocados.

- [ ] 12. Aplicar permisos por ámbito, rol y titularidad
  - **Depende de** Tareas 5, 10 y 11 y aprobación de D-05.
  - **Requisitos** [RI-05](requirements.md#ri-05-autorización-y-titularidad) CA-05.1 a CA-05.4, CA-06.1 y CA-07.2.
  - **Componentes** Guardas en `apps/api/src/core/`, políticas de Plataforma y contratos de acceso para RF-02, RF-32 y RF-33.
  - **Completa cuando** Las pruebas de servicio e integración demuestran permisos positivos y negativos de plataforma y junta, y acceso exclusivo de A1 y A2 a sus propios recursos. Verifican que filtrado, detalle y escritura rechazan cruce entre A y B. Los casos funcionales de cada módulo incorporan después los escenarios de sus canales auxiliares.

- [ ] 13. Habilitar alta de Junta por Plataforma
  - **Depende de** Tareas 8 y 12 y aprobación del alcance y campos de D-01 y D-02.
  - **Requisitos** [RI-02](requirements.md#ri-02-aprovisionamiento-y-membresías) CA-02.2 para RF-01, más CA-05.2.
  - **Componentes** Caso de uso y ruta prevista de alta de Junta en Plataforma, persistencia y pruebas HTTP.
  - **Completa cuando** El Super Administrador autorizado registra una junta `ACTIVA`. Las pruebas cubren el rechazo global de RUC duplicado cuando se registra, la obligatoriedad del RUC según el tipo de organización que se apruebe en D-01 y la denegación de la petición desde un rol local.

- [ ] 14. Asignar Administrador de Junta
  - **Depende de** Tareas 7, 12 y 13 y circuito de D-02 y D-03 aprobado.
  - **Requisitos** CA-01.3, CA-02.2 para RF-04, CA-03.3 y CA-07.1.
  - **Componentes** Caso de uso de asignación en Plataforma, gestión inicial de credenciales y repositorio de auditoría.
  - **Completa cuando** Una junta activa acepta una asignación autorizada. Se cubren inactividad, doble administración simultánea, alta de cuenta nueva con cambio inicial y vinculación de una existente conforme al mecanismo aprobado.

- [ ] 15. Gestionar membresías de una junta
  - **Depende de** Tareas 12 y 14, relación con padrón aprobada en D-02, reglas de D-03 y auditoría y carreras de D-05.
  - **Requisitos** CA-01.2, [RI-02](requirements.md#ri-02-aprovisionamiento-y-membresías) CA-02.3 para RF-05, CA-04.3 y CA-07.1.
  - **Componentes** Rutas de membresías en `/api/v1/juntas/:juntaId/` y servicios de cambios de acceso y auditoría.
  - **Completa cuando** El Administrador puede operar sobre los roles locales autorizados en su junta. Las pruebas muestran que una baja o un cambio de rol revoca solo las sesiones aplicables, mantiene las demás membresías y conserva el historial.

- [ ] 16. Habilitar el alta excepcional del primer Secretario
  - **Depende de** Tareas 12, 14 y 15 y decisión sobre el circuito excepcional en D-02.
  - **Requisitos** CA-02.4, CA-05.1 y CA-07.1.
  - **Componentes** Caso de uso de Secretaría inicial, marca de inicialización y registro auditable.
  - **Completa cuando** La primera habilitación solo la ejerce el Administrador de la propia junta. Dos solicitudes concurrentes producen un único resultado efectivo. El fallo parcial revierte el proceso y una baja posterior mantiene cerrada la vía de inicialización.

- [ ] 17. Integrar las pantallas y recorridos aprobados
  - **Depende de** Tareas 11 y 12, flujos de administración autorizados y decisión de experiencia web de D-04.
  - **Requisitos** CA-03.3, CA-03.4, CA-04.1 a CA-04.4 y CA-05.1.
  - **Componentes** `apps/web/src/features/`, `packages/api-client/` y `tests/e2e/`.
  - **Completa cuando** El recorrido aprobado inicia y cierra sesión, presenta solo ámbitos elegibles, refleja las transiciones de acceso y utiliza la API como autoridad. Las pruebas de navegador cubren cambio inicial y cambio de junta según el flujo aprobado.

- [ ] 18. Revisar el cierre funcional y la trazabilidad final
  - **Depende de** Los cortes funcionales autorizados de tareas 7 a 17.
  - **Requisitos** CA-04.3, CA-05.2 a CA-05.4, CA-06.5 y [RI-07](requirements.md#ri-07-auditoría-y-datos-de-prueba) CA-07.1 y CA-07.2.
  - **Componentes** `docs/traceability/`, `apps/api/test/`, `tests/e2e/` y CI.
  - **Completa cuando** La matriz relaciona RF, CU o DEC con criterio, tarea y evidencia. Incluye dos juntas, dos socios de la misma junta, cuenta multijunta, límites del Super Administrador, revocación y registros sin secretos. Quedan identificados los criterios de padrón o mensajería cuya prueba completa corresponde a su propia especificación.
