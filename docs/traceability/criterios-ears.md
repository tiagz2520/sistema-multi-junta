# Criterios de aceptación EARS

Los 88 criterios de aceptación se derivaron de las especificaciones de casos de uso de la APE 03 (flujo normal, excepciones y reglas de negocio) y siguen las plantillas EARS: evento (CUANDO), comportamiento no deseado (SI … ENTONCES), estado (MIENTRAS) y ubicuo.

Cada criterio se identifica como `CA-HU.n`. Los rangos por historia coinciden con los de la [matriz de trazabilidad](README.md) y con el informe del proyecto (Anexo A). Las especificaciones por capacidad de `.kiro/specs/` usan sus propios identificadores (AC, FR y otros); esta tabla agrupa los criterios por historia de usuario.

## HU-01. Registrar nuevas juntas

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                    |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-01.1 | Evento     | CUANDO el Super Administrador solicite registrar una junta, EL SISTEMA DEBERÁ mostrar el formulario “Registrar Nueva Junta”.                              |
| CA-01.2 | Evento     | CUANDO el Super Administrador pulse “Guardar” con datos válidos, EL SISTEMA DEBERÁ registrar la junta con estado “Activa” y mostrar el listado de juntas. |
| CA-01.3 | No deseado | SI algún campo obligatorio está vacío, ENTONCES EL SISTEMA DEBERÁ impedir el registro de la junta.                                                        |
| CA-01.4 | No deseado | SI el RUC ya está registrado, ENTONCES EL SISTEMA DEBERÁ mostrar “La junta ya se encuentra registrada”.                                                   |
| CA-01.5 | Ubicuo     | EL SISTEMA DEBERÁ mantener la información de cada junta aislada de la de las demás juntas.                                                                |

## HU-02. Configurar datos generales de la junta

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                                                                       |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CA-02.1 | Evento     | CUANDO el Administrador abra los datos generales, EL SISTEMA DEBERÁ mostrar la información actual de su propia junta.                                                                                        |
| CA-02.2 | Evento     | CUANDO el Administrador guarde datos, sectores o parámetros (multa por inasistencia y cuota anual) válidos de su propia junta, EL SISTEMA DEBERÁ actualizarlos y mostrar “Datos actualizados correctamente”. |
| CA-02.3 | No deseado | SI algún campo obligatorio está vacío, ENTONCES EL SISTEMA DEBERÁ impedir guardar los cambios.                                                                                                               |
| CA-02.4 | No deseado | SI el Administrador intenta eliminar un sector con miembros asignados, ENTONCES EL SISTEMA DEBERÁ rechazar la eliminación.                                                                                   |

## HU-03. Asignar rol de Administrador de la Junta

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                              |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-03.1 | Evento     | CUANDO el Super Administrador pulse “Asignar” con datos válidos, EL SISTEMA DEBERÁ asignar el rol de Administrador de la Junta y mostrarlo en la ficha de la junta. |
| CA-03.2 | Evento     | CUANDO se asigne un Administrador, EL SISTEMA DEBERÁ generar credenciales temporales y exigir el cambio de la contraseña en su primer inicio de sesión.             |
| CA-03.3 | Estado     | MIENTRAS la junta tenga estado “Inactiva”, EL SISTEMA DEBERÁ rechazar la asignación de un Administrador.                                                            |
| CA-03.4 | No deseado | SI el nombre de usuario ya está registrado, ENTONCES EL SISTEMA DEBERÁ impedir la asignación.                                                                       |
| CA-03.5 | Ubicuo     | EL SISTEMA DEBERÁ permitir que un usuario sea Administrador de una sola junta.                                                                                      |

