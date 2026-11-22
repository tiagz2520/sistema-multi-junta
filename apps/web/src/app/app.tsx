import { api, ApiError, type Sesion } from '@multi-junta/api-client';
import { useCallback, useEffect, useState } from 'react';
import {
  AccessLayout,
  ContextView,
  LoginView,
  PasswordView,
} from '../features/identity/identity-views';
import { PlatformPage } from '../features/platform/platform-view';
import { useCommand } from '../shared/api/use-api';
import { Brand, Feedback, LoadIssue, roleNames } from '../shared/ui/ui';
import { HealthPage } from './health-page';
import {
  JuntaWorkspace,
  juntaNavigation,
  type JuntaPageId,
} from './junta-workspace';

type AuthState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'anonymous'; notice: string | null }
  | { kind: 'active'; session: Sesion; canUsePlatform: boolean };

export function App() {
  return window.location.pathname === '/estado' ? (
    <HealthPage />
  ) : (
    <SessionApp />
  );
}

function SessionApp() {
  const [auth, setAuth] = useState<AuthState>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [workspace, setWorkspace] = useState(0);
  const [localPage, setLocalPage] = useState<JuntaPageId | null>(null);
  const session = auth.kind === 'active' ? auth.session : null;

  const activate = useCallback((next: Sesion, switching = false) => {
    setAuth((previous) => ({
      kind: 'active',
      session: next,
      canUsePlatform:
        next.rol === 'SUPER_ADMIN' ||
        (switching &&
          previous.kind === 'active' &&
          previous.session.cuentaId === next.cuentaId &&
          previous.canUsePlatform),
    }));
    setChoosing(false);
    setLocalPage(null);
    setWorkspace((previous) => previous + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void api.auth.session(controller.signal).then(
      (next) => {
        if (!controller.signal.aborted) activate(next);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          setAuth({ kind: 'anonymous', notice: null });
        } else {
          const message =
            error instanceof ApiError
              ? error.message
              : 'No pudimos comprobar la sesión.';
          setAuth({ kind: 'error', message });
        }
      },
    );
    return () => controller.abort();
  }, [activate, revision]);

  const onExpired = useCallback(() => {
    setAuth((previous) =>
      previous.kind === 'active' && previous.session === session
        ? {
            kind: 'anonymous',
            notice: 'La sesión terminó. Vuelve a iniciar sesión.',
          }
        : previous,
    );
  }, [session]);

  const logout = useCommand(onExpired);
  function closeSession() {
    if (!session) return;
    void logout.run(async () => {
      await api.auth.logout(session.csrfToken);
      setAuth({ kind: 'anonymous', notice: null });
      setChoosing(false);
    });
  }

  if (auth.kind === 'loading' || logout.busy || auth.kind === 'error') {
    return (
      <AccessLayout>
        <div className="access-card">
          <LoadIssue
            message={auth.kind === 'error' ? auth.message : undefined}
            onRetry={() => {
              setAuth({ kind: 'loading' });
              setRevision((previous) => previous + 1);
            }}
          />
        </div>
      </AccessLayout>
    );
  }

  if (auth.kind === 'anonymous') {
    return <LoginView onLogin={activate} notice={auth.notice} />;
  }

  const active = auth.session;
  if (active.requiereCambioContrasena) {
    return (
      <PasswordView
        session={active}
        onChanged={() =>
          setAuth({
            kind: 'anonymous',
            notice: 'Contraseña actualizada. Ingresa con tu nueva contraseña.',
          })
        }
        onLogout={closeSession}
        sessionError={logout.error}
      />
    );
  }

  const isPlatform =
    active.ambito === 'PLATAFORMA' && active.rol === 'SUPER_ADMIN';
  const juntaId = active.ambito === 'JUNTA' ? active.juntaId : null;

  if (choosing || (!isPlatform && !juntaId)) {
    return (
      <ContextView
        session={active}
        canUsePlatform={auth.canUsePlatform}
        onSelect={(next) => activate(next, true)}
        onExpired={onExpired}
        onBack={choosing ? () => setChoosing(false) : undefined}
        onLogout={closeSession}
        sessionError={logout.error}
      />
    );
  }

  const localRole = active.rol === 'SUPER_ADMIN' ? null : active.rol;
  const localLinks = juntaNavigation(localRole);
  const selectedPage =
    localLinks.find(({ id }) => id === localPage)?.id ?? localLinks[0].id;
  return (
    <div className="workspace">
      <a className="skip-link" href="#contenido">
        Ir al contenido
      </a>
      <aside className="workspace-rail">
        <Brand />
        <div className="rail-context">
          <span className="rail-overline">Espacio de trabajo</span>
          <strong>
            {isPlatform
              ? 'Plataforma'
              : active.rol
                ? roleNames[active.rol]
                : 'Junta'}
          </strong>
        </div>
        <nav aria-label="Área de trabajo">
          {isPlatform ? (
            <>
              <span className="nav-section-label">01 / PLATAFORMA</span>
              <button
                className="workspace-nav-active"
                type="button"
                aria-current="page"
                onClick={() => setWorkspace((previous) => previous + 1)}
              >
                Juntas
              </button>
            </>
          ) : (
            localLinks.map(({ id, label, group }, index) => (
              <div className="workspace-nav-entry" key={id}>
                {(index === 0 || localLinks[index - 1].group !== group) && (
                  <span className="nav-section-label">{group}</span>
                )}
                <button
                  className={
                    selectedPage === id
                      ? 'workspace-nav-active'
                      : 'workspace-nav-item'
                  }
                  type="button"
                  aria-current={selectedPage === id ? 'page' : undefined}
                  onClick={() => {
                    setLocalPage(id);
                    setWorkspace((previous) => previous + 1);
                  }}
                >
                  {label}
                </button>
              </div>
            ))
          )}
        </nav>
        <a href="/estado" className="rail-health">
          Estado del sistema <span aria-hidden="true">↗</span>
        </a>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <div>
            <p>{isPlatform ? 'Panel de plataforma' : 'Panel de junta'}</p>
            <span>{active.rol && roleNames[active.rol]}</span>
          </div>
          <div className="topbar-actions">
            <button
              className="button-secondary"
              type="button"
              onClick={() => {
                logout.setError(null);
                setChoosing(true);
              }}
            >
              Cambiar de ámbito
            </button>
            <button
              className="button-link"
              type="button"
              onClick={closeSession}
            >
              Cerrar sesión
            </button>
          </div>
        </header>
        <main id="contenido" className="workspace-content" tabIndex={-1}>
          {logout.error && <Feedback error>{logout.error}</Feedback>}
          {isPlatform ? (
            <PlatformPage
              key={workspace}
              csrfToken={active.csrfToken}
              onExpired={onExpired}
            />
          ) : (
            juntaId && (
              <JuntaWorkspace
                key={`${juntaId}-${workspace}`}
                juntaId={juntaId}
                csrfToken={active.csrfToken}
                onExpired={onExpired}
                page={selectedPage}
                role={localRole}
              />
            )
          )}
        </main>
      </div>
    </div>
  );
}
