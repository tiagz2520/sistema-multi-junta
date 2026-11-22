# Requisitos de identidad y aislamiento

**Estado** Arquitectura y corte de persistencia de 1B.2 aprobados. La SDD distingue las decisiones aplicables a este corte de los flujos funcionales pendientes.

## Objetivo y alcance

Establecer cómo una cuenta accede a la plataforma y a las juntas que le corresponden. La especificación cubre identidad, roles y membresías, aprovisionamiento inicial, autenticación, sesiones revocables, autorización por recurso, aislamiento de datos y auditoría. El Incremento 1B.1 ya separa las credenciales de PostgreSQL para migraciones y ejecución. Esta especificación define las condiciones para incorporar datos operativos a esa base.

Los flujos de alta de junta, asignación de administradores y gestión local de cuentas figuran como requisitos de origen. D-02 determina qué operaciones funcionales entran en cada incremento. El padrón, la configuración general de una junta, el portal del socio y la mensajería aportan casos de autorización. Su implementación funcional queda sujeta a la especificación de cada capacidad. Los escenarios pueden comprobar su perímetro con recursos de prueba sintéticos.

## Fuentes y autoridad

| Referencia                                                                                                           | Alcance                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **F1** `Proyecto_JUNTAS DE RIEGO.pdf`, pp. 1–4                                                                       | Fuente principal de roles, aislamiento entre juntas y requisitos funcionales.                    |
| **F2** `APE03Modelamiento1.pdf`                                                                                      | Detalle de casos de uso, reglas y flujos alternativos. Las páginas citadas corresponden al PDF.  |
| **F3** `APE02Modelamientooo.pdf`, §2.1 p. 1 y §2.11 p. 28                                                            | Referencia académica de modelamiento UML. Sus casos de ejemplo corresponden a otro dominio.      |
| **DEC** [Decisión de arquitectura de identidad y aislamiento](../../../docs/architecture/identidad-y-aislamiento.md) | Ocho decisiones aprobadas para 1B. Resuelve las diferencias documentadas en esta especificación. |
| **SEG** [AGENTS.md](../../../AGENTS.md) y [Operación](../../../ops/README.md)                                        | Restricciones de seguridad, uso de datos sintéticos y privilegios mínimos de PostgreSQL.         |

Los enunciados atribuidos a F1 y F2 son requisitos o antecedentes de las fuentes. Los criterios de aceptación fijan comportamientos verificables. Las decisiones DEC y las restricciones SEG son vinculantes. La tabla de decisiones pendientes indica en qué corte deben resolverse los puntos abiertos de D-01 a D-05.

## Decisiones aprobadas

1. El nombre de usuario se normaliza al registrarlo e iniciar sesión. Su unicidad es global y la comparación ignora diferencias de mayúsculas y minúsculas.
2. Una cuenta puede pertenecer a varias juntas mediante membresías independientes. Cada membresía concede acceso a su junta.
3. Una sesión local tiene contexto de una sola junta. El servidor valida la membresía activa para ese contexto. El Super Administrador opera en un ámbito de plataforma separado.
4. Una cuenta puede ser Administrador de la Junta en una sola junta a la vez y conservar membresías con otros roles en otras juntas.
5. Cada membresía tiene un solo rol en el alcance inicial.
6. El Administrador de la Junta puede registrar al primer Secretario de su junta mediante un flujo excepcional y auditable. Secretaría conserva la responsabilidad ordinaria de la nómina.
7. El primer Super Administrador se crea mediante una inicialización controlada de la plataforma.
8. Las sesiones se mantienen en el servidor y son revocables. El navegador recibe un identificador opaco en una cookie `HttpOnly`, `Secure` en HTTPS y con `SameSite`. Las operaciones que cambian estado requieren protección CSRF.

## Precisiones para el modelo inicial de 1B.2

