import {
  api,
  type Alta,
  type Estado,
  type Membresia,
  type RolLocalEditable,
} from '@multi-junta/api-client';
import { useCallback, useState, type FormEvent } from 'react';
import { useCommand, useResource } from '../../shared/api/use-api';
import {
  canonicalUsername,
  ConfirmAction,
  Feedback,
  LoadIssue,
  Pagination,
  roleNames,
  Status,
  TemporaryCredential,
  usernameHint,
} from '../../shared/ui/ui';
import { JuntaSummary } from '../platform/platform-view';

const editableRoles: RolLocalEditable[] = ['SECRETARIA', 'TESORERIA', 'SOCIO'];

export function TenantPage({
  id,
  csrfToken,
  onExpired,
}: {
  id: string;
  csrfToken: string;
  onExpired: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Membresia | null>(null);
  const [alta, setAlta] = useState<Alta | null>(null);
  const juntaResource = useResource(
    useCallback((signal: AbortSignal) => api.tenant.junta(id, signal), [id]),
    onExpired,
  );
  const membersResource = useResource(
    useCallback(
      (signal: AbortSignal) => api.tenant.memberships(id, offset, signal),
      [id, offset],
    ),
    onExpired,
  );
  const secretaryCommand = useCommand(onExpired);

  function addSecretary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const usuario = canonicalUsername(
      String(new FormData(event.currentTarget).get('usuario') ?? ''),
    );
    if (!usuario) {
      secretaryCommand.setError(usernameHint);
      return;
    }
    void secretaryCommand.run(async () => {
      setAlta(await api.tenant.addFirstSecretary(id, usuario, csrfToken));
      juntaResource.update((junta) => ({
        ...junta,
        secretariaInicialDisponible: false,
      }));
      if (offset) setOffset(0);
      else membersResource.reload();
    });
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {juntaResource.state.kind === 'ready'
              ? juntaResource.state.data.nombre
              : 'Mi junta'}
          </h1>
          <p className="muted mt-2">
            Datos de la organización y accesos de sus miembros.
          </p>
        </div>
      </div>
      {juntaResource.state.kind === 'ready' ? (
        <div className="detail-grid">
          <section className="panel form-panel" aria-labelledby="junta-title">
            <h2 id="junta-title">Datos de la junta</h2>
            <JuntaSummary junta={juntaResource.state.data} />
          </section>
          <section
            className="panel form-panel"
            aria-labelledby="secretary-title"
          >
            <h2 id="secretary-title">Secretaría inicial</h2>
            {secretaryCommand.error && (
              <Feedback error>{secretaryCommand.error}</Feedback>
            )}
            {juntaResource.state.data.secretariaInicialDisponible ? (
              <>
                <p className="muted mt-2 mb-4 text-sm">
                  Habilita la primera cuenta de Secretaría de esta junta.
                </p>
                <form className="form-stack" onSubmit={addSecretary}>
                  <label>
                    Usuario de Secretaría
                    <input name="usuario" autoComplete="off" required />
                  </label>
                  <button
                    className="button-primary"
                    type="submit"
                    disabled={secretaryCommand.busy}
                  >
                    {secretaryCommand.busy
                      ? 'Habilitando…'
                      : 'Habilitar Secretaría'}
                  </button>
                </form>
              </>
            ) : (
              <p className="muted mt-2">
                La habilitación inicial ya se utilizó.
              </p>
            )}
          </section>
        </div>
      ) : (
        <LoadIssue
          message={
            juntaResource.state.kind === 'error'
              ? juntaResource.state.message
              : undefined
          }
          onRetry={juntaResource.reload}
        />
      )}
      <section className="panel mt-5" aria-labelledby="members-title">
        <h2 className="panel-heading" id="members-title">
          Membresías
        </h2>
        {membersResource.state.kind === 'ready' ? (
          <>
            {membersResource.state.data.length ? (
              <div className="table-frame">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Usuario</th>
                      <th scope="col">Rol</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {membersResource.state.data.map((member) => (
                      <tr key={member.id}>
                        <th scope="row">{member.usuario}</th>
                        <td>{roleNames[member.rol]}</td>
                        <td>
                          <Status state={member.estado} />
                        </td>
                        <td>
                          {member.rol !== 'ADMIN_JUNTA' ? (
                            <button
                              className="table-link"
                              type="button"
                              onClick={() => setEditing(member)}
                            >
                              Editar
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted px-5 pb-5">
                {offset
                  ? 'No hay más membresías en este listado.'
                  : 'No hay membresías para mostrar.'}
              </p>
            )}
            <Pagination
              offset={offset}
              count={membersResource.state.data.length}
              onChange={(next) => {
                setEditing(null);
                setOffset(next);
              }}
            />
          </>
        ) : (
          <div className="px-5 pb-5">
            <LoadIssue
              message={
                membersResource.state.kind === 'error'
                  ? membersResource.state.message
                  : undefined
              }
              onRetry={membersResource.reload}
            />
          </div>
        )}
      </section>
      {editing && editing.rol !== 'ADMIN_JUNTA' && (
        <MembershipEditor
          key={editing.id}
          id={id}
          member={editing}
          initialRole={editing.rol}
          csrfToken={csrfToken}
          onExpired={onExpired}
          onCancel={() => setEditing(null)}
          onSaved={(result) => {
            membersResource.update((members) =>
              members.map((member) =>
                member.id === result.id ? result : member,
              ),
            );
            setEditing(null);
          }}
        />
      )}
      {alta && (
        <TemporaryCredential alta={alta} onClose={() => setAlta(null)} />
      )}
    </>
  );
}

function MembershipEditor({
  id,
  member,
  initialRole,
  csrfToken,
  onExpired,
  onCancel,
  onSaved,
}: {
  id: string;
  member: Membresia;
  initialRole: RolLocalEditable;
  csrfToken: string;
  onExpired: () => void;
  onCancel: () => void;
  onSaved: (membership: Membresia) => void;
}) {
  const [rol, setRole] = useState(initialRole);
  const [estado, setState] = useState(member.estado);
  const [confirming, setConfirming] = useState(false);
  const command = useCommand(onExpired);
  const changed = rol !== initialRole || estado !== member.estado;

  function save() {
    void command.run(async () => {
      const result = await api.tenant.updateMembership(
        id,
        member.id,
        {
          ...(rol !== initialRole ? { rol } : {}),
          ...(estado !== member.estado ? { estado } : {}),
        },
        csrfToken,
      );
      onSaved(result);
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed) return;

    if (rol !== initialRole || estado === 'INACTIVA') {
      command.setError(null);
      setConfirming(true);
    } else save();
  }

  return (
    <section
      className="panel form-panel mt-5 max-w-2xl"
      aria-labelledby="edit-membership-title"
    >
      <h2 id="edit-membership-title">Editar membresía</h2>
      <p className="muted mt-2 mb-5">
        Usuario <strong>{member.usuario}</strong>
      </p>
      {command.error && !confirming && (
        <Feedback error>{command.error}</Feedback>
      )}
      <form className="form-stack" onSubmit={submit}>
        <label>
          Rol
          <select
            name="rol"
            value={rol}
            onChange={(event) =>
              setRole(event.target.value as RolLocalEditable)
            }
          >
            {editableRoles.map((role) => (
              <option key={role} value={role}>
                {roleNames[role]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select
            name="estado"
            value={estado}
            onChange={(event) => setState(event.target.value as Estado)}
          >
            <option value="ACTIVA">Activa</option>
            <option value="INACTIVA">Inactiva</option>
          </select>
        </label>
        <div className="form-actions">
          <button
            className="button-primary"
            type="submit"
            disabled={command.busy || !changed}
          >
            {command.busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={onCancel}
            disabled={command.busy}
          >
            Cancelar
          </button>
        </div>
      </form>
      {confirming && (
        <ConfirmAction
          title="Confirmar cambios de acceso"
          label="Confirmar cambios"
          message={`El cambio invalida las sesiones de ${member.usuario} para esta junta.`}
          busy={command.busy}
          error={command.error}
          onConfirm={save}
          onClose={() => {
            setConfirming(false);
            command.setError(null);
          }}
        />
      )}
    </section>
  );
}

export function OwnMembershipPage({
  id,
  onExpired,
}: {
  id: string;
  onExpired: () => void;
}) {
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => api.tenant.ownMembership(id, signal),
      [id],
    ),
    onExpired,
  );

  return (
    <>
      <div className="page-heading">
        <h1>Mi membresía</h1>
      </div>
      {resource.state.kind === 'ready' ? (
        <section
          className="panel form-panel max-w-2xl"
          aria-label="Acceso a la junta"
        >
          <dl className="data-grid">
            <div>
              <dt>Rol en la junta</dt>
              <dd>{roleNames[resource.state.data.rol]}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <LoadIssue
          message={
            resource.state.kind === 'error' ? resource.state.message : undefined
          }
          onRetry={resource.reload}
        />
      )}
    </>
  );
}