## HU-04. Administrar cuentas de los miembros

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                                                                                       |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-04.1 | Evento     | CUANDO el Administrador seleccione a un miembro de la nómina, le asigne un rol (Secretario/a, Tesorero/a o Miembro / Socio) y un nombre de usuario y pulse “Guardar”, EL SISTEMA DEBERÁ crear la cuenta con estado “Activa”. |
| CA-04.2 | Evento     | CUANDO el Administrador edite una cuenta y modifique su rol, EL SISTEMA DEBERÁ actualizar el rol de la cuenta.                                                                                                               |
| CA-04.3 | No deseado | SI el nombre de usuario ya existe, ENTONCES EL SISTEMA DEBERÁ impedir la creación de la cuenta.                                                                                                                              |
| CA-04.4 | Ubicuo     | EL SISTEMA DEBERÁ desactivar las cuentas en lugar de eliminarlas, para conservar el historial del miembro.                                                                                                                   |

## HU-05. Registrar y mantener nómina de miembros

| N.º     | Patrón     | Criterio de aceptación                                                                                                                    |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| CA-05.1 | Evento     | CUANDO el Secretario/a abra la nómina, EL SISTEMA DEBERÁ mostrar el listado de miembros con buscador por cédula o nombre.                 |
| CA-05.2 | Evento     | CUANDO el Secretario/a pulse “Guardar” con datos válidos, EL SISTEMA DEBERÁ registrar al miembro con estado “Activo” y mostrar la nómina. |
| CA-05.3 | Evento     | CUANDO el Secretario/a edite a un miembro y guarde los cambios, EL SISTEMA DEBERÁ actualizar sus datos en la nómina.                      |
| CA-05.4 | No deseado | SI algún campo obligatorio está vacío, ENTONCES EL SISTEMA DEBERÁ impedir el registro del miembro.                                        |
| CA-05.5 | No deseado | SI la cédula es inválida o ya existe en la junta, ENTONCES EL SISTEMA DEBERÁ mostrar “Cédula inválida o existente”.                       |

## HU-06. Registrar asistencia a Asambleas

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                                                      |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-06.1 | Evento     | CUANDO el Secretario/a abra el registro de asistencia de una asamblea convocada, EL SISTEMA DEBERÁ mostrar los datos de la asamblea (tipo, fecha, hora y lugar) y los miembros activos.     |
| CA-06.2 | Evento     | CUANDO el Secretario/a marque a cada miembro como Presente, Ausente o Justificado y pulse “Guardar Asistencia”, EL SISTEMA DEBERÁ mostrar el resumen de presentes, ausentes y justificados. |
| CA-06.3 | Evento     | CUANDO el Secretario/a pulse “Cerrar Asistencia”, EL SISTEMA DEBERÁ dejar a los ausentes disponibles para la generación de multas.                                                          |
| CA-06.4 | Evento     | CUANDO el Secretario/a marque a un miembro como “Justificado”, EL SISTEMA DEBERÁ permitir describir el motivo.                                                                              |
| CA-06.5 | No deseado | SI se guarda la asistencia sin estado para todos los miembros, ENTONCES EL SISTEMA DEBERÁ mostrar “Existen miembros sin estado de asistencia”.                                              |

## HU-07. Registrar asistencia a Mingas

| N.º     | Patrón     | Criterio de aceptación                                                                                                                            |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-07.1 | Evento     | CUANDO el Secretario/a seleccione una minga programada y su fecha, EL SISTEMA DEBERÁ mostrar a los miembros del padrón para marcar su asistencia. |
| CA-07.2 | Evento     | CUANDO el Secretario/a marque el estado de cada miembro y pulse “Guardar registro”, EL SISTEMA DEBERÁ guardar la asistencia a la minga.           |
| CA-07.3 | Evento     | CUANDO el Secretario/a adjunte una justificación a una falta, EL SISTEMA DEBERÁ asociarla a la asistencia del miembro.                            |
| CA-07.4 | No deseado | SI algún miembro no tiene estado de asistencia, ENTONCES EL SISTEMA DEBERÁ impedir guardar el registro.                                           |

## HU-08. Registrar y mantener predios

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                     |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-08.1 | Evento     | CUANDO se guarde un predio con sus dimensiones, su sector y los demás campos obligatorios, EL SISTEMA DEBERÁ crearlo y mostrarlo en el perfil del miembro. |
| CA-08.2 | No deseado | SI algún campo obligatorio está vacío, ENTONCES EL SISTEMA DEBERÁ impedir guardar el predio.                                                               |
| CA-08.3 | No deseado | SI el predio tiene pagos o multas asociadas, ENTONCES EL SISTEMA DEBERÁ impedir su eliminación.                                                            |