- **Nombre de usuario y D-01.** Para 1B.2 se adopta el formato de 3 a 32 caracteres después de eliminar los espacios exteriores. Se valida primero que el texto solo contenga letras ASCII, números ASCII, punto, guion y guion bajo. El valor canónico se guarda en minúsculas. Se rechazan espacios interiores, caracteres ajenos al conjunto y duplicados. La cuenta existente conserva sus datos y vínculos.
- **Estados y RUC.** Junta, Cuenta y Membresía tendrán únicamente los estados `ACTIVA` e `INACTIVA` en el modelo inicial. El RUC puede omitirse en esa fase y conserva su unicidad global cuando se registra. La obligatoriedad por tipo de organización se decide para el alta funcional.
- **Persistencia de sesión.** 1B.2 incorpora el modelo `Sesion` y las restricciones que vinculan cada registro local a una sola junta y a la membresía de su propia cuenta. La emisión, el uso y la revocación funcional de sesiones se implementarán en cortes posteriores.
- **Alcance de RLS.** El contexto RLS limita el acceso a filas. No autentica por sí mismo al usuario. Las pruebas de persistencia de 1B.2 usarán contextos sintéticos controlados, sin depender de un inicio de sesión ni recibir el contexto desde una petición HTTP. Vincular el contexto con una sesión autenticada y validar su membresía se realizará en un incremento posterior.
- **Funciones de identidad.** 1B.2 establece la persistencia inicial. En 1B.3 se aprueban rutinas de identidad acotadas bajo D-05, con propietario `NOLOGIN`, permisos mínimos, validación de sesión y revocación de ejecución a `PUBLIC`.

### Alcance aprobado de 1B.3

- Cuando una cuenta `ACTIVA` presente credenciales válidas, la API deberá iniciar una sesión de plataforma para Super Administrador o una sesión preliminar para selección local. Si requiere cambio de contraseña, la sesión preliminar solo deberá permitir consultar su estado, cambiar la contraseña conocida y cerrar sesión.
- Cuando exista una sesión autorizada, la API deberá proyectar únicamente juntas activas con membresías activas de esa cuenta. Cuando se elija una junta autorizada, deberá revocarse el token previo y emitirse otro con el nuevo ámbito y la misma caducidad absoluta.
- Cuando el cliente acceda a la membresía propia de su contexto, el servidor deberá usar exclusivamente la junta y membresía de la sesión validada. Si el identificador de ruta no coincide con la junta activa, la operación deberá denegarse.
- Cuando una mutación de autenticación carezca del origen esperado o del control CSRF definido para la sesión o el inicio, la API deberá denegarla antes de cambiar estado.
- Cuando un operador ejecute la inicialización controlada, el sistema deberá registrar un solo Super Administrador inicial y el evento mínimo de auditoría en la misma transacción.

## Trazabilidad funcional

