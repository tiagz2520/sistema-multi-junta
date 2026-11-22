# Diseño de gestión de plataforma y juntas

## Límites de confianza

Las guardas NestJS exigen sesiones `PLATAFORMA` con `SUPER_ADMIN` para el registro global y sesiones `JUNTA` con `ADMIN_JUNTA` para la administración local. Las mutaciones verifican CSRF antes de validar la sesión. Para operaciones locales se contrasta el UUID solicitado con la sesión y se abre la transacción `TenantUnitOfWork` a partir de la junta autenticada. Las rutinas PostgreSQL vuelven a validar la huella, estado, rol y ámbito. Las mutaciones bloquean las filas que determinan la autorización y la junta objetivo mientras efectúan el cambio. Los estados y roles conservan la invalidación por versión de 1B.3.

La API solo ejecuta firmas acotadas con `SECURITY DEFINER`. Se mantiene `multi_junta_identity` sin `LOGIN`, sin `BYPASSRLS` y sin propiedad de las tablas, con `search_path` fijo y acceso por columnas. Las tablas locales siguen bajo RLS forzada. Las funciones de gestión devuelven metadatos y requieren sesión válida. El hash de credenciales queda en la API interna de autenticación y no se concede lectura directa de tablas a `multi_junta_app`. El límite de intentos usa la IP de conexión. Bajo proxy la cuota puede compartirse y el borde de despliegue se encarga del límite por IP de cliente. El backend conserva el control por nombre de usuario.

Las nuevas cuentas usan una contraseña aleatoria de 32 caracteres, codificada en base64url. La API genera el hash antes de abrir la transacción y devuelve la contraseña en el alta confirmada. Su vigencia termina con el cambio obligatorio, que revoca las sesiones preliminares. El vencimiento independiente de credenciales aún sin utilizar y la recuperación se estudiarán con el flujo de reposición. La auditoría registra actor, junta, objetivo y evento, sin contraseñas, hashes ni tokens. La primera Secretaría consume una marca única basada en el evento persistente por junta y conserva esa marca tras cualquier cambio de rol o estado.

## Contratos REST de 1C

Rutas relativas a `/api/v1`. Las listas devuelven un arreglo de hasta 25 registros y aceptan `offset` desde cero.

| Método y ruta                                      | Datos                                                 |
| -------------------------------------------------- | ----------------------------------------------------- |
| `GET /plataforma/juntas`                           | `Junta[]`                                             |
| `POST /plataforma/juntas`                          | `{nombre, tipo, ruc?}` → `Junta`                      |
| `GET /plataforma/juntas/:juntaId`                  | `Junta` con `administradores: Membresia[]`            |
| `PATCH /plataforma/juntas/:juntaId/estado`         | `{estado}` → `Junta`                                  |
| `POST /plataforma/juntas/:juntaId/administradores` | `{usuario}` → `Alta`                                  |
| `GET /juntas/:juntaId`                             | `Junta` con `secretariaInicialDisponible`             |
| `GET /juntas/:juntaId/membresias`                  | `Membresia[]`                                         |
| `PATCH /juntas/:juntaId/membresias/:id`            | `{rol?, estado?}` con al menos un campo → `Membresia` |
| `POST /juntas/:juntaId/secretaria-inicial`         | `{usuario}` → `Alta`                                  |

- `Junta` contiene `id`, `nombre`, `tipo`, `ruc` anulable y `estado`.
- `Membresia` contiene `id`, `cuentaId`, `usuario`, `rol` y `estado`.
- `Alta` contiene `membresia` y `contrasenaTemporal`, solo en la respuesta de creación.
- Usar `401` para sesión inválida, `403` para ámbito, rol o CSRF, `404` para recurso ausente dentro del ámbito permitido, `409` para conflicto de integridad o estado y `400` para entrada inválida.

## Interfaz

React 18 consume la API del mismo origen. La cookie `HttpOnly` viaja con las peticiones y el CSRF se conserva solo en memoria. Se recupera la sesión al recargar. El navegador interpreta el ámbito para renderizar el panel de Plataforma o la junta autorizada. Cuentas preliminares cambian la contraseña o seleccionan ámbito antes de operar. La contraseña temporal solo se presenta en el resultado puntual del alta y se descarta al cerrarlo, cambiar de ámbito o cerrar sesión.
