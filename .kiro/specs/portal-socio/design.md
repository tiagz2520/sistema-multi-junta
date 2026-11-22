# Diseño del Portal del Socio

Todas las rutas se exponen bajo `/api/v1/juntas/:juntaId/portal`. El acceso personalizado se resuelve en PostgreSQL mediante `portal_socio_actual(uuid)`, que exige sesión de rol Socio válida, vínculo activo y registro de padrón `ACTIVA`. No hay parámetros de socio arbitrarios en las consultas propias; los documentos se autorizan en la misma transacción.

| Ruta                         | Contrato y autoridad                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /vinculos`              | Administrador obtiene `id`, `socioId`, `membresiaId`, estado, vigencia y datos de revocación; jamás el código secreto.                                                                                   |
| `POST /invitaciones`         | Administrador aporta `socioId` y exactamente uno de `membresiaId` (Socio existente) o `usuario` (nueva cuenta). Recibe `id`, `codigo`, `venceEn`, `membresiaId` y, si corresponde, `contrasenaTemporal`. |
| `POST /confirmar`            | La cuenta Socio autenticada presenta `codigo`. Retorna `id`, `socioId`, `membresiaId` y `estado`.                                                                                                        |
| `POST /vinculos/:id/revocar` | Administrador aporta `motivo`; revoca, audita e incrementa la versión de la membresía cuando corresponda.                                                                                                |
| `GET /perfil`                | Objeto JSON `{perfil: {...}}`, donde `perfil` es una ficha con `id`, `nombres`, `apellidos`, `cedula`, `sectorId` y `sectorNombre`, o `null` si todavía no hay vínculo.                                  |
| `GET /asistencias`           | Actividades, fechas y asistencia del Socio titular.                                                                                                                                                      |
| `GET /obligaciones`          | Obligaciones propias, importes exactos como cadenas, estados y revisiones.                                                                                                                               |
| `GET /pagos`                 | Movimientos propios y números de comprobante.                                                                                                                                                            |
| `GET /pagos/:id/comprobante` | Descarga PDF de un pago cuyo titular coincide con el Socio vinculado.                                                                                                                                    |

El código de invitación es aleatorio de 256 bits, su huella SHA-256 se almacena durante como máximo 24 horas y se muestra al operador una única vez tras la creación. La membresía designada debe confirmar desde su sesión autenticada. No se vinculan identidades por cédula, usuario o nombre coincidente. El cambio de titular requiere revocar la vinculación anterior y generar otra invitación. Las cookies usan HttpOnly y los formularios no guardan los códigos en almacenamiento persistente.

La base mantiene `membresia`, `socio` y `socio_vinculo` con claves compuestas por junta y políticas FORCE RLS. La concesión especial de actualización de `version_acceso` solo se efectúa a través de la rutina de identidad autorizada. Mensajes y convocatorias siguen sus propias reglas por destinatario y participante.