| Fuente                              | Actor y comportamiento de origen                                                                                                                                            | Aplicación en esta especificación                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| F1 §3–4, pp. 1–3                    | Cinco roles y datos independientes por junta. Acceso mediante cuenta individual, nombre de usuario y contraseña.                                                            | RI-01, RI-03 a RI-06. El acceso individual figura en la descripción de actores.                            |
| RF-01, F1 p. 3. F2 CU 1, pp. 3–4    | El Super Administrador registra nuevas juntas. El caso de uso contempla alta activa y RUC único.                                                                            | CA-02.2. Campos obligatorios y alcance en D-01 y D-02.                                                     |
| RF-02, F1 p. 3. F2 CU 2, pp. 4–5    | El Administrador modifica los datos generales, sectores y parámetros de su junta.                                                                                           | CA-05.1 y CA-06.1. Configuración funcional por resolver en D-02.                                           |
| RF-04, F1 p. 3. F2 CU 3, p. 5       | El Super Administrador asigna Administrador a una junta activa. APE03 describe credenciales temporales, cambio inicial y búsqueda alternativa por cédula.                   | CA-01.3, CA-02.2 y CA-03.3. Identificación y entrega en D-03.                                              |
| RF-05, F1 p. 3. F2 CU 4, p. 6       | El Administrador gestiona cuentas de socios de su junta. Puede asignar Secretaría, Tesorería o Socio a miembros del padrón. El historial se conserva tras la desactivación. | CA-02.3. Alcance de la gestión y credenciales iniciales en D-02 y D-03.                                    |
| RF-07, F1 p. 3. F2 CU 5, pp. 6–7    | Secretaría mantiene el padrón. El CU 4 exige padrón para habilitar una cuenta local.                                                                                        | CA-02.4 resuelve el inicio de una junta sin Secretaría. El padrón ordinario pertenece a su especificación. |
| RF-32, F1 p. 4. F2 CU 21, pp. 16–17 | El socio autenticado consulta su propia información con su cuenta activa.                                                                                                   | CA-05.3 y CA-06.1. La consulta de negocio sirve como referencia para verificar titularidad.                |
| RF-33, F1 p. 4. F2 CU 22, pp. 17–18 | El Administrador y el Socio con acceso activo intercambian mensajes dentro de la misma junta.                                                                               | CA-05.4. La mensajería funcional pertenece a su especificación.                                            |

## Actores y alcance de acceso

| Actor                                | Alcance en identidad y autorización                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Super Administrador de la Plataforma | Alta de juntas y asignación de sus Administradores desde el ámbito de plataforma.                          |
| Administrador de la Junta            | Gestión local de accesos de miembros y aprovisionamiento excepcional de la primera Secretaría en su junta. |
| Secretario/a                         | Alcance administrativo y documental de su junta según los permisos de los casos aplicables.                |
| Tesorero/a                           | Alcance financiero de su junta según los permisos de los casos aplicables.                                 |
| Miembro/Socio                        | Acceso individual al recurso del que es titular y a las funciones de socio autorizadas en su junta activa. |

## Requisitos y criterios de aceptación

### RI-01 Identidad y roles

**Historia** Como persona con vínculos en distintas juntas, quiero usar una cuenta individual y recibir en cada junta los permisos de mi membresía.

- **CA-01.1** Cuando se registre un nombre de usuario o se use para iniciar sesión, el sistema deberá aplicar la misma normalización. Según el formato de D-01 adoptado para 1B.2, se retiran los espacios exteriores y se valida el texto antes de pasarlo a minúsculas. Si el texto tiene menos de 3 o más de 32 caracteres, o contiene caracteres distintos de letras y números ASCII, punto, guion y guion bajo, el sistema deberá rechazarlo. Si dos altas, incluso concurrentes, producen el mismo nombre normalizado, el sistema deberá rechazar el duplicado sin fusionar cuentas ni alterar los vínculos existentes.
- **CA-01.2** El sistema deberá reconocer los cinco roles de F1. Cada membresía pertenecerá a una cuenta y a una junta y tendrá un solo rol local. Cuando una cuenta tenga vínculos en varias juntas, el sistema deberá representar cada vínculo mediante una membresía independiente. El Super Administrador tendrá un ámbito de plataforma separado de esas membresías.
- **CA-01.3** Si una cuenta ya ejerce como Administrador en una junta, el sistema deberá impedir que obtenga ese rol simultáneamente en otra, incluso con asignaciones concurrentes. Podrá conservar sus membresías con otros roles.

### RI-02 Aprovisionamiento y membresías

**Historia** Como responsable de la plataforma o de una junta, quiero habilitar los accesos permitidos en mi ámbito y poder iniciar una junta desde cero.