## HU-09. Registrar localización e imagen del predio en mapa

| N.º     | Patrón     | Criterio de aceptación                                                                                                                     |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| CA-09.1 | Evento     | CUANDO el Secretario confirme el punto del predio en el mapa, EL SISTEMA DEBERÁ registrar sus coordenadas.                                 |
| CA-09.2 | Evento     | CUANDO el Secretario suba una imagen del predio y pulse “Guardar ubicación”, EL SISTEMA DEBERÁ asociar la ubicación y la imagen al predio. |
| CA-09.3 | No deseado | SI no se selecciona un punto en el mapa, ENTONCES EL SISTEMA DEBERÁ impedir guardar la ubicación.                                          |
| CA-09.4 | No deseado | SI la imagen no es JPG o supera el tamaño máximo permitido, ENTONCES EL SISTEMA DEBERÁ rechazarla.                                         |

## HU-10. Gestionar calendario y horarios de servicios

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                                |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-10.1 | Evento     | CUANDO se seleccionen servicio, sector, rango de fechas y horas y se pulse “Publicar calendario”, EL SISTEMA DEBERÁ publicar el horario para los miembros del sector. |
| CA-10.2 | No deseado | SI el rango de horas se cruza con otro horario ya publicado para el mismo sector, ENTONCES EL SISTEMA DEBERÁ rechazar la publicación.                                 |
| CA-10.3 | No deseado | SI el horario repite uno ya existente en el calendario, ENTONCES EL SISTEMA DEBERÁ rechazarlo.                                                                        |

## HU-11. Registrar ingresos por pagos

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                                                                                    |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-11.1 | Evento     | CUANDO se seleccionen miembro, año y concepto, se ingresen el monto y el método de pago y se pulse “Guardar cambios”, EL SISTEMA DEBERÁ registrar el ingreso en el estado de cuenta del miembro y generar el comprobante. |
| CA-11.2 | No deseado | SI el monto es igual o menor a cero, ENTONCES EL SISTEMA DEBERÁ impedir guardar el ingreso.                                                                                                                               |
| CA-11.3 | Ubicuo     | EL SISTEMA DEBERÁ permitir solo anular un pago registrado, con justificación, y no eliminarlo.                                                                                                                            |

## HU-12. Generar multas por inasistencia

| N.º     | Patrón | Criterio de aceptación                                                                                                                    |
| ------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| CA-12.1 | Evento | CUANDO el Tesorero/a solicite generar multas de un periodo, EL SISTEMA DEBERÁ listar a los miembros con inasistencias no justificadas.    |
| CA-12.2 | Evento | CUANDO el Tesorero/a confirme la lista y pulse “Generar”, EL SISTEMA DEBERÁ registrar las multas como cuentas por cobrar de los miembros. |
| CA-12.3 | Evento | CUANDO el Tesorero/a excluya a un miembro de la lista, EL SISTEMA DEBERÁ omitirlo en la generación de multas.                             |
| CA-12.4 | Ubicuo | EL SISTEMA DEBERÁ calcular el valor de la multa según el parámetro configurado por la junta, que puede variar entre Asamblea y Minga.     |

## HU-13. Registrar egresos de la junta

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                                                                                            |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-13.1 | Evento     | CUANDO el Tesorero/a abra los egresos, EL SISTEMA DEBERÁ mostrar el formulario “Nuevo Egreso” y el listado del mes.                                                                                                               |
| CA-13.2 | Evento     | CUANDO el Tesorero/a registre un egreso con categoría, descripción, monto, fecha, “pagado a” y comprobante adjunto, EL SISTEMA DEBERÁ registrarlo, descontarlo del saldo de la junta y mostrar “Egreso registrado correctamente”. |
| CA-13.3 | No deseado | SI algún campo obligatorio está vacío, ENTONCES EL SISTEMA DEBERÁ impedir registrar el egreso.                                                                                                                                    |
| CA-13.4 | No deseado | SI el monto es igual o menor a cero, ENTONCES EL SISTEMA DEBERÁ mostrar “El monto debe ser mayor a cero”.                                                                                                                         |
| CA-13.5 | Ubicuo     | EL SISTEMA DEBERÁ exigir un comprobante para todo egreso y permitir solo anularlo, con justificación, sin eliminarlo.                                                                                                             |

