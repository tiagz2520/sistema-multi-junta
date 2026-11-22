import { api, ApiError, type TipoActividad } from '@multi-junta/api-client';
import { useCallback, useRef, useState } from 'react';
import { MemberChoice } from '../administration/registry-page';
import { useCommand, useResource } from '../../shared/api/use-api';
import {
  ActionForm,
  activityTypes,
  Choice,
  dateLabel,
  download,
  Field,
  input,
  type ModuleProps,
  money,
  PageTitle,
  Records,
  Resource,
  Section,
  stateLabel,
} from '../../shared/ui/records';
import { Feedback } from '../../shared/ui/ui';
import { ActivityPicker } from '../../shared/ui/activity-picker';

const amountPattern = '[0-9]{1,12}([.,][0-9]{1,2})?';
const amount = (form: FormData, key = 'monto') =>
  input(form, key).replace(',', '.');
const todayEc = () =>
  new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
const canVoid = (state: string) => state !== 'ANULADA' && state !== 'ANULADO';

export function TariffsPage({
  juntaId,
  csrfToken,
  onExpired,
  canWrite,
}: ModuleProps & { canWrite: boolean }) {
  const [creating, setCreating] = useState(false);
  const tariffs = useResource(
    useCallback(
      (signal: AbortSignal) => api.finance.tariffs(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );

  return (
    <>
      <PageTitle
        title="Tarifas"
        description="Importes vigentes por tipo de actividad y fecha."
        action={
          canWrite &&
          !creating && (
            <button
              className="button-primary"
              type="button"
              onClick={() => setCreating(true)}
            >
              Nueva tarifa
            </button>
          )
        }
      />
      {creating && (
        <Section title="Nueva tarifa">
          <ActionForm
            label="Registrar tarifa"
            onExpired={onExpired}
            onCancel={() => setCreating(false)}
            onSubmit={async (data) => {
              await api.finance.addTariff(
                juntaId,
                {
                  tipo: input(data, 'tipo') as TipoActividad,
                  vigenteDesde: input(data, 'vigenteDesde'),
                  monto: amount(data),
                },
                csrfToken,
              );
              setCreating(false);
              tariffs.reload();
            }}
          >
            <Choice
              label="Tipo de actividad"
              name="tipo"
              options={activityTypes}
            />
            <Field
              label="Vigente desde"
              name="vigenteDesde"
              type="date"
              value={todayEc()}
            />
            <Field
              label="Monto"
              name="monto"
              pattern={amountPattern}
              inputMode="decimal"
            />
          </ActionForm>
        </Section>
      )}
      <Resource resource={tariffs}>
        {(rows) => (
          <Records
            rows={rows}
            columns={[
              {
                title: 'Tipo',
                value: (row) =>
                  activityTypes.find((item) => item.id === row.tipo)?.label,
              },
              {
                title: 'Vigente desde',
                value: (row) => dateLabel(row.vigenteDesde),
              },
              { title: 'Monto', value: (row) => money(row.monto) },
            ]}
          />
        )}
      </Resource>
    </>
  );
}

function VoidForm({
  target,
  onExpired,
  onSubmit,
  onCancel,
}: {
  target: string;
  onExpired: () => void;
  onSubmit: (motivo: string) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <Section title={`Anular ${target}`}>
      <ActionForm
        label="Confirmar anulación"
        onExpired={onExpired}
        onCancel={onCancel}
        onSubmit={(form) => onSubmit(input(form, 'motivo'))}
      >
        <Field label="Motivo de anulación" name="motivo" />
      </ActionForm>
    </Section>
  );
}

export function FinesPage(
  props: ModuleProps & { canGenerate: boolean; canVoid: boolean },
) {
  const { juntaId, csrfToken, onExpired, canGenerate, canVoid } = props;
  const [generating, setGenerating] = useState(false);
  const [voiding, setVoiding] = useState<{ id: string; label: string } | null>(
    null,
  );
  const fines = useResource(
    useCallback(
      (signal: AbortSignal) => api.finance.fines(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  return (
    <>
      <PageTitle
        title="Multas"
        description="Obligaciones por inasistencia y su estado de cobro."
        action={
          canGenerate &&
          !generating && (
            <button
              className="button-primary"
              type="button"
              onClick={() => setGenerating(true)}
            >
              Generar multas
            </button>
          )
        }
      />
      {generating && (
        <FineGenerator
          {...props}
          onCancel={() => setGenerating(false)}
          onCreated={() => {
            setGenerating(false);
            fines.reload();
          }}
        />
      )}
      {voiding && (
        <VoidForm
          target={voiding.label}
          onExpired={onExpired}
          onCancel={() => setVoiding(null)}
          onSubmit={async (motivo) => {
            await api.finance.voidFine(juntaId, voiding.id, motivo, csrfToken);
            setVoiding(null);
            fines.reload();
          }}
        />
      )}
      <Resource resource={fines}>
        {(rows) => (
          <Records
            rows={rows}
            columns={[
              { title: 'Socio', value: (row) => row.socioNombre },
              { title: 'Concepto', value: (row) => row.concepto },
              { title: 'Monto', value: (row) => money(row.monto) },
              { title: 'Estado', value: (row) => stateLabel(row.estado) },
              {
                title: 'Motivo de anulación',
                value: (row) => row.motivoAnulacion ?? '—',
              },
              ...(canVoid
                ? [
                    {
                      title: 'Acciones',
                      value: (row: (typeof rows)[number]) =>
                        row.estado === 'PENDIENTE' ? (
                          <button
                            className="table-link"
                            type="button"
                            onClick={() =>
                              setVoiding({ id: row.id, label: 'multa' })
                            }
                          >
                            Anular
                          </button>
                        ) : (
                          '—'
                        ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Resource>
    </>
  );
}

function FineGenerator(
  props: ModuleProps & { onCreated: () => void; onCancel: () => void },
) {
  const { juntaId, onExpired, onCancel } = props;
  const [activity, setActivity] = useState('');
  const activities = useResource(
    useCallback(
      (signal: AbortSignal) => api.administration.activities(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );

  return (
    <Section title="Generar multas">
      <Resource resource={activities}>
        {(rows) => (
          <ActivityPicker
            activities={rows}
            value={activity}
            onChange={setActivity}
            closedOnly
          />
        )}
      </Resource>
      {activity ? (
        <FineCandidates key={activity} activity={activity} {...props} />
      ) : (
        <button
          type="button"
          className="button-secondary mt-4"
          onClick={onCancel}
        >
          Cancelar
        </button>
      )}
    </Section>
  );
}

function FineCandidates({
  juntaId,
  csrfToken,
  onExpired,
  activity,
  onCreated,
  onCancel,
}: ModuleProps & {
  activity: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const candidates = useResource(
    useCallback(
      (signal: AbortSignal) =>
        api.finance.fineCandidates(juntaId, activity, signal),
      [juntaId, activity],
    ),
    onExpired,
  );
  return (
    <>
      <Resource resource={candidates}>
        {(rows) =>
          rows.length ? (
            <ActionForm
              label="Confirmar multas"
              disabled={!selected.length}
              onExpired={onExpired}
              onCancel={onCancel}
              onSubmit={async () => {
                await api.finance.createFines(
                  juntaId,
                  { actividadId: activity, asistenciaIds: selected },
                  csrfToken,
                );
                onCreated();
              }}
            >
              <ul className="check-list">
                {rows.map((row) => (
                  <li key={row.asistenciaId}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.asistenciaId)}
                        disabled={!row.tarifaId}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelected((previous) =>
                            checked
                              ? [...previous, row.asistenciaId]
                              : previous.filter(
                                  (id) => id !== row.asistenciaId,
                                ),
                          );
                        }}
                      />
                      <span>{row.socioNombre}</span>
                    </label>
                    <span>
                      {row.tarifaId ? money(row.monto) : 'Sin tarifa vigente'}
                    </span>
                  </li>
                ))}
              </ul>
            </ActionForm>
          ) : (
            <Feedback>
              Esta actividad no tiene inasistencias elegibles.
            </Feedback>
          )
        }
      </Resource>
      {(candidates.state.kind !== 'ready' || !candidates.state.data.length) && (
        <button
          type="button"
          className="button-secondary mt-4"
          onClick={onCancel}
        >
          Cancelar
        </button>
      )}
    </>
  );
}

export function PaymentsPage(props: ModuleProps) {
  const { juntaId, csrfToken, onExpired } = props;
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const payments = useResource(
    useCallback(
      (signal: AbortSignal) => api.finance.payments(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const fileCommand = useCommand(onExpired);

  return (
    <>
      <PageTitle
        title="Pagos"
        description="Ingresos registrados y comprobantes internos de la junta."
        action={
          !creating && (
            <button
              className="button-primary"
              type="button"
              onClick={() => setCreating(true)}
            >
              Registrar pago
            </button>
          )
        }
      />
      {creating && (
        <PaymentForm
          {...props}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            payments.reload();
          }}
        />
      )}
      {voiding && (
        <VoidForm
          target="pago"
          onExpired={onExpired}
          onCancel={() => setVoiding(null)}
          onSubmit={async (motivo) => {
            await api.finance.voidPayment(juntaId, voiding, motivo, csrfToken);
            setVoiding(null);
            payments.reload();
          }}
        />
      )}
      {fileCommand.error && <Feedback error>{fileCommand.error}</Feedback>}
      <Resource resource={payments}>
        {(rows) => (
          <Records
            rows={rows}
            columns={[
              { title: 'Socio', value: (row) => row.socioNombre },
              { title: 'Concepto', value: (row) => row.concepto },
              { title: 'Fecha', value: (row) => dateLabel(row.fecha) },
              { title: 'Monto', value: (row) => money(row.monto) },
              { title: 'Estado', value: (row) => stateLabel(row.estado) },
              {
                title: 'Comprobante',
                value: (row) => (
                  <button
                    type="button"
                    className="table-link"
                    disabled={fileCommand.busy}
                    onClick={() =>
                      void fileCommand.run(async () => {
                        download(
                          await api.finance.receipt(juntaId, row.id),
                          `comprobante-${row.numeroComprobante}.pdf`,
                        );
                      })
                    }
                  >
                    Descargar PDF
                  </button>
                ),
              },
              {
                title: 'Acciones',
                value: (row) =>
                  canVoid(row.estado) ? (
                    <button
                      type="button"
                      className="table-link"
                      onClick={() => setVoiding(row.id)}
                    >
                      Anular
                    </button>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        )}
      </Resource>
    </>
  );
}

function PaymentForm({
  juntaId,
  csrfToken,
  onExpired,
  onSaved,
  onCancel,
}: ModuleProps & { onSaved: () => void; onCancel: () => void }) {
  const [kind, setKind] = useState<'directo' | 'multa'>('directo');
  const [fineId, setFineId] = useState('');
  const request = useRef<{ payload: string; id: string } | null>(null);
  const fines = useResource(
    useCallback(
      (signal: AbortSignal) =>
        kind === 'multa'
          ? api.finance.fines(juntaId, signal)
          : Promise.resolve([]),
      [juntaId, kind],
    ),
    onExpired,
  );
  const payable =
    fines.state.kind === 'ready'
      ? fines.state.data.filter((row) => row.estado === 'PENDIENTE')
      : [];
  const fine = payable.find((row) => row.id === fineId);

  return (
    <Section title="Registrar pago">
      <ActionForm
        label="Confirmar pago"
        onExpired={onExpired}
        onCancel={onCancel}
        disabled={kind === 'multa' && !fine}
        onSubmit={async (form) => {
          const payment = {
            ...(kind === 'multa' && fine
              ? { obligacionId: fine.id }
              : {
                  socioId: input(form, 'socioId'),
                  concepto: input(form, 'concepto'),
                }),
            monto: kind === 'multa' && fine ? fine.monto : amount(form),
            fecha: input(form, 'fecha'),
            metodo: input(form, 'metodo'),
          };
          const payload = JSON.stringify(payment);
          if (request.current?.payload !== payload)
            request.current = { payload, id: crypto.randomUUID() };
          await api.finance.makePayment(
            juntaId,
            { ...payment, solicitudId: request.current.id },
            csrfToken,
          );
          onSaved();
        }}
      >
        <label>
          Tipo de pago
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as 'directo' | 'multa')
            }
          >
            <option value="directo">Pago directo</option>
            <option value="multa">Pago de multa</option>
          </select>
        </label>
        {kind === 'directo' ? (
          <>
            <MemberChoice juntaId={juntaId} onExpired={onExpired} />
            <Field label="Concepto" name="concepto" />
            <Field
              label="Monto"
              name="monto"
              pattern={amountPattern}
              inputMode="decimal"
            />
          </>
        ) : (
          <Resource resource={fines}>
            {() => (
              <label>
                Multa
                <select
                  required
                  value={fineId}
                  onChange={(event) => setFineId(event.target.value)}
                >
                  <option value="">Selecciona una obligación pendiente</option>
                  {payable.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.socioNombre} · {row.concepto} · {money(row.monto)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Resource>
        )}
        <div className="action-fields">
          <Field label="Fecha" name="fecha" type="date" value={todayEc()} />
          <Field label="Método de pago" name="metodo" value="Efectivo" />
        </div>
      </ActionForm>
    </Section>
  );
}

export function ExpensesPage({ juntaId, csrfToken, onExpired }: ModuleProps) {
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const expenses = useResource(
    useCallback(
      (signal: AbortSignal) => api.finance.expenses(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const fileCommand = useCommand(onExpired);

  return (
    <>
      <PageTitle
        title="Gastos"
        description="Egresos de la junta y sus respaldos."
        action={
          !creating && (
            <button
              className="button-primary"
              type="button"
              onClick={() => setCreating(true)}
            >
              Registrar gasto
            </button>
          )
        }
      />
      {creating && (
        <Section title="Registrar gasto">
          <ActionForm
            label="Confirmar gasto"
            onExpired={onExpired}
            onCancel={() => setCreating(false)}
            onSubmit={async (data) => {
              const file = data.get('archivo');
              if (
                !(file instanceof File) ||
                !['application/pdf', 'image/jpeg', 'image/png'].includes(
                  file.type,
                ) ||
                !file.size ||
                file.size > 2 * 1024 * 1024
              ) {
                throw new ApiError(
                  400,
                  'Selecciona un archivo PDF, JPEG o PNG de hasta 2 MiB.',
                );
              }
              data.set('monto', amount(data));
              await api.finance.makeExpense(juntaId, data, csrfToken);
              setCreating(false);
              expenses.reload();
            }}
          >
            <Field label="Concepto" name="concepto" />
            <Field label="Descripción" name="descripcion" />
            <div className="action-fields">
              <Field
                label="Monto"
                name="monto"
                pattern={amountPattern}
                inputMode="decimal"
              />
              <Field label="Fecha" name="fecha" type="date" value={todayEc()} />
            </div>
            <Field label="Beneficiario" name="beneficiario" />
            <Field
              label="Archivo de respaldo"
              name="archivo"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
            />
            <p className="muted text-sm">PDF, JPEG o PNG. Máximo 2 MiB.</p>
          </ActionForm>
        </Section>
      )}
      {voiding && (
        <VoidForm
          target="gasto"
          onExpired={onExpired}
          onCancel={() => setVoiding(null)}
          onSubmit={async (motivo) => {
            await api.finance.voidExpense(juntaId, voiding, motivo, csrfToken);
            setVoiding(null);
            expenses.reload();
          }}
        />
      )}
      {fileCommand.error && <Feedback error>{fileCommand.error}</Feedback>}
      <Resource resource={expenses}>
        {(rows) => (
          <Records
            rows={rows}
            columns={[
              { title: 'Concepto', value: (row) => row.concepto },
              { title: 'Beneficiario', value: (row) => row.beneficiario },
              { title: 'Fecha', value: (row) => dateLabel(row.fecha) },
              { title: 'Monto', value: (row) => money(row.monto) },
              { title: 'Estado', value: (row) => stateLabel(row.estado) },
              {
                title: 'Respaldo',
                value: (row) => (
                  <button
                    type="button"
                    className="table-link"
                    disabled={fileCommand.busy}
                    onClick={() =>
                      void fileCommand.run(async () => {
                        download(
                          await api.finance.expenseFile(juntaId, row.id),
                          row.nombreArchivo,
                        );
                      })
                    }
                  >
                    Descargar respaldo
                  </button>
                ),
              },
              {
                title: 'Acciones',
                value: (row) =>
                  canVoid(row.estado) ? (
                    <button
                      type="button"
                      className="table-link"
                      onClick={() => setVoiding(row.id)}
                    >
                      Anular
                    </button>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        )}
      </Resource>
    </>
  );
}
