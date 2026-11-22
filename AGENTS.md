# Desarrollo de Sistema Multi-Junta

## Arquitectura acordada

- Mantén un monorepositorio con npm workspaces y un archivo de bloqueo en la raíz. El frontend usa React, TypeScript, Vite y Tailwind CSS. El backend usa NestJS y TypeScript con API REST bajo `/api/v1`, PostgreSQL y Prisma. Docker Compose proporciona el entorno local.
- Conserva el monolito modular y la propiedad de datos por módulo. Plataforma, Administrativa, Financiera y Comunicaciones se integran mediante interfaces de servicio explícitas. Los controladores gestionan HTTP y los casos de uso gobiernan las reglas y transacciones.
- Los comprobantes son documentos internos en el alcance inicial. Las reglas financieras pendientes deben quedar registradas en las especificaciones hasta que se aprueben.

## Seguridad obligatoria al introducir funcionalidad

- Resuelve el contexto de junta en el servidor a partir de una sesión y una membresía activas. Trata los identificadores del navegador como entradas y aplica permisos del rol y del recurso en cada operación. Limita el Super Administrador a las operaciones de plataforma que le corresponden.
- Las tablas operativas deben tener identificador de junta y claves foráneas que impidan relaciones entre juntas. Aplica RLS forzada con denegación sin contexto. Establece el contexto y ejecuta las consultas mediante el mismo cliente Prisma transaccional. Usa credenciales de ejecución sin `BYPASSRLS` y credenciales separadas para migraciones.
- Aplica el ámbito de junta y la titularidad a archivos, búsquedas, cachés, exportaciones y tareas. Incluye pruebas negativas con dos juntas y con dos socios de una misma junta.
- Implementa sesiones revocables del lado servidor, cookies `HttpOnly`, `Secure` y `SameSite` en HTTPS, protección CSRF y caducidad. Revoca el acceso cuando se desactive la cuenta o cambien sus permisos. Almacena contraseñas con Argon2id.
- Usa datos sintéticos en código y pruebas. Conserva los valores locales desechables en `.env.example` y las credenciales reales fuera del repositorio. Mantén archivos de referencia con datos personales fuera de cambios y publicaciones hasta su revisión.

## Especificaciones y verificación

- Usa `.kiro/specs/` para las especificaciones SDD. Vincula los RF originales y las páginas fuente con los criterios de aceptación, tareas y pruebas. Registra las contradicciones y decisiones pendientes antes de implementar las reglas afectadas.
- Verifica formato, lint, pruebas y compilación. Si cambias el esquema, valida Prisma y las migraciones con PostgreSQL. Si cambias la integración web/API o Compose, ejecuta la comprobación HTTP con los servicios activos.
- Trabaja en una rama de tarea. Los commits y la publicación de la rama de este incremento requieren aprobación del usuario.

El Incremento 1A proporciona infraestructura y el endpoint de salud. La implementación de sesiones, RLS y reglas de negocio empieza con sus incrementos autorizados.
