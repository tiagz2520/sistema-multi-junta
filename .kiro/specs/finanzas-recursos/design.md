# Diseño financiero y de recursos

## Decisiones financieras

Importes `numeric(14,2)` y cadenas decimales en REST. Sin valores oficiales predeterminados. Para cada tipo de actividad se aplica la última tarifa con fecha de vigencia no posterior al día de la actividad en `America/Guayaquil`. La tarifa se agrega al historial y el valor de una multa emitida queda fijo. Una obligación por ausencia. Una corrección invalidante sin pago pasa a anulada. Con pago vigente pasa a revisión pendiente, sin reembolso. La anulación exige motivo. Se admiten pagos completos y pagos directos por concepto, con clave de solicitud contra reintentos. El pago, contador y comprobante se registran en una sola transacción. Se conserva el correlativo incluso al anular. El PDF se genera desde un registro fijo y se identifica como interno. La vinculación de cuentas de socios al padrón queda pendiente.

## API financiera

Base `/api/v1/juntas/:juntaId/finanzas`. Las listas son arreglos. Los IDs se devuelven en `id`. La fecha sin hora usa `YYYY-MM-DD`.

| Ruta                                        | Operaciones y campos                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tarifas`                                   | GET, POST `{tipo, vigenteDesde, monto}`. Solo Administrador escribe.                                                                                                                 |
| `multas`                                    | GET de obligaciones. POST `{actividadId, asistenciaIds}` confirma explícitamente las inasistencias elegidas. GET `candidatas?actividadId=...` muestra las ausencias y si hay tarifa. |
| `multas/:id/anular`                         | POST `{motivo}`. Tesorería, con saldo íntegro impago.                                                                                                                                |
| `pagos`                                     | GET, POST `{socioId?, obligacionId?, concepto?, monto, fecha, metodo, solicitudId}`. Una obligación aporta el socio y concepto. Un pago directo requiere socio y concepto.           |
| `pagos/:id/anular`, `pagos/:id/comprobante` | POST `{motivo}` para anular, GET para descargar el PDF y consultar la referencia devuelta con el pago.                                                                               |
| `gastos`                                    | GET, POST multipart `concepto, descripcion, monto, fecha, beneficiario, archivo`. POST `/:id/anular` con `{motivo}` y GET `/:id/archivo` para el respaldo.                           |

## API de recursos

Base `/api/v1/juntas/:juntaId/recursos`. Entidades propias de inventario, patrimonio y territorio. Movimientos de existencias no crean gastos automáticamente. Las cantidades tienen hasta tres decimales y no exceden el stock vigente.

| Ruta          | Operaciones y campos                                                                                                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventario`  | GET/POST `{nombre, categoria, unidad, costoUnitario?}`. GET/PATCH `/:id` para ficha y metadatos. GET/POST `/:id/movimientos` con `{tipo:ENTRADA                                                                                                                                          | SALIDA, cantidad, motivo}`. |
| `activos`     | GET/POST `{codigo?, nombre, descripcion, ubicacion, fechaAdquisicion, valor, vidaUtil?, documento}`. GET/PATCH `/:id` y POST `/:id/baja` con motivo.                                                                                                                                     |
| `propiedades` | GET/POST `{nombre, socioId, sectorId, dimensiones, latitud?, longitud?}`. GET/PATCH `/:id`. PUT `/:id/foto` multipart `archivo` y GET `/:id/foto`. JPEG hasta 2 MiB, acceso autorizado y coordenadas en grados. Visualización local en una cuadrícula geográfica sin servicios externos. |

Las referencias por junta usan FK compuestas. Todos los objetos operativos quedan protegidos por RLS de sesión y rol. Las mutaciones y la auditoría se confirman atómicamente. No se exponen operaciones de eliminación física.
