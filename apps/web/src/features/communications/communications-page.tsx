import { api } from '@multi-junta/api-client';
import { useCallback, useState } from 'react';
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
  timeLabel,
} from '../../shared/ui/records';
import { Feedback, roleNames } from '../../shared/ui/ui';
import { ActivityPicker } from '../../shared/ui/activity-picker';

function DownloadAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => Promise<void>;
}) {
  const action = useCommand();
  return (
    <>
      <button
        className="table-link"
        type="button"
        disabled={action.busy}
        onClick={() => void action.run(onClick)}
      >
        {label}
      </button>
      {action.error && <Feedback error>{action.error}</Feedback>}
    </>
  );
}

export function ConvocationsPage({
  juntaId,
  csrfToken,
  onExpired,
  canWrite,
}: ModuleProps & { canWrite: boolean }) {
  const [creating, setCreating] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const data = useResource(
    useCallback(
      (signal: AbortSignal) => api.communications.convocations(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const candidates = useResource(
    useCallback(
      (signal: AbortSignal) =>
        canWrite
          ? api.communications.recipients(juntaId, signal)
          : Promise.resolve([]),
      [juntaId, canWrite],
    ),
    onExpired,
  );
  const activities = useResource(
    useCallback(
      (signal: AbortSignal) =>
        canWrite
          ? api.administration.activities(juntaId, signal)
          : Promise.resolve([]),
      [juntaId, canWrite],
    ),
    onExpired,
  );
  const command = useCommand(onExpired);
  return (
    <>
      <PageTitle
        title="Convocatorias"
        description="Publicaciones internas dirigidas a los integrantes de la junta."
        action={
          canWrite && (
            <button
              className="button-primary"
              type="button"
              onClick={() => setCreating((v) => !v)}
            >
              {creating ? 'Cerrar' : 'Nueva convocatoria'}
            </button>
          )
        }
      />
      {creating && (
        <Section title="Publicar convocatoria">
          <Resource resource={activities}>
            {(rows) => (
              <Resource resource={candidates}>
                {(members) => (
                  <ActionForm
                    label="Publicar convocatoria"
                    disabled={recipients.length === 0}
                    onExpired={onExpired}
                    onCancel={() => setCreating(false)}
                    onSubmit={async (form) => {
                      await api.communications.createConvocation(
                        juntaId,
                        {
                          actividadId: input(form, 'actividadId'),
                          asunto: input(form, 'asunto'),
                          contenido: input(form, 'contenido'),
                          destinatarios: recipients,
                        },
                        csrfToken,
                      );
                      data.reload();
                      setCreating(false);
                      setRecipients([]);
                    }}
                  >
                    <ActivityPicker activities={rows} name="actividadId" />
                    <Field name="asunto" label="Asunto" maxLength={180} />
                    <label>
                      Contenido
                      <textarea
                        name="contenido"
                        maxLength={5000}
                        required
                        rows={4}
                      />
                    </label>
                    <fieldset className="recipient-fieldset">
                      <legend>Destinatarios</legend>
                      <div className="recipient-toolbar">
                        <span>
                          {recipients.length} seleccionados de {members.length}
                        </span>
                        <div className="recipient-toolbar-actions">
                          <button
                            type="button"
                            className="table-link"
                            onClick={() =>
                              setRecipients(members.map((member) => member.id))
                            }
                            disabled={members.length === 0}
                          >
                            Seleccionar todos
                          </button>
                          <button
                            type="button"
                            className="table-link"
                            onClick={() => setRecipients([])}
                            disabled={recipients.length === 0}
                          >
                            Limpiar
                          </button>
                        </div>
                      </div>
                      {members.length > 0 ? (
                        <ul className="recipient-list">
                          {members.map((member) => (
                            <li key={member.id}>
                              <label className="recipient-item">
                                <input
                                  type="checkbox"
                                  checked={recipients.includes(member.id)}
                                  onChange={(event) =>
                                    setRecipients((previous) =>
                                      event.target.checked
                                        ? [...previous, member.id]
                                        : previous.filter(
                                            (id) => id !== member.id,
                                          ),
                                    )
                                  }
                                />
                                <span className="recipient-name">
                                  {member.usuario}
                                </span>
                                <span className="recipient-role">
                                  {roleNames[
                                    member.rol as keyof typeof roleNames
                                  ] ?? member.rol}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <Feedback>
                          Sin destinatarios activos para esta junta.
                        </Feedback>
                      )}
                    </fieldset>
                    {recipients.length === 0 && (
                      <Feedback>Selecciona al menos un destinatario.</Feedback>
                    )}
                  </ActionForm>
                )}
              </Resource>
            )}
          </Resource>
        </Section>
      )}
      {command.error && <Feedback error>{command.error}</Feedback>}
      <Resource resource={data}>
        {(rows) => (
          <Records
            rows={rows}
            columns={[
              { title: 'Asunto', value: (r) => r.asunto },
              { title: 'Actividad', value: (r) => r.tituloActividad ?? '—' },
              {
                title: 'Publicada',
                value: (r) => (r.emitidaEn ? timeLabel(r.emitidaEn) : '—'),
              },
              { title: 'Estado', value: (r) => r.estado },
              {
                title: 'PDF',
                value: (r) => (
                  <DownloadAction
                    label="Descargar"
                    onClick={async () => {
                      download(
                        await api.communications.convocationPdf(juntaId, r.id),
                        `convocatoria-${r.id}.pdf`,
                      );
                    }}
                  />
                ),
              },
              {
                title: 'Acción',
                value: (r) =>
                  canWrite && r.estado === 'PUBLICADA' ? (
                    <button
                      className="table-link"
                      disabled={command.busy}
                      type="button"
                      onClick={() =>
                        void command.run(async () => {
                          await api.communications.archiveConvocation(
                            juntaId,
                            r.id,
                            csrfToken,
                          );
                          data.reload();
                        })
                      }
                    >
                      Archivar
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

export function DocumentsPage({
  juntaId,
  csrfToken,
  onExpired,
  canWrite,
}: ModuleProps & { canWrite: boolean }) {
  const [creating, setCreating] = useState(false);
  const data = useResource(
    useCallback(
      (signal: AbortSignal) => api.communications.documents(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const [documentType, setDocumentType] = useState('ACTA');
  const command = useCommand(onExpired);
  return (
    <>
      <PageTitle
        title="Documentos y oficios"
        description="Archivo autorizado de actas, acuerdos, resoluciones y correspondencia."
        action={
          canWrite && (
            <button
              className="button-primary"
              type="button"
              onClick={() => setCreating((v) => !v)}
            >
              {creating ? 'Cerrar' : 'Registrar documento'}
            </button>
          )
        }
      />
      {creating && (
        <Section title="Documento institucional">
          <ActionForm
            label="Registrar documento"
            onExpired={onExpired}
            onCancel={() => setCreating(false)}
            onSubmit={async (form) => {
              if (documentType !== 'OFICIO') form.delete('institucion');
              await api.communications.createDocument(juntaId, form, csrfToken);
              data.reload();
              setCreating(false);
            }}
          >
            <label>
              Tipo
              <select
                name="tipo"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
              >
                <option value="ACTA">Acta</option>
                <option value="RESOLUCION">Resolución</option>
                <option value="ACUERDO">Acuerdo</option>
                <option value="OFICIO">Oficio recibido</option>
              </select>
            </label>
            <Field label="Título" name="titulo" maxLength={180} />
            <Field label="Fecha" name="fecha" type="date" />
            <label>
              Descripción
              <textarea name="descripcion" rows={3} required maxLength={3000} />
            </label>
            {documentType === 'OFICIO' && (
              <Field
                name="institucion"
                label="Institución remitente"
                maxLength={180}
              />
            )}
            <Field
              type="file"
              name="archivo"
              label="Archivo PDF (máximo 2 MiB)"
              accept="application/pdf"
            />
          </ActionForm>
        </Section>
      )}
      {command.error && <Feedback error>{command.error}</Feedback>}
      <Resource resource={data}>
        {(rows) => (
          <Records
            rows={rows}
            columns={[
              { title: 'Título', value: (r) => r.titulo },
              { title: 'Tipo', value: (r) => r.tipo },
              { title: 'Fecha', value: (r) => dateLabel(r.fecha ?? '') },
              { title: 'Estado', value: (r) => r.estado },
              {
                title: 'Archivo',
                value: (r) => (
                  <DownloadAction
                    label="Descargar PDF"
                    onClick={async () => {
                      download(
                        await api.communications.documentFile(juntaId, r.id),
                        `documento-${r.id}.pdf`,
                      );
                    }}
                  />
                ),
              },
              {
                title: 'Acción',
                value: (r) =>
                  canWrite && r.estado === 'PUBLICADO' ? (
                    <button
                      className="table-link"
                      type="button"
                      disabled={command.busy}
                      onClick={() =>
                        void command.run(async () => {
                          await api.communications.archiveDocument(
                            juntaId,
                            r.id,
                            csrfToken,
                          );
                          data.reload();
                        })
                      }
                    >
                      Archivar
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

export function MessagesPage({ juntaId, csrfToken, onExpired }: ModuleProps) {
  const own = useResource(
    useCallback(
      (signal: AbortSignal) => api.tenant.ownMembership(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const recipients = useResource(
    useCallback(
      (signal: AbortSignal) => api.communications.recipients(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const messages = useResource(
    useCallback(
      (signal: AbortSignal) => api.communications.messages(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  function memberName(id: string): string {
    if (own.state.kind === 'ready' && own.state.data.membresiaId === id)
      return 'Yo';
    if (recipients.state.kind === 'ready') {
      const person = recipients.state.data.find((item) => item.id === id);
      if (person) return person.usuario;
    }
    return 'Miembro no disponible';
  }
  return (
    <>
      <PageTitle
        title="Mensajes internos"
        description="Mensajería privada entre socios y administradores de esta junta."
      />
      <Section title="Enviar mensaje">
        <Resource resource={recipients}>
          {(users) => (
            <ActionForm
              label="Enviar mensaje"
              onExpired={onExpired}
              onSubmit={async (form) => {
                await api.communications.sendMessage(juntaId, form, csrfToken);
                messages.reload();
              }}
            >
              <Choice
                name="destinatarioId"
                label="Destinatario"
                options={users.map((u) => ({
                  id: u.id,
                  label: `${u.usuario} — ${u.rol}`,
                }))}
              />
              <label>
                Mensaje
                <textarea name="texto" maxLength={3000} rows={3} required />
              </label>
              <Field
                name="archivo"
                type="file"
                label="Adjunto PDF opcional (hasta 2 MiB)"
                accept="application/pdf"
                required={false}
              />
            </ActionForm>
          )}
        </Resource>
      </Section>
      <Section title="Mi correspondencia">
        <Resource resource={messages}>
          {(rows) => (
            <Records
              rows={rows}
              columns={[
                { title: 'Fecha', value: (r) => timeLabel(r.creadoEn) },
                { title: 'Mensaje', value: (r) => r.texto },
                { title: 'Remitente', value: (r) => memberName(r.remitenteId) },
                {
                  title: 'Destinatario',
                  value: (r) => memberName(r.destinatarioId),
                },
                {
                  title: 'Adjunto',
                  value: (r) =>
                    r.tieneArchivo ? (
                      <DownloadAction
                        label="Descargar"
                        onClick={async () => {
                          download(
                            await api.communications.messageFile(juntaId, r.id),
                            `mensaje-${r.id}.pdf`,
                          );
                        }}
                      />
                    ) : (
                      '—'
                    ),
                },
              ]}
              empty="Todavía no tienes mensajes."
            />
          )}
        </Resource>
      </Section>
    </>
  );
}
