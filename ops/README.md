# Operación

El entorno de desarrollo está definido en `compose.yaml`. `postgres/` aprovisiona las cuentas de migración y ejecución en la base de Sistema Multi-Junta. El servicio `postgres-roles` lo ejecuta también con volúmenes existentes.

Las futuras migraciones deben conceder solo los privilegios necesarios sobre sus objetos y aplicar las políticas RLS antes de exponer tablas operativas a la API. El aprovisionamiento se limita a la base configurada, el esquema `multi_junta` y los roles del proyecto.
