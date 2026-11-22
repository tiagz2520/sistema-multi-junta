import {
  api,
  type Invitacion,
  type Membresia,
  type PropiedadPropia,
  type Socio,
} from '@multi-junta/api-client';
import { useCallback, useEffect, useState } from 'react';
import { useCommand, useResource } from '../../shared/api/use-api';
import {
  ActionForm,
  Choice,
  dateLabel,
  download,
  Field,
  input,
  type ModuleProps,
  PageTitle,
  Records,
  Resource,
  Section,
  stateLabel,
  timeLabel,
  money,
} from '../../shared/ui/records';
import { Feedback } from '../../shared/ui/ui';
import { PropertyMap } from '../../shared/ui/property-map';

function LinkStatus({ status }: { status: string }) {
  return <span className="muted">{stateLabel(status)}</span>;
}

export function PortalAdminPage({
  juntaId,
  csrfToken,
  onExpired,
}: ModuleProps) {
  const [creating, setCreating] = useState(false);
  const [delivery, setDelivery] = useState<Invitacion | null>(null);
  const [memberMode, setMemberMode] = useState<'existente' | 'nuevo'>('nuevo');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const revoke = useCommand(onExpired);
  const links = useResource(
    useCallback(
      (signal: AbortSignal) => api.portal.links(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const members = useResource(
    useCallback(
      (signal: AbortSignal) => api.tenant.memberships(juntaId, 0, signal),
      [juntaId],
    ),
    onExpired,
  );
  const people = useResource(
    useCallback(
      (signal: AbortSignal) => api.administration.socios(juntaId, {}, signal),
      [juntaId],
    ),
    onExpired,
  );
  const linkedSocios = new Set(
    links.state.kind === 'ready'
      ? links.state.data
          .filter((v) => v.estado === 'ACTIVO' || v.estado === 'PENDIENTE')
          .map((v) => v.socioId)
      : [],
  );
  const linkedMembers = new Set(
    links.state.kind === 'ready'
      ? links.state.data
          .filter((v) => v.estado === 'ACTIVO' || v.estado === 'PENDIENTE')
          .map((v) => v.membresiaId)
      : [],
  );
  const eligiblePeople: Socio[] =
    people.state.kind === 'ready'
      ? people.state.data.filter(
          (v) => v.estado === 'ACTIVA' && !linkedSocios.has(v.id),
        )
      : [];
  const eligibleMembers: Membresia[] =
    members.state.kind === 'ready'
      ? members.state.data.filter(
          (v) =>
            v.rol === 'SOCIO' &&
            v.estado === 'ACTIVA' &&
            !linkedMembers.has(v.id),
        )
      : [];

  return (
    <>
      <PageTitle
        title="Vinculación de socios"
        description="Autoriza el acceso personal a datos del padrón mediante una invitación de un solo uso."
        action={
          <button
            className="button-primary"
            type="button"
            onClick={() => {
              setDelivery(null);
              setCreating((v) => !v);
            }}
          >
            {creating ? 'Cerrar formulario' : 'Nueva invitación'}
          </button>
        }
      />
      {delivery && (
        <Section title="Entrega privada de invitación">
          <Feedback>
            Este código solo aparece aquí. Comprueba la identidad del
            destinatario y entrégalo por un canal privado.
          </Feedback>
          <p className="muted mt-2">
            Código de confirmación (válido durante 24 horas)
          </p>
          <p className="credential-value">{delivery.codigo}</p>
          {delivery.contrasenaTemporal && (
            <>
              <p className="muted">Contraseña temporal de la cuenta nueva</p>
              <p className="credential-value">{delivery.contrasenaTemporal}</p>
            </>
          )}
          <p className="muted">Membresía asignada: {delivery.membresiaId}</p>
          <button
            className="button-secondary mt-3"
            type="button"
            onClick={() => setDelivery(null)}
          >
            Cerrar credenciales
          </button>
        </Section>
      )}
      {creating && (
        <Section title="Invitar a un socio del padrón">
          <Feedback>
            La cuenta debe confirmar la invitación tras iniciar sesión; conocer
            la cédula no habilita el acceso.
          </Feedback>
          <ActionForm
            label="Crear invitación"
            onExpired={onExpired}
            onCancel={() => setCreating(false)}
            onSubmit={async (form) => {
              const socioId = input(form, 'socioId');
              const invited = await api.portal.invite(
                juntaId,
                memberMode === 'nuevo'
                  ? { socioId, usuario: input(form, 'usuario') }
                  : { socioId, membresiaId: input(form, 'membresiaId') },
                csrfToken,
              );
              setDelivery(invited);
              setCreating(false);
              links.reload();
              members.reload();
            }}
          >
            <Choice
              name="socioId"
              label="Socio verificado"
              options={eligiblePeople.map((p) => ({
                id: p.id,
                label: `${p.apellidos} ${p.nombres} — ${p.cedula ?? '—'}`,
              }))}
            />
            <label>
              Cuenta de acceso
              <select
                value={memberMode}
                onChange={(e) =>
                  setMemberMode(e.target.value as 'existente' | 'nuevo')
                }
              >
                <option value="nuevo">Crear cuenta nueva</option>
                <option value="existente">
                  Vincular membresía Socio activa
                </option>
              </select>
            </label>
            {memberMode === 'nuevo' ? (
              <Field
                name="usuario"
                label="Nombre de usuario nuevo"
                pattern="[A-Za-z0-9._-]{3,32}"
                maxLength={32}
              />
            ) : (
              <Choice
                name="membresiaId"
                label="Membresía Socio"
                options={eligibleMembers.map((m) => ({
                  id: m.id,
                  label: m.usuario,
                }))}
              />
            )}
          </ActionForm>
        </Section>
      )}
      <Section title="Vínculos e invitaciones">
        <Resource resource={links}>
          {(rows) => (
            <Records
              rows={rows}
              columns={[
                {
                  title: 'Socio',
                  value: (r) => {
                    const person =
                      people.state.kind === 'ready'
                        ? people.state.data.find(
                            (item) => item.id === r.socioId,
                          )
                        : undefined;
                    return person
                      ? `${person.nombres} ${person.apellidos}`
                      : 'Socio del padrón';
                  },
                },
                {
                  title: 'Cuenta',
                  value: (r) => {
                    const member =
                      members.state.kind === 'ready'
                        ? members.state.data.find(
                            (item) => item.id === r.membresiaId,
                          )
                        : undefined;
                    return member?.usuario ?? 'Membresía de socio';
                  },
                },
                {
                  title: 'Estado',
                  value: (r) => <LinkStatus status={r.estado} />,
                },
                { title: 'Vence', value: (r) => timeLabel(r.venceEn) },
                {
                  title: 'Acción',
                  value: (r) =>
                    r.estado === 'ACTIVO' || r.estado === 'PENDIENTE' ? (
                      <button
                        className="table-link"
                        type="button"
                        onClick={() => {
                          setRevoking(r.id);
                          setReason('');
                          revoke.setError(null);
                        }}
                      >
                        Revocar
                      </button>
                    ) : (
                      '—'
                    ),
                },
              ]}
              empty="No existen vínculos ni invitaciones."
            />
          )}
        </Resource>
        {revoking && (
          <div className="form-stack">
            <p>
              La revocación de un vínculo activo invalida la sesión del socio.
            </p>
            <label>
              Motivo
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={1}
                maxLength={500}
                rows={2}
              />
            </label>
            {revoke.error && <Feedback error>{revoke.error}</Feedback>}
            <div className="form-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setRevoking(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={revoke.busy || !reason.trim()}
                onClick={() =>
                  void revoke.run(async () => {
                    await api.portal.revoke(
                      juntaId,
                      revoking,
                      reason,
                      csrfToken,
                    );
                    setRevoking(null);
                    links.reload();
                  })
                }
              >
                Confirmar revocación
              </button>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}

function PrivatePropertyPhoto({
  juntaId,
  propertyId,
  nombre,
  onExpired,
}: {
  juntaId: string;
  propertyId: string;
  nombre: string;
  onExpired: () => void;
}) {
  const photo = useResource(
    useCallback(
      (signal: AbortSignal) =>
        api.portal.propertyPhoto(juntaId, propertyId, signal),
      [juntaId, propertyId],
    ),
    onExpired,
  );
  const [imageUrl, setImageUrl] = useState('');
  const blob = photo.state.kind === 'ready' ? photo.state.data : null;
  useEffect(() => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    setImageUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return (
    <Resource resource={photo}>
      {() =>
        imageUrl ? (
          <img
            className="property-photo"
            src={imageUrl}
            alt={`Fotografía de ${nombre}`}
          />
        ) : (
          <p className="muted">Preparando fotografía…</p>
        )
      }
    </Resource>
  );
}

function MemberProperty({
  property,
  juntaId,
  onExpired,
}: {
  property: PropiedadPropia;
  juntaId: string;
  onExpired: () => void;
}) {
  return (
    <article className="panel form-panel mb-4">
      <h3 className="mb-3">{property.nombre}</h3>
      <dl className="data-grid">
        <div>
          <dt>Dimensiones</dt>
          <dd>{property.dimensiones}</dd>
        </div>
        <div>
          <dt>Sector asignado</dt>
          <dd>{property.sectorNombre ?? 'No disponible'}</dd>
        </div>
      </dl>
      <PropertyMap
        nombre={property.nombre}
        latitud={property.latitud}
        longitud={property.longitud}
      />
      {property.tieneFoto && (
        <div className="mt-3">
          <PrivatePropertyPhoto
            juntaId={juntaId}
            propertyId={property.id}
            nombre={property.nombre}
            onExpired={onExpired}
          />
        </div>
      )}
    </article>
  );
}

export function PortalMemberPage({
  juntaId,
  csrfToken,
  onExpired,
}: ModuleProps) {
  const [code, setCode] = useState('');
  const confirm = useCommand(onExpired);
  const profile = useResource(
    useCallback(
      (signal: AbortSignal) => api.portal.profile(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const properties = useResource(
    useCallback(
      (signal: AbortSignal) => api.portal.properties(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const attendance = useResource(
    useCallback(
      (signal: AbortSignal) => api.portal.attendance(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const obligations = useResource(
    useCallback(
      (signal: AbortSignal) => api.portal.obligations(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const payments = useResource(
    useCallback(
      (signal: AbortSignal) => api.portal.payments(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const receipt = useCommand(onExpired);
  return (
    <>
      <PageTitle
        title="Mi portal"
        description="Consulta tus datos, asistencias, obligaciones y comprobantes de esta junta."
      />
      <Resource resource={profile}>
        {({ perfil }) =>
          perfil ? (
            <Section title="Mi ficha">
              <p>
                <strong>
                  {perfil.nombres} {perfil.apellidos}
                </strong>
              </p>
              <p>Cédula: {perfil.cedula}</p>
              <p>Sector: {perfil.sectorNombre ?? 'Sin sector asignado'}</p>
            </Section>
          ) : (
            <Section title="Confirmar mi invitación">
              <Feedback>
                Para mostrar tus datos, primero confirma el código que te
                entregó el administrador.
              </Feedback>
              {confirm.error && <Feedback error>{confirm.error}</Feedback>}
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void confirm.run(async () => {
                    await api.portal.confirm(juntaId, code, csrfToken);
                    setCode('');
                    profile.reload();
                    properties.reload();
                    attendance.reload();
                    obligations.reload();
                    payments.reload();
                  });
                }}
              >
                <label>
                  Código de invitación
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.trim())}
                    pattern="[A-Za-z0-9_-]{43}"
                    maxLength={43}
                    required
                  />
                </label>
                <button
                  className="button-primary"
                  disabled={confirm.busy}
                  type="submit"
                >
                  Confirmar vínculo
                </button>
              </form>
            </Section>
          )
        }
      </Resource>
      <Section title="Mis predios y recursos asignados">
        <Resource resource={properties}>
          {(rows) =>
            rows.length ? (
              rows.map((property) => (
                <MemberProperty
                  key={property.id}
                  property={property}
                  juntaId={juntaId}
                  onExpired={onExpired}
                />
              ))
            ) : (
              <Feedback>
                No tienes predios o recursos activos asignados en esta junta.
              </Feedback>
            )
          }
        </Resource>
      </Section>
      <Section title="Mis asistencias">
        <Resource resource={attendance}>
          {(rows) => (
            <Records
              rows={rows}
              columns={[
                { title: 'Actividad', value: (r) => r.titulo },
                {
                  title: 'Tipo',
                  value: (r) => (r.tipo === 'MINGA' ? 'Minga' : 'Asamblea'),
                },
                { title: 'Fecha', value: (r) => timeLabel(r.inicio) },
                { title: 'Asistencia', value: (r) => stateLabel(r.estado) },
              ]}
            />
          )}
        </Resource>
      </Section>
      <Section title="Mis obligaciones">
        <Resource resource={obligations}>
          {(rows) => (
            <Records
              rows={rows}
              columns={[
                { title: 'Concepto', value: (r) => r.concepto },
                { title: 'Importe', value: (r) => money(r.monto) },
                { title: 'Estado', value: (r) => stateLabel(r.estado) },
                { title: 'Fecha', value: (r) => timeLabel(r.creadaEn) },
              ]}
            />
          )}
        </Resource>
      </Section>
      <Section title="Mis pagos y comprobantes">
        {receipt.error && <Feedback error>{receipt.error}</Feedback>}
        <Resource resource={payments}>
          {(rows) => (
            <Records
              rows={rows}
              columns={[
                { title: 'Comprobante', value: (r) => r.numeroComprobante },
                { title: 'Fecha', value: (r) => dateLabel(r.fecha) },
                { title: 'Importe', value: (r) => money(r.monto) },
                { title: 'Estado', value: (r) => stateLabel(r.estado) },
                {
                  title: 'Descargar',
                  value: (r) => (
                    <button
                      className="table-link"
                      type="button"
                      disabled={receipt.busy}
                      onClick={() =>
                        void receipt.run(async () => {
                          download(
                            await api.portal.receipt(juntaId, r.id),
                            `comprobante-${r.numeroComprobante}.pdf`,
                          );
                        })
                      }
                    >
                      PDF
                    </button>
                  ),
                },
              ]}
            />
          )}
        </Resource>
      </Section>
    </>
  );
}
