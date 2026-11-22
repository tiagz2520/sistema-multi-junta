import { api, type Sesion } from '@multi-junta/api-client';
import type { FormEvent, ReactNode } from 'react';
import { useCommand, useResource } from '../../shared/api/use-api';
import { Brand, Feedback, LoadIssue, roleNames } from '../../shared/ui/ui';

export function AccessLayout({ children }: { children: ReactNode }) {
  return (
    <div className="access-layout">
      <aside className="access-brand" aria-label="Sistema Multi-Junta">
        <Brand />
        <div className="access-brand-copy">
          <p>
            Juntas parroquiales
            <br />y comunitarias
          </p>
          <span>Ecuador</span>
        </div>
        <a href="/estado" className="access-health">
          Estado del sistema <span aria-hidden="true">↗</span>
        </a>
      </aside>
      <main className="access-main" id="contenido">
        {children}
      </main>
    </div>
  );
}

export function LoginView({
  onLogin,
  notice,
}: {
  onLogin: (session: Sesion) => void;
  notice: string | null;
}) {
  const command = useCommand();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = form.elements.namedItem('contrasena');
    if (password instanceof HTMLInputElement) password.value = '';

    void command.run(async () => {
      const session = await api.auth.login(
        String(data.get('usuario') ?? ''),
        String(data.get('contrasena') ?? ''),
      );
      onLogin(session);
    });
  }

  return (
    <AccessLayout>
      <section className="access-card" aria-labelledby="login-title">
        <h1 id="login-title">Iniciar sesión</h1>
        <p className="muted mt-2 mb-7">
          Ingresa con la cuenta que te fue asignada.
        </p>
        {notice && <Feedback>{notice}</Feedback>}
        {command.error && <Feedback error>{command.error}</Feedback>}
        <form className="form-stack" onSubmit={submit}>
          <label>
            Usuario
            <input
              name="usuario"
              autoComplete="username"
              required
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <label>
            Contraseña
            <input
              name="contrasena"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button
            className="button-primary mt-2"
            type="submit"
            disabled={command.busy}
          >
            {command.busy ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>
      </section>
    </AccessLayout>
  );
}

export function PasswordView({
  session,
  onChanged,
  onLogout,
  sessionError,
}: {
  session: Sesion;
  onChanged: () => void;
  onLogout: () => void;
  sessionError: string | null;
}) {
  const command = useCommand();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const next = String(data.get('nuevaContrasena') ?? '');
    if (next !== data.get('confirmarContrasena')) {
      command.setError('Las contraseñas nuevas deben coincidir.');
      return;
    }

    form.reset();
    void command.run(async () => {
      await api.auth.changePassword(
        String(data.get('contrasenaActual') ?? ''),
        next,
        session.csrfToken,
      );
      onChanged();
    });
  }

  return (
    <AccessLayout>
      <section className="access-card" aria-labelledby="password-title">
        <h1 id="password-title">Cambia tu contraseña</h1>
        <p className="muted mt-2 mb-7">
          Elige una contraseña nueva de al menos 12 caracteres. Luego vuelve a
          iniciar sesión.
        </p>
        {(command.error ?? sessionError) && (
          <Feedback error>{command.error ?? sessionError}</Feedback>
        )}
        <form className="form-stack" onSubmit={submit}>
          <label>
            Contraseña actual
            <input
              name="contrasenaActual"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            Nueva contraseña
            <input
              name="nuevaContrasena"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <label>
            Confirmar contraseña
            <input
              name="confirmarContrasena"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <button
            className="button-primary mt-2"
            type="submit"
            disabled={command.busy}
          >
            {command.busy ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={onLogout}
            disabled={command.busy}
          >
            Cerrar sesión
          </button>
        </form>
      </section>
    </AccessLayout>
  );
}

export function ContextView({
  session,
  canUsePlatform,
  onSelect,
  onExpired,
  onBack,
  onLogout,
  sessionError,
}: {
  session: Sesion;
  canUsePlatform: boolean;
  onSelect: (session: Sesion) => void;
  onExpired: () => void;
  onBack?: () => void;
  onLogout: () => void;
  sessionError: string | null;
}) {
  const resource = useResource(api.auth.contexts, onExpired);
  const command = useCommand(onExpired);
  const choose = (id: string | null) =>
    command.run(async () => {
      onSelect(await api.auth.switchContext(id, session.csrfToken));
    });

  return (
    <AccessLayout>
      <section className="access-card" aria-labelledby="context-title">
        <h1 id="context-title">Elige un espacio</h1>
        <p className="muted mt-2 mb-6">
          Selecciona la junta en la que deseas trabajar.
        </p>
        {(command.error ?? sessionError) && (
          <Feedback error>{command.error ?? sessionError}</Feedback>
        )}
        {resource.state.kind === 'ready' ? (
          <ul className="context-list">
            {canUsePlatform && (
              <li>
                <button
                  type="button"
                  disabled={command.busy}
                  onClick={() => void choose(null)}
                >
                  <strong>Plataforma</strong>
                  <span>Super Administrador</span>
                </button>
              </li>
            )}
            {resource.state.data.map((context) => (
              <li key={context.juntaId}>
                <button
                  type="button"
                  aria-label={context.nombre}
                  disabled={command.busy}
                  onClick={() => void choose(context.juntaId)}
                >
                  <strong>{context.nombre}</strong>
                  <span>{roleNames[context.rol]}</span>
                </button>
              </li>
            ))}
            {!canUsePlatform && !resource.state.data.length && (
              <li>
                <Feedback>
                  Tu cuenta no tiene juntas activas disponibles.
                </Feedback>
              </li>
            )}
          </ul>
        ) : (
          <LoadIssue
            message={
              resource.state.kind === 'error'
                ? resource.state.message
                : undefined
            }
            onRetry={resource.reload}
          />
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          {onBack && (
            <button
              className="button-secondary"
              type="button"
              disabled={command.busy}
              onClick={onBack}
            >
              Volver
            </button>
          )}
          <button
            className="button-link"
            type="button"
            disabled={command.busy}
            onClick={onLogout}
          >
            Cerrar sesión
          </button>
        </div>
      </section>
    </AccessLayout>
  );
}
