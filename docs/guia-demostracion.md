# Guía de demostración — Sistema Multi-Junta

## 1. Preparar el entorno (Windows)

Se recomienda Docker Desktop con contenedores Linux, Node.js 24 y npm 11 o superior. Desde la raíz del proyecto:

```powershell
Copy-Item .env.example .env
npm ci
docker compose up -d --wait postgres
docker compose run --rm --no-deps postgres-roles
npm exec --workspace @multi-junta/api -- prisma migrate deploy
docker compose up --build --wait
```

Revisa los secretos y puertos de `.env` antes de iniciarlo. No uses contraseñas de desarrollo en despliegues públicos. La web se abre en `http://127.0.0.1:5173` y la API responde en `http://127.0.0.1:3000/api/v1/health`. Ninguno de estos pasos debe borrar volúmenes.

Si no existe el primer Super Administrador, ejecuta `npm run auth:bootstrap` con `MIGRATION_DATABASE_URL` y las variables `BOOTSTRAP_SUPER_ADMIN_USERNAME` y `BOOTSTRAP_SUPER_ADMIN_PASSWORD` suministradas por el operador en un canal privado. No las guardes en Git. El comando es idempotente.

La rutina `npm run demo:operativo` requiere una base de demostración independiente que comience por `multi_junta_demo_`, la variable `DEMO_ADMIN_DATABASE_URL` y una `DEMO_PASSWORD` sintética. El script rechaza entornos productivos y no sobrescribe datos. Consulta [README](../README.md#demostración-local).

## 2. Roles para la presentación

| Rol                    | Recorrido que debe demostrarse                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Super Administrador    | Alta de junta, estado y asignación del Administrador                                                        |
| Administrador de Junta | Configuración de sectores, tarifas, primera Secretaría, vínculos del padrón y servicios horarios            |
| Secretaría             | Padrón, actividades, asistencia, justificaciones, convocatorias, actas, oficios y horarios                  |
| Tesorería              | Obligaciones, pagos, comprobantes internos, gastos, inventario, activos y reportes financieros              |
| Socio                  | Confirmación de vínculo, su propio portal, convocatoria recibida, horario de su sector y mensajería privada |

No se proporcionan contraseñas incrustadas en esta guía. Todas las credenciales temporales se entregan al destinatario por un canal privado y se cambian al iniciar sesión.

## 3. Recorrido funcional recomendado

1. Iniciar sesión como Super Administrador, crear una junta y asignar su Administrador.
2. El Administrador cambia la clave temporal, elige la junta, registra un sector y habilita Secretaría.
3. Secretaría registra dos socios y crea una minga; registra una ausencia y acepta una justificación.
4. El Administrador define una tarifa válida. Secretaría genera la obligación por una ausencia sin justificar.
5. Tesorería cobra el valor íntegro de la obligación y descarga el PDF interno correlativo. Muestra la diferencia entre un pago vigente y otro anulado.
6. El Administrador abre **Vincular socios**, elige un socio del padrón y crea una invitación para su cuenta o membresía. Copia el código una sola vez y lo entrega por canal privado.
7. El Socio inicia sesión, accede a **Mi portal**, confirma el código y consulta su ficha, asistencias, obligaciones, pagos y PDFs. Se verifica que no pueda leer los de otro socio.
8. Secretaría publica una convocatoria asociada a una asamblea o minga, selecciona los destinatarios y descarga su PDF. Después registra un acta y un oficio como documentos PDF.
9. El Administrador envía un mensaje interno a un Socio y recibe su respuesta. El sistema no incorpora correo, SMS ni WhatsApp externos.
10. El Administrador crea un servicio; Secretaría publica un horario semanal de un sector; el Socio vinculado ve el horario de su propio sector.
11. Secretaría genera un reporte del padrón. Tesorería consulta el resumen financiero, con revisión de obligaciones pendiente separada, y exporta CSV/PDF.

## 4. Verificaciones para el docente

- Crear dos juntas y comprobar que los mismos roles no pueden cruzar información.
- Intentar usar la sesión de una junta en la URL de otra: debe devolver `403`.
- Intentar confirmar una invitación desde otra membresía: debe denegarse.
- Revocar un vínculo activo: la sesión del socio afectado deja de ser válida.
- Descargar una conversación o documento ajeno: el archivo no debe entregarse.
- Registrar dos franjas horarias solapadas para un mismo sector: debe rechazarse.
- Anular un pago: la numeración del comprobante no puede reutilizarse.
- Verificar que el CSV no active fórmulas al abrir campos que empiezan con `=`, `+`, `-` o `@`.

## 5. Pruebas automatizadas

Sobre una base **aislada** cuyo nombre empiece por `multi_junta_test_`, con migraciones aplicadas, variables de acceso correctas y API compilada:

```powershell
npm run format:check
npm run lint
npm run db:validate
npm test
npm run build
npm run test:db:identity
npm run test:db:auth
npm run test:db:platform
npm run test:db:operations
npm run test:e2e:platform
npm run test:e2e:operations
npm run test:e2e:final
```

Las pruebas Chromium utilizan Playwright y deben instalarse sus binarios antes (`npm exec -- playwright install --only-shell chromium`). Las suites de integración usan datos sintéticos y nunca deben apuntar a una base con información real.

## 6. Límites conocidos

- Los pagos de obligaciones cubren el saldo completo; no hay pagos parciales.
- Cuando una multa ya pagada se corrige, su obligación queda en revisión; no se ejecuta un reintegro automático.
- La recuperación de credenciales fuera del flujo inicial aún requiere diseño e implementación.
- La geolocalización se muestra en una cuadrícula local; no se incluye un proveedor cartográfico externo.
- Los documentos son internos y no sustituyen facturas autorizadas por el SRI.
- Los reportes limitan las consultas a 1000 filas por tipo y no incluyen cierres contables oficiales.
- El sistema está preparado para demostración local; un despliegue público exige HTTPS, copias de seguridad, revisión de protección de datos y configuración del proxy, y no se ejecuta automáticamente.