- **CA-02.1** Cuando se inicialice la plataforma, el sistema deberá permitir el alta del primer Super Administrador mediante el mecanismo controlado que se apruebe. Si se repite la inicialización o se ejecuta concurrentemente, el mecanismo deberá evitar una segunda alta inicial y conservar un estado consistente. D-02 fija la operación y sus responsables.
- **CA-02.2** Cuando se habiliten RF-01 y RF-04, el sistema deberá exigir autorización de plataforma para registrar una junta o asignarle un Administrador. Cuando se registre una junta, el sistema deberá dejarla en estado `ACTIVA`. Si se registra un RUC, el sistema deberá garantizar su unicidad global. Si la junta está `INACTIVA` o se incumple CA-01.3, el sistema deberá denegar la asignación. La obligatoriedad del RUC por tipo de organización se resuelve para el alta funcional en D-01. D-02 completa el alcance de la operación.
- **CA-02.3** Cuando se habilite RF-05, el sistema deberá permitir al Administrador gestionar las membresías de Secretaría, Tesorería y Socio de su junta conforme al padrón aplicable. Si desactiva ese acceso o cambia su rol, el sistema deberá preservar el historial y las demás membresías de la cuenta. El alcance exacto de altas, ediciones y vinculación se decide en D-02 y D-03.
- **CA-02.4** Si una junta requiere su primera Secretaría, el sistema deberá permitir a su Administrador habilitarla mediante el flujo excepcional auditable. Ante una repetición, concurrencia o fallo parcial, el sistema deberá mantener un resultado consistente, con una sola inicialización efectiva y sin registros parciales. D-02 fija cómo se identifica y completa la primera alta.

### RI-03 Autenticación

**Historia** Como titular de una cuenta, quiero autenticarme con mis credenciales y operar en una de mis juntas activas o en el ámbito de plataforma que me corresponde.

- **CA-03.1** Cuando una persona se autentique, el sistema deberá verificar el nombre de usuario normalizado, la contraseña y que la cuenta esté `ACTIVA` antes de habilitar acceso. El sistema deberá almacenar contraseñas mediante Argon2id y mantener los hashes fuera de respuestas y registros de diagnóstico.
- **CA-03.2** Si la autenticación falla, el sistema deberá rechazarla sin exponer si la cuenta existe, está inactiva o recibió una contraseña incorrecta. Cuando los intentos excedan el límite aprobado, el sistema deberá aplicar el control de frecuencia definido en D-04.
- **CA-03.3** Cuando se cree una cuenta nueva para un Administrador según F2 CU 3, el sistema deberá emitir una contraseña temporal y exigir su cambio en el primer inicio de sesión, antes del acceso operativo. D-03 decide la entrega, la recuperación y las reglas que se aplican a la vinculación de cuentas existentes y a otras altas.
- **CA-03.4** Si una cuenta tiene varias membresías, el sistema deberá ofrecer o resolver la elección solo entre juntas con una membresía activa verificada por el servidor. Si la cuenta carece de autorización para la junta solicitada, el sistema deberá denegar ese contexto. D-04 fija la experiencia de selección.

### RI-04 Sesiones y revocación

**Historia** Como persona autenticada, quiero operar con un contexto claro y que el acceso termine cuando cierre sesión o pierda los permisos correspondientes.

- **CA-04.1** Cuando el sistema establezca una sesión, deberá mantenerla en el servidor y emitir al navegador un identificador opaco en una cookie `HttpOnly`, `Secure` en HTTPS y con `SameSite`. D-04 fija los plazos y la política de sesiones simultáneas.
- **CA-04.2** Mientras una sesión sea local, el sistema deberá asociarla con una sola junta y validar que la junta y la membresía correspondiente tengan el estado `ACTIVA`. Si se autoriza un cambio de junta, el sistema deberá sustituir el contexto de esa sesión sin conservar en ella la autorización del contexto anterior. Las sesiones de plataforma deberán operar en su propio ámbito. D-04 fija el mecanismo concreto de cambio.
- **CA-04.3** Cuando la sesión se cierre o caduque, el sistema deberá rechazar su reutilización. Si se desactiva la cuenta, el sistema deberá revocar su acceso. Si se desactiva una membresía o cambia su rol, el sistema deberá invalidar la autorización anterior de las sesiones afectadas antes de aceptar nuevas operaciones con esos permisos. D-05 define el manejo de peticiones en curso.
- **CA-04.4** Cuando una petición cambie estado, el sistema deberá comprobar la protección CSRF aplicable. Si falla la comprobación, el sistema deberá rechazar la operación sin efectuar el cambio.

