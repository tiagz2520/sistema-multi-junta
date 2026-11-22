import {
  api,
  type Actividad,
  type ActividadDetalle,
  type ActividadInput,
  type DecisionJustificacion,
  type Participante,
  type TipoActividad,
} from '@multi-junta/api-client';
import { useCallback, useState } from 'react';
import { useCommand, useResource } from '../../shared/api/use-api';
import {
  ActionForm,
  activityTypes,
  Choice,
  Field,
  input,
  type ModuleProps,
  PageTitle,
  Records,
  Resource,
  Section,
  stateLabel,
  timeLabel,
  toEcField,
  toEcIso,
} from '../../shared/ui/records';
import { ConfirmAction } from '../../shared/ui/ui';

const memberName = (row: Participante) => `${row.nombres} ${row.apellidos}`;

export function ActivitiesPage(props: ModuleProps) {
  const { juntaId, onExpired } = props;
  const [selected, select] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const activities = useResource(
    useCallback(
      (signal: AbortSignal) => api.administration.activities(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );

  if (selected)
    return (
      <ActivityDetails
        {...props}
        id={selected}
        onBack={() => {
          select(null);
          activities.reload();
        }}
      />
    );

  return (
    <>
      <PageTitle
        title="Actividades"
        description="Asambleas, mingas y registros de asistencia."
        action={
          !creating && (
            <button
              type="button"
              className="button-primary"
              onClick={() => setCreating(true)}
            >
              Nueva actividad
            </button>
          )
        }
      />
      {creating && (
        <Section title="Nueva actividad">
          <ActivityForm
            {...props}
            onCancel={() => setCreating(false)}
            onSave={(activity) => {
              setCreating(false);
              select(activity.id);
            }}
          />
        </Section>
      )}
      <Resource resource={activities}>
        {(rows) => (
          <Records
            rows={rows}
            columns={[
              { title: 'Actividad', value: (row) => row.titulo },
              {
                title: 'Tipo',
                value: (row) =>
                  activityTypes.find((type) => type.id === row.tipo)?.label,
              },
              { title: 'Inicio', value: (row) => timeLabel(row.inicio) },
              { title: 'Lugar', value: (row) => row.lugar },
              { title: 'Estado', value: (row) => stateLabel(row.estado) },
              {
                title: 'Acciones',
                value: (row) => (
                  <button
                    className="table-link"
                    type="button"
                    onClick={() => select(row.id)}
                  >
                    Ver ficha
                  </button>
                ),
              },
            ]}
          />
        )}
      </Resource>
    </>
  );
}

function ActivityForm({
  juntaId,
  csrfToken,
  onExpired,
  activity,
  onSave,
  onCancel,
}: ModuleProps & {
  activity?: Actividad;
  onSave: (activity: Actividad) => void;
  onCancel: () => void;
}) {
  return (
    <ActionForm
      label={activity ? 'Guardar actividad' : 'Registrar actividad'}
      onExpired={onExpired}
      onCancel={onCancel}
      onSubmit={async (form) => {
        const data: ActividadInput = {
          tipo: input(form, 'tipo') as TipoActividad,
          titulo: input(form, 'titulo'),
          inicio: toEcIso(input(form, 'inicio')),
          fin: toEcIso(input(form, 'fin')),
          lugar: input(form, 'lugar'),
        };
        onSave(
          activity
            ? await api.administration.updateActivity(
                juntaId,
                activity.id,
                data,
                csrfToken,
              )
            : await api.administration.createActivity(juntaId, data, csrfToken),
        );
      }}
    >
      <Choice
        label="Tipo de actividad"
        name="tipo"
        options={activityTypes}
        value={activity?.tipo}
      />
      <Field label="Título" name="titulo" value={activity?.titulo} />
      <div className="action-fields">
        <Field
          label="Inicio"
          name="inicio"
          type="datetime-local"
          value={activity && toEcField(activity.inicio)}
        />
        <Field
          label="Fin"
          name="fin"
          type="datetime-local"
          value={activity && toEcField(activity.fin)}
        />
      </div>
      <p className="muted text-sm">Horario de Ecuador continental.</p>
      <Field label="Lugar" name="lugar" value={activity?.lugar} />
    </ActionForm>
  );
}

function ActivityDetails(
  props: ModuleProps & { id: string; onBack: () => void },
) {
  const { juntaId, csrfToken, onExpired, id, onBack } = props;
  const detail = useResource(
    useCallback(
      (signal: AbortSignal) => api.administration.activity(juntaId, id, signal),
      [juntaId, id],
    ),
    onExpired,
  );
  const [editing, setEditing] = useState(false);
  const [person, setPerson] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const closeCommand = useCommand(onExpired);

  return (
    <>
      <button className="back-link" type="button" onClick={onBack}>
        ← Volver a actividades
      </button>
      <Resource resource={detail}>
        {(activity: ActividadDetalle) => {
          const participant = activity.participantes.find(
            (row) => row.socioId === person,
          );
          return (
            <>
              <PageTitle
                title={activity.titulo}
                description={`${activity.lugar} · ${timeLabel(activity.inicio)} · ${stateLabel(activity.estado)}`}
                action={
                  activity.estado !== 'CERRADA' &&
                  !editing && (
                    <div className="form-actions">
                      <button
                        className="button-secondary"
                        type="button"
                        onClick={() => setEditing(true)}
                      >
                        Editar actividad
                      </button>
                      <button
                        className="button-primary"
                        type="button"
                        onClick={() => {
                          closeCommand.setError(null);
                          setClosing(true);
                        }}
                      >
                        Cerrar actividad
                      </button>
                    </div>
                  )
                }
              />
              {editing && (
                <Section title="Editar actividad">
                  <ActivityForm
                    {...props}
                    activity={activity}
                    onCancel={() => setEditing(false)}
                    onSave={(updated) => {
                      detail.update((previous) => ({
                        ...previous,
                        ...updated,
                      }));
                      setEditing(false);
                    }}
                  />
                </Section>
              )}
              <Section title="Participantes y asistencia">
                <Records
                  rows={activity.participantes}
                  columns={[
                    { title: 'Socio', value: memberName },
                    {
                      title: 'Asistencia',
                      value: (row) => stateLabel(row.estado),
                    },
                    {
                      title: 'Acciones',
                      value: (row) => (
                        <button
                          type="button"
                          className="table-link"
                          onClick={() => setPerson(row.socioId)}
                        >
                          Gestionar asistencia
                        </button>
                      ),
                    },
                  ]}
                />
              </Section>
              {participant && (
                <AttendanceDetail
                  key={participant.id}
                  {...props}
                  activityId={id}
                  participant={participant}
                  onRefresh={detail.reload}
                />
              )}
              {closing && (
                <ConfirmAction
                  title="Cerrar actividad"
                  message="El cierre exige una marca de asistencia para cada participante. Las correcciones posteriores quedarán en el historial."
                  label="Confirmar cierre"
                  busy={closeCommand.busy}
                  error={closeCommand.error}
                  onClose={() => setClosing(false)}
                  onConfirm={() =>
                    void closeCommand.run(async () => {
                      await api.administration.closeActivity(
                        juntaId,
                        id,
                        csrfToken,
                      );
                      setClosing(false);
                      detail.reload();
                    })
                  }
                />
              )}
            </>
          );
        }}
      </Resource>
    </>
  );
}

function AttendanceDetail({
  juntaId,
  csrfToken,
  onExpired,
  participant,
  activityId,
  onRefresh,
}: ModuleProps & {
  participant: Participante;
  activityId: string;
  onRefresh: () => void;
}) {
  const { socioId, estado, justificaciones, historial } = participant;
  return (
    <>
      <Section title={`Asistencia de ${memberName(participant)}`}>
        <ActionForm
          label="Guardar asistencia"
          onExpired={onExpired}
          onSubmit={async (form) => {
            const motivo = input(form, 'motivo');
            await api.administration.markAttendance(
              juntaId,
              activityId,
              socioId,
              {
                estado: input(form, 'estado') as 'PRESENTE' | 'AUSENTE',
                ...(motivo ? { motivo } : {}),
              },
              csrfToken,
            );
            onRefresh();
          }}
        >
          <Choice
            label="Estado de asistencia"
            name="estado"
            value={estado === 'JUSTIFICADO' ? '' : estado}
            options={[
              { id: 'PRESENTE', label: 'Presente' },
              { id: 'AUSENTE', label: 'Ausente' },
            ]}
          />
          {estado && <Field label="Motivo de corrección" name="motivo" />}
        </ActionForm>
      </Section>
      <Section title="Justificaciones">
        <Records
          rows={justificaciones}
          columns={[
            { title: 'Motivo', value: (row) => row.motivo },
            { title: 'Decisión', value: (row) => stateLabel(row.estado) },
            {
              title: 'Motivo de decisión',
              value: (row) => row.motivoDecision ?? '—',
            },
          ]}
          empty="Todavía no hay justificaciones registradas."
        />
        {estado === 'AUSENTE' &&
          !justificaciones.some((item) => item.estado === 'PENDIENTE') && (
            <ActionForm
              label="Registrar justificación"
              onExpired={onExpired}
              onSubmit={async (form) => {
                await api.administration.addJustification(
                  juntaId,
                  activityId,
                  socioId,
                  input(form, 'motivo'),
                  csrfToken,
                );
                onRefresh();
              }}
            >
              <Field label="Motivo de justificación" name="motivo" />
            </ActionForm>
          )}
        {justificaciones
          .filter((item) => item.estado === 'PENDIENTE')
          .map((item) => (
            <ActionForm
              key={item.id}
              label="Resolver justificación"
              onExpired={onExpired}
              onSubmit={async (form) => {
                await api.administration.decideJustification(
                  juntaId,
                  activityId,
                  socioId,
                  item.id,
                  {
                    decision: input(form, 'decision') as DecisionJustificacion,
                    motivo: input(form, 'motivo'),
                  },
                  csrfToken,
                );
                onRefresh();
              }}
            >
              <Choice
                label="Decisión"
                name="decision"
                options={[
                  { id: 'ACEPTADA', label: 'Aceptar' },
                  { id: 'RECHAZADA', label: 'Rechazar' },
                ]}
              />
              <Field label="Motivo de decisión" name="motivo" />
            </ActionForm>
          ))}
      </Section>
      <Section title="Historial de asistencia">
        <Records
          rows={historial}
          columns={[
            { title: 'Fecha', value: (row) => timeLabel(row.ocurridoEn) },
            {
              title: 'Anterior',
              value: (row) => stateLabel(row.estadoAnterior),
            },
            {
              title: 'Resultado',
              value: (row) => stateLabel(row.estadoResultante),
            },
            { title: 'Motivo', value: (row) => row.motivo ?? '—' },
          ]}
        />
      </Section>
    </>
  );
}
