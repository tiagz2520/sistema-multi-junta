import {
  pageSize,
  type Alta,
  type Estado,
  type Rol,
} from '@multi-junta/api-client';
import { useEffect, useId, useRef, type ReactNode } from 'react';

export const roleNames: Record<Rol, string> = {
  SUPER_ADMIN: 'Super Administrador',
  ADMIN_JUNTA: 'Administrador de Junta',
  SECRETARIA: 'Secretaría',
  TESORERIA: 'Tesorería',
  SOCIO: 'Socio',
};

export function canonicalUsername(input: string) {
  const value = input.trim();
  return /^[A-Za-z0-9._-]{3,32}$/.test(value) ? value.toLowerCase() : null;
}

export const usernameHint =
  'De 3 a 32 caracteres. Usa letras sin tildes, números, punto, guion o guion bajo.';

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg
          viewBox="0 0 30 30"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M3 5H27M3 14H20Q25 14 25 19V25M3 24H12Q17 24 17 19V5" />
        </svg>
      </span>
      <span className="brand-wordmark">
        <strong>MULTI—JUNTA</strong>
        <small>GESTIÓN COMUNITARIA</small>
      </span>
    </div>
  );
}

export function Status({ state }: { state: Estado }) {
  return (
    <span
      className={`status ${state === 'ACTIVA' ? 'status-active' : 'status-inactive'}`}
    >
      <span aria-hidden="true" />
      {state === 'ACTIVA' ? 'Activa' : 'Inactiva'}
    </span>
  );
}

export function Feedback({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={error ? 'feedback feedback-error' : 'feedback'}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export function LoadIssue({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  if (!message) return <Feedback>Cargando datos…</Feedback>;
  return (
    <Feedback error>
      <p>{message}</p>
      {onRetry && (
        <button
          className="button-secondary mt-3"
          type="button"
          onClick={onRetry}
        >
          Reintentar
        </button>
      )}
    </Feedback>
  );
}

export function Pagination({
  offset,
  count,
  onChange,
}: {
  offset: number;
  count: number;
  onChange: (offset: number) => void;
}) {
  if (offset === 0 && count < pageSize) return null;
  return (
    <nav className="pagination" aria-label="Paginación">
      <button
        className="button-secondary"
        type="button"
        disabled={offset === 0}
        onClick={() => onChange(offset - pageSize)}
      >
        Anterior
      </button>
      <span>Página {Math.floor(offset / pageSize) + 1}</span>
      <button
        className="button-secondary"
        type="button"
        disabled={count < pageSize}
        onClick={() => onChange(offset + pageSize)}
      >
        Siguiente
      </button>
    </nav>
  );
}

function Dialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="credential-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}

export function ConfirmAction({
  title,
  message,
  label,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  label: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose} busy={busy}>
      <p className="mt-2 mb-4">{message}</p>
      {error && <Feedback error>{error}</Feedback>}
      <div className="form-actions">
        <button
          className="button-secondary"
          type="button"
          onClick={onClose}
          disabled={busy}
        >
          Cancelar
        </button>
        <button
          className="button-primary"
          type="button"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Procesando…' : label}
        </button>
      </div>
    </Dialog>
  );
}

export function TemporaryCredential({
  alta,
  onClose,
}: {
  alta: Alta;
  onClose: () => void;
}) {
  return (
    <Dialog title="Credencial temporal" onClose={onClose}>
      <p className="mt-2">
        Entrégala a <strong>{alta.membresia.usuario}</strong> por un canal
        privado. La persona deberá cambiarla al iniciar sesión.
      </p>
      <p className="credential-value" aria-label="Contraseña temporal">
        {alta.contrasenaTemporal}
      </p>
      <p className="muted text-sm">Disponible hasta que cierres este cuadro.</p>
      <button className="button-primary mt-5" type="button" onClick={onClose}>
        Cerrar credencial
      </button>
    </Dialog>
  );
}