### RI-05 Autorización y titularidad

**Historia** Como integrante de una junta, quiero que cada operación aplique los permisos de mi rol, el contexto de mi junta y mi relación con el recurso.

- **CA-05.1** Cuando una petición acceda a un recurso protegido, el sistema deberá verificar sesión, ámbito, rol y autorización específica sobre el recurso. Si falta un permiso explícito, el sistema deberá denegar por defecto. Esta regla aplica a RF-02 y a cualquier operación local. D-05 fija la matriz granular y las respuestas.
- **CA-05.2** Mientras una sesión opere en el ámbito de plataforma, el sistema deberá limitarla a las operaciones globales autorizadas. Si intenta consultar o modificar datos operativos de una junta, el sistema deberá denegar el acceso aunque conozca el identificador del recurso.
- **CA-05.3** Cuando un Socio consulte información individual de RF-32, el sistema deberá devolver únicamente los registros de los que sea titular en su junta activa. Si intenta consultar los de otro socio de esa misma junta o de otra junta, el sistema deberá denegar la petición sin revelar información ajena.
- **CA-05.4** Cuando se habilite RF-33, el sistema deberá autorizar el intercambio entre el Administrador y el Socio con acceso activo dentro de la misma junta y acceso a la conversación. Cuando una capacidad exponga archivos, búsquedas, cachés, exportaciones o tareas, el sistema deberá aplicar las mismas reglas de ámbito y titularidad a esas vías de acceso.

### RI-06 Aislamiento, RLS y credenciales

**Historia** Como organización usuaria, quiero que mis datos y sus relaciones estén aislados incluso ante referencias cruzadas o reutilización de conexiones.

- **CA-06.1** Cuando una operación de la aplicación use datos de junta, el sistema deberá resolver el identificador efectivo de junta en el servidor desde una sesión válida y su membresía activa. Si la petición incluye un identificador de otra junta, el sistema deberá impedir su uso como contexto autorizado. Este criterio se comprueba en el incremento que vincule la sesión autenticada con el contexto de junta.
- **CA-06.2** Cuando Prisma ejecute una operación con datos de junta, el sistema deberá establecer el contexto en la transacción y usar el mismo cliente transaccional para todas sus consultas operativas. Si el contexto exigido no puede establecerse, la operación deberá fallar sin devolver ni modificar datos operativos.
- **CA-06.3** Cuando se incorporen tablas operativas, el sistema deberá incluir el identificador de junta, impedir relaciones cruzadas con claves foráneas compuestas y habilitar RLS forzada antes de exponer las tablas. Si falta el contexto de junta o resulta incompatible con la fila, las políticas deberán impedir su lectura y modificación.
- **CA-06.4** El sistema deberá separar las credenciales de migración de las de ejecución, conservar el límite de privilegios de 1B.1 y ejecutar la API con un rol sin `BYPASSRLS` ni propiedad de las tablas operativas. Las migraciones deberán conceder solo los permisos requeridos por objeto después de aplicar las políticas de aislamiento correspondientes.
- **CA-06.5** Cuando se reutilice una conexión, finalice una transacción o se produzca un error, el sistema deberá impedir la propagación del contexto de junta a otra operación. La comprobación deberá cubrir dos juntas en secuencia y en paralelo, y una operación posterior sin contexto válido.

### RI-07 Auditoría y datos de prueba

**Historia** Como responsable de seguridad, quiero poder verificar los cambios de acceso y las inicializaciones con registros mínimos y pruebas reproducibles.

