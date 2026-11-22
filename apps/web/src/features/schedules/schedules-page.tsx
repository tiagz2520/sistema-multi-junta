import { api, type HorarioSemanal } from '@multi-junta/api-client';
import { useCallback, useState } from 'react';
import { useCommand, useResource } from '../../shared/api/use-api';
import {
  ActionForm,
  Choice,
  dateLabel,
  Field,
  input,
  type ModuleProps,
  PageTitle,
  Records,
  Resource,
  Section,
} from '../../shared/ui/records';
import { Feedback } from '../../shared/ui/ui';

const weekdays = [
  { id: '1', label: 'Lunes' },
  { id: '2', label: 'Martes' },
  { id: '3', label: 'Miércoles' },
  { id: '4', label: 'Jueves' },
  { id: '5', label: 'Viernes' },
  { id: '6', label: 'Sábado' },
  { id: '7', label: 'Domingo' },
];

export function SchedulesPage({
  juntaId,
  csrfToken,
  onExpired,
  role,
}: ModuleProps & {
  role: 'ADMIN_JUNTA' | 'SECRETARIA' | 'SOCIO';
}) {
  const [creating, setCreating] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [editing, setEditing] = useState<HorarioSemanal | null>(null);
  const action = useCommand(onExpired);
  const services = useResource(
    useCallback(
      (signal: AbortSignal) =>
        role === 'SOCIO'
          ? Promise.resolve([])
          : api.schedules.services(juntaId, signal),
      [juntaId, role],
    ),
    onExpired,
  );
  const schedules = useResource(
    useCallback(
      (signal: AbortSignal) => api.schedules.schedules(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const sectors = useResource(
    useCallback(
      (signal: AbortSignal) =>
        role === 'SOCIO'
          ? Promise.resolve([])
          : api.administration.sectors(juntaId, signal),
      [juntaId, role],
    ),
    onExpired,
  );
  const canEdit = role === 'SECRETARIA';
  const canCreateServices = role === 'ADMIN_JUNTA';
  const localToday = new Date();
  const startDay = new Date(
    localToday.getTime() - localToday.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 10);
  const endDate = new Date(localToday.getTime() + 30 * 86400000);
  const endDay = new Date(
    endDate.getTime() - endDate.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 10);
  return (
    <>
      <PageTitle
        title="Horarios semanales"
        description="Programación vigente de servicios comunitarios por sector."
        action={
          canEdit && (
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                setEditing(null);
                setCreating((v) => !v);
              }}
            >
              {creating ? 'Cerrar formulario' : 'Nuevo horario'}
            </button>
          )
        }
      />
      {canCreateServices && (
        <Section title="Servicios de la junta">
          <Resource resource={services}>
            {(rows) => (
              <>
                <p className="muted">
                  Servicios:{' '}
                  {rows.map((s) => s.nombre).join(', ') ||
                    'Sin servicios registrados'}
                </p>
                {action.error && <Feedback error>{action.error}</Feedback>}
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action.run(async () => {
                      await api.schedules.createService(
                        juntaId,
                        serviceName,
                        csrfToken,
                      );
                      setServiceName('');
                      services.reload();
                    });
                  }}
                >
                  <label>
                    Nombre del servicio
                    <input
                      value={serviceName}
                      maxLength={120}
                      required
                      onChange={(e) => setServiceName(e.target.value)}
                    />
                  </label>
                  <button
                    className="button-primary"
                    disabled={action.busy}
                    type="submit"
                  >
                    Agregar servicio
                  </button>
                </form>
              </>
            )}
          </Resource>
        </Section>
      )}
      {(creating || editing) && canEdit && (
        <Section title={editing ? 'Modificar horario' : 'Registrar horario'}>
          <Resource resource={services}>
            {(available) => (
              <Resource resource={sectors}>
                {(areas) => (
                  <ActionForm
                    label={editing ? 'Guardar cambios' : 'Publicar horario'}
                    onExpired={onExpired}
                    onCancel={() => {
                      setCreating(false);
                      setEditing(null);
                    }}
                    onSubmit={async (form) => {
                      const data = {
                        servicioId: input(form, 'servicioId'),
                        sectorId: input(form, 'sectorId'),
                        dia: Number(input(form, 'dia')),
                        inicio: input(form, 'inicio'),
                        fin: input(form, 'fin'),
                        desde: input(form, 'desde'),
                        hasta: input(form, 'hasta'),
                      };
                      if (editing)
                        await api.schedules.update(
                          juntaId,
                          editing.id,
                          data,
                          csrfToken,
                        );
                      else await api.schedules.create(juntaId, data, csrfToken);
                      schedules.reload();
                      setCreating(false);
                      setEditing(null);
                    }}
                  >
                    <Choice
                      label="Servicio"
                      name="servicioId"
                      value={editing?.servicioId}
                      options={available
                        .filter((v) => v.estado === 'ACTIVA')
                        .map((v) => ({ id: v.id, label: v.nombre }))}
                    />
                    <Choice
                      label="Sector"
                      name="sectorId"
                      value={editing?.sectorId}
                      options={areas
                        .filter((v) => v.estado === 'ACTIVA')
                        .map((v) => ({ id: v.id, label: v.nombre }))}
                    />
                    <Choice
                      label="Día semanal"
                      name="dia"
                      value={String(editing?.dia ?? '1')}
                      options={weekdays}
                    />
                    <Field
                      label="Hora de inicio"
                      name="inicio"
                      type="time"
                      value={editing?.inicio ?? '08:00'}
                    />
                    <Field
                      label="Hora final"
                      name="fin"
                      type="time"
                      value={editing?.fin ?? '09:00'}
                    />
                    <Field
                      label="Vigente desde"
                      name="desde"
                      type="date"
                      value={editing?.desde ?? startDay}
                    />
                    <Field
                      label="Vigente hasta"
                      name="hasta"
                      type="date"
                      value={editing?.hasta ?? endDay}
                    />
                  </ActionForm>
                )}
              </Resource>
            )}
          </Resource>
        </Section>
      )}
      {action.error && <Feedback error>{action.error}</Feedback>}
      <Resource resource={schedules}>
        {(rows) => (
          <Records
            rows={rows}
            columns={[
              {
                title: 'Día',
                value: (r) =>
                  weekdays.find((d) => Number(d.id) === r.dia)?.label ?? r.dia,
              },
              { title: 'Servicio', value: (r) => r.servicio ?? r.servicioId },
              { title: 'Sector', value: (r) => r.sector ?? r.sectorId },
              { title: 'Franja', value: (r) => `${r.inicio}–${r.fin}` },
              {
                title: 'Vigencia',
                value: (r) => `${dateLabel(r.desde)} — ${dateLabel(r.hasta)}`,
              },
              {
                title: 'Estado',
                value: (r) =>
                  r.estado === 'PUBLICADO' ? 'Publicado' : 'Archivado',
              },
              {
                title: 'Acción',
                value: (r) =>
                  canEdit ? (
                    <>
                      <button
                        type="button"
                        className="table-link"
                        onClick={() => {
                          setEditing(r);
                          setCreating(false);
                        }}
                      >
                        Editar
                      </button>
                      {r.estado === 'PUBLICADO' && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            className="table-link"
                            disabled={action.busy}
                            onClick={() =>
                              void action.run(async () => {
                                await api.schedules.update(
                                  juntaId,
                                  r.id,
                                  { estado: 'ARCHIVADO' },
                                  csrfToken,
                                );
                                schedules.reload();
                              })
                            }
                          >
                            Archivar
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    '—'
                  ),
              },
            ]}
            empty="No hay horarios visibles para tu sector."
          />
        )}
      </Resource>
    </>
  );
}