## HU-14. Gestionar comprobantes de pago

| N.º     | Patrón     | Criterio de aceptación                                                                                                                               |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-14.1 | Evento     | CUANDO el Tesorero/a seleccione un pago y pulse “Emitir Comprobante”, EL SISTEMA DEBERÁ asignar el número secuencial y emitir el comprobante en PDF. |
| CA-14.2 | Evento     | CUANDO el Tesorero/a anule un comprobante emitido e ingrese el motivo, EL SISTEMA DEBERÁ conservarlo en el historial con su motivo.                  |
| CA-14.3 | No deseado | SI el pago ya tiene comprobante, ENTONCES EL SISTEMA DEBERÁ mostrar “El pago ya cuenta con un comprobante emitido”.                                  |
| CA-14.4 | Ubicuo     | EL SISTEMA DEBERÁ numerar los comprobantes de forma secuencial por junta, sin reutilizar números.                                                    |

## HU-15. Gestionar inventarios

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                                           |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-15.1 | Evento     | CUANDO el Tesorero/a abra el inventario, EL SISTEMA DEBERÁ mostrar los artículos con su stock.                                                                                   |
| CA-15.2 | Evento     | CUANDO el Tesorero/a registre un artículo con nombre, categoría, unidad, cantidad y costo unitario, EL SISTEMA DEBERÁ agregarlo al inventario.                                   |
| CA-15.3 | Evento     | CUANDO el Tesorero/a registre un movimiento de entrada o salida con cantidad y motivo, EL SISTEMA DEBERÁ actualizar el stock del artículo y registrar la fecha y el responsable. |
| CA-15.4 | No deseado | SI algún campo obligatorio está vacío, ENTONCES EL SISTEMA DEBERÁ impedir registrar el artículo.                                                                                 |
| CA-15.5 | No deseado | SI una salida es mayor al stock disponible, ENTONCES EL SISTEMA DEBERÁ mostrar “Stock insuficiente”.                                                                             |

## HU-16. Gestionar activos fijos

| N.º     | Patrón     | Criterio de aceptación                                                                                                            |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| CA-16.1 | Evento     | CUANDO el Tesorero/a abra los activos fijos, EL SISTEMA DEBERÁ mostrar los activos con buscador por código o nombre.              |
| CA-16.2 | Evento     | CUANDO el Tesorero/a guarde un activo con datos válidos, EL SISTEMA DEBERÁ asignarle un código y registrarlo con estado “Activo”. |
| CA-16.3 | Evento     | CUANDO el Tesorero/a dé de baja un activo e ingrese el motivo, EL SISTEMA DEBERÁ conservarlo en el historial sin eliminarlo.      |
| CA-16.4 | No deseado | SI algún campo obligatorio está vacío, ENTONCES EL SISTEMA DEBERÁ impedir registrar el activo.                                    |
| CA-16.5 | No deseado | SI el valor de adquisición es igual o menor a cero, ENTONCES EL SISTEMA DEBERÁ mostrar “Valor de adquisición inválido”.           |

## HU-17. Emitir reportes