- **CA-07.1** Cuando se produzca un alta inicial, una asignación, un cambio de rol o una revocación, el sistema deberá dejar evidencia de la operación y su resultado con los identificadores internos mínimos para auditarla. El sistema deberá omitir contraseñas, tokens y datos personales innecesarios. D-05 determina el catálogo final de eventos, acceso y retención.
- **CA-07.2** El sistema deberá comprobar el aislamiento y la autorización con datos sintéticos que representen dos juntas, dos socios de una misma junta y una cuenta con varias membresías. Las pruebas deberán incluir permisos permitidos y denegados, revocación, falta de contexto y los escenarios de concurrencia que correspondan.

## Diferencias documentales resueltas

- El contexto de F1 p. 1 admite la lectura de registro autónomo. RF-01 y F2 CU 1 asignan el alta al Super Administrador. La especificación mantiene esa asignación.
- F2 CU 4 exige un miembro del padrón para crear su cuenta local y CU 5 reserva el padrón a Secretaría. La excepción aprobada en DEC 6 permite habilitar la primera Secretaría. Su ejecución se delimita en D-02.
- F2 CU 3 limita al Administrador a una junta. DEC 4 concreta que es una restricción del rol simultáneo y permite otras membresías con roles diferentes.
- F2 CU 4 describe desactivar cuentas dentro de una junta. Con membresías independientes, la gestión local afecta el acceso de esa junta y conserva la cuenta y sus demás vínculos. Los supuestos de desactivación global corresponden a D-02.
- El mockup de inicio de sesión de F2 p. 43 pide cédula y contraseña. F1 p. 3 indica acceso por usuario y contraseña y DEC 1 establece el nombre de usuario normalizado. La especificación aplica esa decisión al inicio de sesión.
- F2 CU 3 contempla buscar una persona existente por cédula durante la asignación de Administrador. La vigencia de ese flujo y los datos que puede consultar el actor se deciden en D-03.

## Decisiones pendientes

| ID   | Decisión para revisión                                                                                                                                                                                                                                                                                 | Criterios afectados                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| D-01 | Para 1B.2 se adopta un nombre de usuario de 3 a 32 caracteres ASCII permitidos, sin espacios exteriores y en minúsculas. Los duplicados se rechazan sin fusión de cuentas. El RUC es único cuando se registra. Su obligatoriedad según el tipo de organización queda pendiente para el alta funcional. | CA-01.1, CA-02.2, CA-03.1                                                 |
| D-02 | Definir responsables, pasos, estados, recuperación ante errores y límites de inicialización del primer Super y la primera Secretaría. Precisar qué partes de RF-01, RF-02, RF-04, RF-05 y RF-07 se implementan por incremento, incluido el alcance de desactivación global.                            | CA-02.1 a CA-02.4, CA-05.1                                                |
| D-03 | 1B.3 define Argon2id, inicialización controlada y cambio obligatorio cuando la cuenta esté marcada. Quedan pendientes la emisión y entrega temporal, vigencia, recuperación y vinculación de cuentas preexistentes.                                                                                    | CA-02.1, CA-02.3, CA-03.1 a CA-03.3                                       |
| D-04 | 1B.3 define sesión opaca con 30 minutos de inactividad y 12 horas absolutas configurables, concurrencia independiente, rotación, selector explícito, cookies y protección CSRF.                                                                                                                        | CA-03.2, CA-03.4, CA-04.1 a CA-04.4                                       |
| D-05 | 1B.3 define consulta de identidad restringida, guardas, ámbito efectivo, errores y auditoría básica. Quedan pendientes permisos y titularidad por recurso de negocio, retención y tratamiento de operaciones sensibles ya iniciadas.                                                                   | CA-03.4, CA-04.3, CA-05.1 a CA-05.4, CA-06.1 a CA-06.5, CA-07.1 a CA-07.2 |
