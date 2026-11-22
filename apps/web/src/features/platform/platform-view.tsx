import { api, type Alta, type Junta } from '@multi-junta/api-client';
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

export function JuntaSummary({ junta }: { junta: Junta }) {
  return (
    <dl className="data-grid">
      <div>
        <dt>Tipo de organización</dt>
        <dd>{junta.tipo}</dd>
      </div>
      <div>
        <dt>RUC</dt>
        <dd>{junta.ruc ?? 'Sin registrar'}</dd>
      </div>
      <div>
        <dt>Estado</dt>
        <dd>
          <Status state={junta.estado} />
        </dd>
      </div>
    </dl>
  );
}

type PlatformView =
  { kind: 'list' } | { kind: 'new' } | { kind: 'detail'; id: string };

export function PlatformPage({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const [view, setView] = useState<PlatformView>({ kind: 'list' });
  const [offset, setOffset] = useState(0);
  const back = () => setView({ kind: 'list' });
  const open = (id: string) => setView({ kind: 'detail', id });

  if (view.kind === 'new') {
    return (
      <NewJunta
        csrfToken={csrfToken}
        onExpired={onExpired}
        onBack={back}
        onCreated={(id) => {
          setOffset(0);
          open(id);
        }}
      />
    );
  }
  if (view.kind === 'detail') {
    return (
      <PlatformDetail
        key={view.id}
        id={view.id}
        csrfToken={csrfToken}
        onExpired={onExpired}
        onBack={back}
      />
    );
  }
  return (
    <JuntaList
      offset={offset}
      onOffset={setOffset}
      onExpired={onExpired}
      onOpen={open}
      onNew={() => setView({ kind: 'new' })}
    />
  );
}

function JuntaList({
  offset,
  onOffset,
  onExpired,
  onOpen,
  onNew,
}: {
  offset: number;
  onOffset: (offset: number) => void;
  onExpired: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => api.platform.juntas(offset, signal),
      [offset],
    ),
    onExpired,
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Juntas</h1>
          <p className="muted mt-2">
            Registro de juntas y asignación de sus administradores.
          </p>
        </div>
        <button className="button-primary" type="button" onClick={onNew}>
          Nueva junta
        </button>
      </div>
      {resource.state.kind === 'ready' ? (
        <section className="panel" aria-label="Juntas registradas">
          {resource.state.data.length ? (
            <div className="table-frame">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Junta</th>
                    <th scope="col">Tipo de organización</th>
                    <th scope="col">RUC</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.state.data.map((junta) => (
                    <tr key={junta.id}>
                      <th scope="row">
                        <button
                          className="table-link"
                          type="button"
                          onClick={() => onOpen(junta.id)}
                        >
                          {junta.nombre}
                        </button>
                      </th>
                      <td>{junta.tipo}</td>
                      <td>{junta.ruc ?? '—'}</td>
                      <td>
                        <Status state={junta.estado} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6">
              <Feedback>
                {offset
                  ? 'No hay más juntas en este listado.'
                  : 'Aún no hay juntas registradas.'}
              </Feedback>
            </div>
          )}
          <Pagination
            offset={offset}
            count={resource.state.data.length}
            onChange={onOffset}
          />
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

function NewJunta({
  csrfToken,
  onExpired,
  onBack,
  onCreated,
}: {
  csrfToken: string;
  onExpired: () => void;
  onBack: () => void;
  onCreated: (id: string) => void;
}) {
  const command = useCommand(onExpired);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nombre = String(data.get('nombre') ?? '').trim();
    const tipo = String(data.get('tipo') ?? '').trim();
    const ruc = String(data.get('ruc') ?? '').trim();

    if (
      !nombre ||
      !tipo ||
      nombre.length > 120 ||
      tipo.length > 80 ||
      (ruc && !/^[0-9]{13}$/.test(ruc))
    ) {
      command.setError(
        'Ingresa un nombre de hasta 120 caracteres y un tipo de hasta 80. Si registras un RUC, debe tener 13 dígitos.',
      );
      return;
    }

    void command.run(async () => {
      const junta = await api.platform.createJunta(
        { nombre, tipo, ...(ruc ? { ruc } : {}) },
        csrfToken,
      );
      onCreated(junta.id);
    });
  }

  return (
    <>
      <button
        className="back-link"
        type="button"
        onClick={onBack}
        disabled={command.busy}
      >
        ← Volver a juntas
      </button>
      <div className="page-heading">
        <div>
          <h1>Nueva junta</h1>
          <p className="muted mt-2">
            Completa los datos de registro de la organización.
          </p>
        </div>
      </div>
      <section
        className="panel form-panel max-w-2xl"
        aria-label="Datos de nueva junta"
      >
        {command.error && <Feedback error>{command.error}</Feedback>}
        <form className="form-stack" onSubmit={submit}>
          <label>
            Nombre de la junta
            <input name="nombre" required maxLength={120} />
          </label>
          <label>
            Tipo de organización
            <input name="tipo" required maxLength={80} />
          </label>
          <label>
            RUC <span className="label-note">(opcional)</span>
            <input
              name="ruc"
              inputMode="numeric"
              pattern="[0-9]{13}"
              maxLength={13}
              aria-describedby="ruc-hint"
            />
            <span className="label-note" id="ruc-hint">
              13 dígitos
            </span>
          </label>
          <div className="form-actions">
            <button
              className="button-primary"
              type="submit"
              disabled={command.busy}
            >
              {command.busy ? 'Registrando…' : 'Registrar junta'}
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={onBack}
              disabled={command.busy}
            >
              Cancelar
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function PlatformDetail({
  id,
  csrfToken,
  onExpired,
  onBack,
}: {
  id: string;
  csrfToken: string;
  onExpired: () => void;
  onBack: () => void;
}) {
  const resource = useResource(
    useCallback((signal: AbortSignal) => api.platform.junta(id, signal), [id]),
    onExpired,
  );
  const command = useCommand(onExpired);
  const [alta, setAlta] = useState<Alta | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const usuario = canonicalUsername(
      String(new FormData(form).get('usuario') ?? ''),
    );
    if (!usuario) {
      command.setError(usernameHint);
      return;
    }
    void command.run(async () => {
      const result = await api.platform.addAdministrator(
        id,
        usuario,
        csrfToken,
      );
      setAlta(result);
      resource.update((current) => ({
        ...current,
        administradores: [...current.administradores, result.membresia],
      }));
      form.reset();
    });
  }

  const back = (
    <button
      className="back-link"
      type="button"
      onClick={onBack}
      disabled={command.busy}
    >
      ← Volver a juntas
    </button>
  );
  if (resource.state.kind !== 'ready') {
    return (
      <>
        {back}
        <LoadIssue
          message={
            resource.state.kind === 'error' ? resource.state.message : undefined
          }
          onRetry={resource.reload}
        />
      </>
    );
  }

  const junta = resource.state.data;
  const active = junta.estado === 'ACTIVA';
  const changeState = () =>
    command.run(async () => {
      const updated = await api.platform.changeState(
        id,
        active ? 'INACTIVA' : 'ACTIVA',
        csrfToken,
      );
      resource.update((current) => ({ ...current, ...updated }));
      setConfirmDisable(false);
    });

  return (
    <>
      {back}
      <div className="page-heading">
        <div>
          <h1>{junta.nombre}</h1>
          <p className="muted mt-2">
            Ficha de registro y administradores de la junta.
          </p>
        </div>
      </div>
      {command.error && !confirmDisable && (
        <Feedback error>{command.error}</Feedback>
      )}
      <div className="detail-grid">
        <section
          className="panel form-panel"
          aria-labelledby="junta-summary-title"
        >
          <h2 id="junta-summary-title">Datos de la junta</h2>
          <JuntaSummary junta={junta} />
          <button
            className={active ? 'button-danger' : 'button-secondary'}
            type="button"
            disabled={command.busy}
            onClick={() => {
              if (active) {
                command.setError(null);
                setConfirmDisable(true);
              } else void changeState();
            }}
          >
            {active ? 'Desactivar junta' : 'Reactivar junta'}
          </button>
        </section>
        {active && (
          <section className="panel form-panel" aria-labelledby="assign-title">
            <h2 id="assign-title">Asignar administrador</h2>
            <p className="muted mt-2 mb-4 text-sm">
              Se genera una credencial temporal para la nueva cuenta.
            </p>
            <form className="form-stack" onSubmit={assign}>
              <label>
                Usuario del administrador
                <input
                  name="usuario"
                  autoComplete="off"
                  required
                  aria-describedby="admin-user-hint"
                />
              </label>
              <p className="muted text-sm" id="admin-user-hint">
                {usernameHint}
              </p>
              <button
                className="button-primary"
                type="submit"
                disabled={command.busy}
              >
                {command.busy ? 'Procesando…' : 'Asignar administrador'}
              </button>
            </form>
          </section>
        )}
      </div>
      <section className="panel mt-5" aria-labelledby="administrators-title">
        <h2 className="panel-heading" id="administrators-title">
          Administradores
        </h2>
        {junta.administradores.length ? (
          <div className="table-frame">
            <table>
              <thead>
                <tr>
                  <th scope="col">Usuario</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {junta.administradores.map((member) => (
                  <tr key={member.id}>
                    <th scope="row">{member.usuario}</th>
                    <td>{roleNames[member.rol]}</td>
                    <td>
                      <Status state={member.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted px-5 pb-5">
            Esta junta aún no tiene administradores asignados.
          </p>
        )}
      </section>
      {confirmDisable && (
        <ConfirmAction
          title="Desactivar junta"
          label="Confirmar desactivación"
          message={`Se invalidarán las sesiones de ${junta.nombre}. Los datos y el historial se conservarán.`}
          busy={command.busy}
          error={command.error}
          onConfirm={() => void changeState()}
          onClose={() => {
            setConfirmDisable(false);
            command.setError(null);
          }}
        />
      )}
      {alta && (
        <TemporaryCredential alta={alta} onClose={() => setAlta(null)} />
      )}
    </>
  );
}
