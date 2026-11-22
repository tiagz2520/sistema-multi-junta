import { useId, type ReactNode } from 'react';
import { useCommand } from '../api/use-api';
import { Feedback, LoadIssue } from './ui';

export interface ModuleProps {
  juntaId: string;
  csrfToken: string;
  onExpired: () => void;
}

export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p className="muted mt-2">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="panel form-panel mb-5" aria-labelledby={id}>
      <h2 id={id} className="mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Records<T extends { id: string }>({
  rows,
  columns,
  empty = 'No hay registros para mostrar.',
}: {
  rows: T[];
  columns: { title: string; value: (row: T) => ReactNode }[];
  empty?: string;
}) {
  if (!rows.length) return <Feedback>{empty}</Feedback>;
  return (
    <div className="panel table-frame mb-5">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.title} scope="col">
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column, index) =>
                index === 0 ? (
                  <th key={column.title} scope="row">
                    {column.value(row)}
                  </th>
                ) : (
                  <td key={column.title}>{column.value(row)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type LoadState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; message: string };

export function Resource<T>({
  resource,
  children,
}: {
  resource: { state: LoadState<T>; reload: () => void };
  children: (data: T) => ReactNode;
}) {
  return resource.state.kind === 'ready' ? (
    children(resource.state.data)
  ) : (
    <LoadIssue
      message={
        resource.state.kind === 'error' ? resource.state.message : undefined
      }
      onRetry={resource.reload}
    />
  );
}

export function ActionForm({
  label,
  onSubmit,
  onExpired,
  children,
  disabled,
  onCancel,
}: {
  label: string;
  onSubmit: (data: FormData) => Promise<void>;
  onExpired: () => void;
  children: ReactNode;
  disabled?: boolean;
  onCancel?: () => void;
}) {
  const command = useCommand(onExpired);
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (command.busy || disabled) return;
        const data = new FormData(event.currentTarget);
        void command.run(() => onSubmit(data));
      }}
    >
      {command.error && <Feedback error>{command.error}</Feedback>}
      <fieldset className="form-stack" disabled={command.busy}>
        {children}
      </fieldset>
      <div className="form-actions">
        <button
          className="button-primary"
          type="submit"
          disabled={command.busy || disabled}
        >
          {command.busy ? 'Guardando…' : label}
        </button>
        {onCancel && (
          <button
            className="button-secondary"
            type="button"
            disabled={command.busy}
            onClick={onCancel}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

export function Field({
  label,
  name,
  value,
  type = 'text',
  required = true,
  pattern,
  maxLength,
  inputMode,
  accept,
}: {
  label: string;
  name: string;
  value?: string | number | null;
  type?: string;
  required?: boolean;
  pattern?: string;
  maxLength?: number;
  inputMode?: 'numeric' | 'decimal';
  accept?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value ?? undefined}
        required={required}
        pattern={pattern}
        maxLength={maxLength}
        inputMode={inputMode}
        accept={accept}
      />
    </label>
  );
}

export function Choice({
  label,
  name,
  options,
  value = '',
  optional = false,
  emptyLabel,
}: {
  label: string;
  name: string;
  options: { id: string; label: string }[];
  value?: string | null;
  optional?: boolean;
  emptyLabel?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value ?? ''} required={!optional}>
        <option value="" disabled={!optional}>
          {emptyLabel ?? (optional ? 'Sin asignar' : 'Selecciona una opción')}
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export const activityTypes = [
  { id: 'ASAMBLEA', label: 'Asamblea' },
  { id: 'MINGA', label: 'Minga' },
];
export const recordStates = [
  { id: 'ACTIVA', label: 'Activa' },
  { id: 'INACTIVA', label: 'Inactiva' },
];

export function input(data: FormData, key: string): string {
  return String(data.get(key) ?? '').trim();
}

export function dateLabel(value: string): string {
  if (!value) return '—';
  const day = value.slice(0, 10).split('-');
  return day.length === 3 ? `${day[2]}/${day[1]}/${day[0]}` : value;
}

const ecTime = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  dateStyle: 'short',
  timeStyle: 'short',
});
export const timeLabel = (value: string) => ecTime.format(new Date(value));
export const toEcIso = (value: string) =>
  new Date(`${value}-05:00`).toISOString();
export const toEcField = (value: string) =>
  new Date(Date.parse(value) - 5 * 3_600_000).toISOString().slice(0, 16);

const usd = new Intl.NumberFormat('es-EC', {
  style: 'currency',
  currency: 'USD',
});
export const money = (value: string | null | undefined) =>
  value == null ? '—' : usd.format(Number(value));

export function stateLabel(state: string | null): string {
  return (
    (
      {
        ABIERTA: 'Abierta',
        CERRADA: 'Cerrada',
        PRESENTE: 'Presente',
        AUSENTE: 'Ausente',
        JUSTIFICADO: 'Justificado',
        ACEPTADA: 'Aceptada',
        RECHAZADA: 'Rechazada',
        PENDIENTE: 'Pendiente',
        PAGADA: 'Pagada',
        ANULADA: 'Anulada',
        ANULADO: 'Anulado',
        REGISTRADO: 'Registrado',
        VIGENTE: 'Vigente',
        REVISION_PENDIENTE: 'Revisión pendiente',
        ENTRADA: 'Entrada',
        SALIDA: 'Salida',
      } as Record<string, string>
    )[state ?? ''] ??
    state ??
    'Sin marcar'
  );
}

export function download(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename.replace(/[^\p{L}\p{N}._-]+/gu, '-') || 'archivo';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
