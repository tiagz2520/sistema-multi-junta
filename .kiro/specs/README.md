# Especificaciones SDD

Crea un directorio por capacidad cuando se prepare su especificación en Kiro. Usa el flujo Requirements-First.

- `requirements.md` vincula fuente, RF, actores, escenarios y criterios de aceptación. Registra las decisiones abiertas.
- `design.md` describe dependencias, contrato REST, datos, permisos, aislamiento y pruebas.
- `tasks.md` ordena la implementación por dependencias y vincula tareas con criterios de aceptación y pruebas.

La preparación de cada especificación precede a la implementación de su capacidad. Consulta [identidad y aislamiento](identidad-y-aislamiento/requirements.md) para autenticación y sesiones, y [gestión de plataforma y juntas](gestion-plataforma-juntas/requirements.md) para 1C.

El Macroincremento 2 se divide en [administración comunitaria](administracion-comunitaria/requirements.md) y [finanzas y recursos](finanzas-recursos/requirements.md).

Para esta especificación, parte de las [decisiones de identidad y aislamiento aprobadas](../../docs/architecture/identidad-y-aislamiento.md).

El Macroincremento 3 reúne [comunicaciones](comunicaciones/requirements.md), [portal del socio](portal-socio/requirements.md) y [reportes y horarios](reportes-horarios/requirements.md). La [matriz de trazabilidad](../../docs/traceability/README.md) enlaza las capacidades completas con sus pruebas.
