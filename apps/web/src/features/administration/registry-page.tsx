import {
  api,
  type Estado,
  type Sector,
  type SectorInput,
  type Socio,
  type SocioInput,
} from '@multi-junta/api-client';
import { useCallback, useState } from 'react';
import { useResource } from '../../shared/api/use-api';
import {
  ActionForm,
  Choice,
  Field,
  input,
  PageTitle,
  Records,
  recordStates,
  Resource,
  Section,
  type ModuleProps,
} from '../../shared/ui/records';
import { Pagination, Status } from '../../shared/ui/ui';

const socioName = (socio: Socio) => `${socio.nombres} ${socio.apellidos}`;

export function SectorsPage(props: ModuleProps & { canWrite: boolean }) {
  const { juntaId, onExpired, canWrite } = props;
  const [selected, select] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const sectors = useResource(
    useCallback(
      (signal) => api.administration.sectors(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );

  if (selected)
    return (
      <SectorDetail
        {...props}
        id={selected}
        onBack={() => {
          select(null);
          sectors.reload();
        }}
      />
    );

  return (
    <>
      <PageTitle
        title="Sectores"
        description="Zonas de la junta y socios asignados."
        action={
          canWrite &&
          !creating && (
            <button
              type="button"
              className="button-primary"
              onClick={() => setCreating(true)}
            >
              Nuevo sector
            </button>
          )
        }
      />
      {creating && (
        <Section title="Nuevo sector">
          <SectorForm
            {...props}
            onCancel={() => setCreating(false)}
            onSave={(sector) => {
              setCreating(false);
              select(sector.id);
            }}
          />
        </Section>
      )}
      <Resource resource={sectors}>
        {(rows) => (
          <Records
            rows={rows}
            columns={[
              { title: 'Sector', value: (row) => row.nombre },
              { title: 'Clasificación', value: (row) => row.clasificacion },
              {
                title: 'Estado',
                value: (row) => <Status state={row.estado} />,
              },
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
            empty="Aún no hay sectores registrados."
          />
        )}
      </Resource>
    </>
  );
}

function SectorForm({
  juntaId,
  csrfToken,
  onExpired,
  sector,
  onSave,
  onCancel,
}: ModuleProps & {
  sector?: Sector;
  onSave: (row: Sector) => void;
  onCancel: () => void;
}) {
  return (
    <ActionForm
      label={sector ? 'Guardar sector' : 'Registrar sector'}
      onExpired={onExpired}
      onCancel={onCancel}
      onSubmit={async (form) => {
        const data: SectorInput = {
          nombre: input(form, 'nombre'),
          clasificacion: input(form, 'clasificacion'),
          descripcion: input(form, 'descripcion') || null,
        };
        if (sector) data.estado = input(form, 'estado') as Estado;
        onSave(
          sector
            ? await api.administration.updateSector(
                juntaId,
                sector.id,
                data,
                csrfToken,
              )
            : await api.administration.createSector(juntaId, data, csrfToken),
        );
      }}
    >
      <Field label="Nombre del sector" name="nombre" value={sector?.nombre} />
      <Field
        label="Clasificación"
        name="clasificacion"
        value={sector?.clasificacion}
      />
      <Field
        label="Descripción"
        name="descripcion"
        value={sector?.descripcion}
        required={false}
      />
      {sector && (
        <Choice
          label="Estado"
          name="estado"
          value={sector.estado}
          options={recordStates}
        />
      )}
    </ActionForm>
  );
}

function SectorDetail(
  props: ModuleProps & { id: string; canWrite: boolean; onBack: () => void },
) {
  const { juntaId, id, onExpired, onBack, canWrite } = props;
  const [editing, setEditing] = useState(false);
  const detail = useResource(
    useCallback(
      (signal) => api.administration.sector(juntaId, id, signal),
      [juntaId, id],
    ),
    onExpired,
  );
  const members = useResource(
    useCallback(
      (signal) => api.administration.sectorMembers(juntaId, id, signal),
      [juntaId, id],
    ),
    onExpired,
  );
  return (
    <>
      <button className="back-link" type="button" onClick={onBack}>
        ← Volver a sectores
      </button>
      <Resource resource={detail}>
        {(sector) => (
          <>
            <PageTitle
              title={sector.nombre}
              description={sector.descripcion || sector.clasificacion}
              action={
                canWrite &&
                !editing && (
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => setEditing(true)}
                  >
                    Editar sector
                  </button>
                )
              }
            />
            {editing ? (
              <Section title="Editar sector">
                <SectorForm
                  {...props}
                  sector={sector}
                  onCancel={() => setEditing(false)}
                  onSave={(updated) => {
                    detail.update(() => updated);
                    setEditing(false);
                  }}
                />
              </Section>
            ) : (
              <Section title="Datos del sector">
                <p>
                  {sector.clasificacion} <Status state={sector.estado} />
                </p>
              </Section>
            )}
          </>
        )}
      </Resource>
      <Section title="Socios del sector">
        <Resource resource={members}>
          {(rows) => (
            <Records
              rows={rows}
              columns={[
                { title: 'Socio', value: socioName },
                {
                  title: 'Estado',
                  value: (row) => <Status state={row.estado} />,
                },
              ]}
            />
          )}
        </Resource>
      </Section>
    </>
  );
}

export function SociosPage(props: ModuleProps & { canWrite: boolean }) {
  const { juntaId, onExpired, canWrite } = props;
  const [filter, setFilter] = useState<{
    q?: string;
    estado?: Estado;
    sectorId?: string;
    offset?: number;
  }>({});
  const [selected, select] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const sectors = useResource(
    useCallback(
      (signal) => api.administration.sectors(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  const members = useResource(
    useCallback(
      (signal) => api.administration.socios(juntaId, filter, signal),
      [juntaId, filter],
    ),
    onExpired,
  );
  const sectorOptions = (
    sectors.state.kind === 'ready' ? sectors.state.data : []
  ).map((sector) => ({ id: sector.id, label: sector.nombre }));

  if (selected)
    return (
      <SocioDetail
        {...props}
        id={selected}
        onBack={() => {
          select(null);
          members.reload();
        }}
      />
    );

  return (
    <>
      <PageTitle
        title="Socios"
        description="Padrón de la junta y asignación de sectores."
        action={
          canWrite &&
          !creating && (
            <button
              type="button"
              className="button-primary"
              onClick={() => setCreating(true)}
            >
              Nuevo socio
            </button>
          )
        }
      />
      {creating && (
        <Section title="Nuevo socio">
          <SocioForm
            {...props}
            onCancel={() => setCreating(false)}
            onSave={(socio) => {
              setCreating(false);
              select(socio.id);
            }}
          />
        </Section>
      )}
      <form
        className="panel form-panel filter-bar mb-5 form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setFilter({
            q: input(form, 'q') || undefined,
            estado: (input(form, 'estado') || undefined) as Estado | undefined,
            sectorId: input(form, 'sectorId') || undefined,
          });
        }}
      >
        <Field
          label="Buscar socio"
          name="q"
          value={filter.q}
          type="search"
          required={false}
        />
        <Choice
          label="Estado"
          name="estado"
          value={filter.estado}
          options={recordStates}
          optional
          emptyLabel="Todos los estados"
        />
        <Choice
          label="Sector"
          name="sectorId"
          value={filter.sectorId}
          options={sectorOptions}
          optional
          emptyLabel="Todos los sectores"
        />
        <button type="submit" className="button-secondary">
          Filtrar socios
        </button>
      </form>
      <Resource resource={members}>
        {(rows) => (
          <>
            <Records
              rows={rows}
              columns={[
                { title: 'Socio', value: socioName },
                { title: 'Cédula', value: (row) => row.cedula ?? '—' },
                {
                  title: 'Sector',
                  value: (row) =>
                    sectorOptions.find((sector) => sector.id === row.sectorId)
                      ?.label ?? '—',
                },
                {
                  title: 'Estado',
                  value: (row) => <Status state={row.estado} />,
                },
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
              empty="No hay socios que coincidan con la consulta."
            />
            <Pagination
              offset={filter.offset ?? 0}
              count={rows.length}
              onChange={(offset) => setFilter({ ...filter, offset })}
            />
          </>
        )}
      </Resource>
    </>
  );
}

function SocioForm({
  juntaId,
  csrfToken,
  onExpired,
  socio,
  onSave,
  onCancel,
}: ModuleProps & {
  socio?: Socio;
  onSave: (row: Socio) => void;
  onCancel: () => void;
}) {
  const sectors = useResource(
    useCallback(
      (signal) => api.administration.sectors(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  return (
    <Resource resource={sectors}>
      {(rows) => (
        <ActionForm
          label={socio ? 'Guardar socio' : 'Registrar socio'}
          onExpired={onExpired}
          onCancel={onCancel}
          onSubmit={async (form) => {
            const data: SocioInput = {
              cedula: input(form, 'cedula'),
              nombres: input(form, 'nombres'),
              apellidos: input(form, 'apellidos'),
              sectorId: input(form, 'sectorId') || null,
            };
            if (socio) data.estado = input(form, 'estado') as Estado;
            onSave(
              socio
                ? await api.administration.updateSocio(
                    juntaId,
                    socio.id,
                    data,
                    csrfToken,
                  )
                : await api.administration.createSocio(
                    juntaId,
                    data,
                    csrfToken,
                  ),
            );
          }}
        >
          <Field
            label="Cédula"
            name="cedula"
            value={socio?.cedula}
            pattern="[0-9]{10}"
            maxLength={10}
            inputMode="numeric"
          />
          <Field label="Nombres" name="nombres" value={socio?.nombres} />
          <Field label="Apellidos" name="apellidos" value={socio?.apellidos} />
          <Choice
            label="Sector"
            name="sectorId"
            options={rows
              .filter((r) => r.estado === 'ACTIVA' || r.id === socio?.sectorId)
              .map((r) => ({ id: r.id, label: r.nombre }))}
            value={socio?.sectorId}
            optional
          />
          {socio && (
            <Choice
              label="Estado"
              name="estado"
              value={socio.estado}
              options={recordStates}
            />
          )}
        </ActionForm>
      )}
    </Resource>
  );
}

function SocioDetail(
  props: ModuleProps & { id: string; canWrite: boolean; onBack: () => void },
) {
  const { juntaId, id, onExpired, onBack, canWrite } = props;
  const [editing, setEditing] = useState(false);
  const detail = useResource(
    useCallback(
      (signal) => api.administration.socio(juntaId, id, signal),
      [juntaId, id],
    ),
    onExpired,
  );
  const sectors = useResource(
    useCallback(
      (signal) => api.administration.sectors(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  return (
    <>
      <button className="back-link" type="button" onClick={onBack}>
        ← Volver al padrón
      </button>
      <Resource resource={detail}>
        {(socio) => (
          <>
            <PageTitle
              title={socioName(socio)}
              description="Ficha del padrón de la junta."
              action={
                canWrite &&
                !editing && (
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => setEditing(true)}
                  >
                    Editar socio
                  </button>
                )
              }
            />
            {editing ? (
              <Section title="Editar socio">
                <SocioForm
                  {...props}
                  socio={socio}
                  onCancel={() => setEditing(false)}
                  onSave={(updated) => {
                    detail.update(() => updated);
                    setEditing(false);
                  }}
                />
              </Section>
            ) : (
              <Section title="Datos del socio">
                <dl className="data-grid">
                  <div>
                    <dt>Cédula</dt>
                    <dd>{socio.cedula ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Sector</dt>
                    <dd>
                      {sectors.state.kind === 'ready'
                        ? (sectors.state.data.find(
                            (sector) => sector.id === socio.sectorId,
                          )?.nombre ?? 'Sin asignar')
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Estado</dt>
                    <dd>
                      <Status state={socio.estado} />
                    </dd>
                  </div>
                </dl>
              </Section>
            )}
          </>
        )}
      </Resource>
    </>
  );
}

export function MemberChoice({
  juntaId,
  onExpired,
  value,
  label = 'Socio',
}: {
  juntaId: string;
  onExpired: () => void;
  value?: string;
  label?: string;
}) {
  const [search, setSearch] = useState('');
  const members = useResource(
    useCallback(
      (signal) =>
        api.administration.socios(
          juntaId,
          { q: search || undefined, estado: 'ACTIVA' },
          signal,
        ),
      [juntaId, search],
    ),
    onExpired,
  );
  const current = useResource(
    useCallback(
      (signal) =>
        value
          ? api.administration.socio(juntaId, value, signal)
          : Promise.resolve(null),
      [juntaId, value],
    ),
    onExpired,
  );
  return (
    <>
      <label>
        Buscar socio por nombre
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <Resource resource={members}>
        {(rows) => {
          const selected =
            current.state.kind === 'ready' ? current.state.data : null;
          const available =
            selected && !rows.some((row) => row.id === selected.id)
              ? [selected, ...rows]
              : rows;
          return (
            <Choice
              label={label}
              name="socioId"
              options={available.map((socio) => ({
                id: socio.id,
                label: socioName(socio),
              }))}
              value={value}
            />
          );
        }}
      </Resource>
    </>
  );
}