| N.º     | Patrón     | Criterio de aceptación                                                                                                                            |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-17.1 | Evento     | CUANDO el Tesorero/a seleccione un tipo y un periodo y pulse “Generar Reporte”, EL SISTEMA DEBERÁ mostrar el reporte con los totales del periodo. |
| CA-17.2 | Evento     | CUANDO el Tesorero/a pulse “Exportar”, EL SISTEMA DEBERÁ descargar el reporte en PDF o Excel.                                                     |
| CA-17.3 | No deseado | SI no se selecciona un tipo o un periodo, ENTONCES EL SISTEMA DEBERÁ impedir generar el reporte.                                                  |
| CA-17.4 | No deseado | SI el periodo no tiene movimientos, ENTONCES EL SISTEMA DEBERÁ mostrar “No existen registros para el periodo seleccionado”.                       |
| CA-17.5 | Ubicuo     | EL SISTEMA DEBERÁ mostrar en los reportes solo la información de la junta a la que pertenece el Tesorero/a.                                       |

## HU-18. Emitir convocatorias a Asamblea General y Mingas

| N.º     | Patrón     | Criterio de aceptación                                                                                                                      |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-18.1 | Evento     | CUANDO el Secretario/a llene la fecha, la hora y el lugar y pulse “Guardar y Publicar”, EL SISTEMA DEBERÁ crear y publicar la convocatoria. |
| CA-18.2 | No deseado | SI algún campo obligatorio está vacío, ENTONCES EL SISTEMA DEBERÁ impedir la publicación de la convocatoria.                                |
| CA-18.3 | Estado     | MIENTRAS la cuenta del Secretario/a esté activa, EL SISTEMA DEBERÁ permitirle emitir convocatorias a Asamblea General y Mingas.             |

## HU-19. Archivar y publicar actas y resoluciones

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                    |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-19.1 | Evento     | CUANDO el Secretario/a ingrese los detalles, suba el archivo y pulse “Guardar y Publicar”, EL SISTEMA DEBERÁ archivar y publicar el acta o la resolución. |
| CA-19.2 | Evento     | CUANDO se archive un documento, EL SISTEMA DEBERÁ mostrarlo en el listado de actas y resoluciones.                                                        |
| CA-19.3 | No deseado | SI algún campo obligatorio está vacío, ENTONCES EL SISTEMA DEBERÁ impedir completar el archivo.                                                           |

## HU-20. Registrar comunicaciones de otras instituciones

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                                              |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-20.1 | Evento     | CUANDO el Secretario/a ingrese la institución emisora, la fecha y el asunto, adjunte el archivo y pulse “Guardar Registro”, EL SISTEMA DEBERÁ registrar y archivar la comunicación. |
| CA-20.2 | Evento     | CUANDO se registre una comunicación, EL SISTEMA DEBERÁ mostrarla en el listado.                                                                                                     |
| CA-20.3 | No deseado | SI algún campo obligatorio está vacío, ENTONCES EL SISTEMA DEBERÁ impedir completar el registro.                                                                                    |

## HU-21. Consultar información individual propia

| N.º     | Patrón     | Criterio de aceptación                                                                                                |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| CA-21.1 | Evento     | CUANDO el socio inicie sesión con sus credenciales individuales, EL SISTEMA DEBERÁ redirigirlo a su perfil.           |
| CA-21.2 | Evento     | CUANDO el socio pulse “Ver Detalle”, EL SISTEMA DEBERÁ desplegar su información completa, limitada a su propia junta. |
| CA-21.3 | No deseado | SI el socio no tiene datos registrados, ENTONCES EL SISTEMA DEBERÁ mostrar que la información no está disponible.     |

## HU-22. Enviar y recibir mensajes

| N.º     | Patrón     | Criterio de aceptación                                                                                                                                                           |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-22.1 | Evento     | CUANDO el usuario seleccione al destinatario, redacte el mensaje (con archivos adjuntos opcionales) y pulse “Enviar Mensaje”, EL SISTEMA DEBERÁ enviarlo y mostrarlo en el chat. |
| CA-22.2 | No deseado | SI el mensaje tiene texto vacío, ENTONCES EL SISTEMA DEBERÁ impedir su envío.                                                                                                    |
| CA-22.3 | Ubicuo     | EL SISTEMA DEBERÁ mantener la comunicación estrictamente dentro de la misma junta y conservar los mensajes en un historial bidireccional.                                        |
