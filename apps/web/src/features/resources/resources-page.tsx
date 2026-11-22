import {
  api,
  ApiError,
  type Activo,
  type ActivoInput,
  type Articulo,
  type ArticuloInput,
  type Estado,
  type Propiedad,
  type PropiedadInput,
  type TipoMovimiento,
} from '@multi-junta/api-client';
import { useCallback, useEffect, useState } from 'react';
import { useResource } from '../../shared/api/use-api';
import {
  ActionForm,
  Choice,
  dateLabel,
  Field,
  input,
  type ModuleProps,
  money,
  PageTitle,
  Records,
  recordStates,
  Resource,
  Section,
  stateLabel,
  timeLabel,
} from '../../shared/ui/records';
import { Feedback, Status } from '../../shared/ui/ui';
import { MemberChoice } from '../administration/registry-page';

const pricePattern = '[0-9]{1,12}([.,][0-9]{1,2})?';
const decimal = (form: FormData, key: string) =>
  input(form, key).replace(',', '.');

export function InventoryPage(props: ModuleProps) {
  const { juntaId, onExpired } = props;
  const [selected, select] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => api.resources.inventory(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  if (selected)
    return (
      <ArticleDetail
        {...props}
        id={selected}
        onBack={() => {
          select(null);
          resource.reload();
        }}
      />
    );

  return (
    <>
      <PageTitle
        title="Inventario"
        description="Artículos, existencias y movimientos de la junta."
        action={
          !creating && (
            <button
              className="button-primary"
              type="button"
              onClick={() => setCreating(true)}
            >
              Nuevo artículo
            </button>
          )
        }
      />
      {creating && (
        <Section title="Nuevo artículo">
          <ArticleForm
            {...props}
            onCancel={() => setCreating(false)}
            onSaved={(item) => {
              setCreating(false);
              select(item.id);
            }}
          />
        </Section>
      )}
      <Resource resource={resource}>
        {(rows) => (
          <Records
            rows={rows}
            columns={[
              { title: 'Artículo', value: (row) => row.nombre },
              { title: 'Categoría', value: (row) => row.categoria },
              {
                title: 'Existencias',
                value: (row) => `${row.stock} ${row.unidad}`,
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
          />
        )}
      </Resource>
    </>
  );
}

function ArticleForm({
  juntaId,
  csrfToken,
  onExpired,
  article,
  onSaved,
  onCancel,
}: ModuleProps & {
  article?: Articulo;
  onSaved: (item: Articulo) => void;
  onCancel: () => void;
}) {
  return (
    <ActionForm
      label={article ? 'Guardar artículo' : 'Registrar artículo'}
      onExpired={onExpired}
      onCancel={onCancel}
      onSubmit={async (form) => {
        const data: ArticuloInput = {
          nombre: input(form, 'nombre'),
          categoria: input(form, 'categoria'),
          unidad: input(form, 'unidad'),
          costoUnitario: decimal(form, 'costoUnitario') || null,
          ...(article ? { estado: input(form, 'estado') as Estado } : {}),
        };
        onSaved(
          article
            ? await api.resources.updateArticle(
                juntaId,
                article.id,
                data,
                csrfToken,
              )
            : await api.resources.createArticle(juntaId, data, csrfToken),
        );
      }}
    >
      <Field
        label="Nombre del artículo"
        name="nombre"
        value={article?.nombre}
      />
      <Field label="Categoría" name="categoria" value={article?.categoria} />
      <Field label="Unidad" name="unidad" value={article?.unidad} />
      <Field
        label="Costo unitario"
        name="costoUnitario"
        value={article?.costoUnitario}
        pattern={pricePattern}
        inputMode="decimal"
        required={false}
      />
      {article && (
        <Choice
          label="Estado"
          name="estado"
          options={recordStates}
          value={article.estado}
        />
      )}
    </ActionForm>
  );
}

function ArticleDetail(
  props: ModuleProps & { id: string; onBack: () => void },
) {
  const { juntaId, csrfToken, onExpired, id, onBack } = props;
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => api.resources.article(juntaId, id, signal),
      [juntaId, id],
    ),
    onExpired,
  );
  const movements = useResource(
    useCallback(
      (signal: AbortSignal) => api.resources.movements(juntaId, id, signal),
      [juntaId, id],
    ),
    onExpired,
  );

  return (
    <>
      <button className="back-link" type="button" onClick={onBack}>
        ← Volver a inventario
      </button>
      <Resource resource={resource}>
        {(article) => (
          <>
            <PageTitle
              title={article.nombre}
              description={`${article.categoria} · ${article.stock} ${article.unidad} en existencia`}
              action={
                <div className="form-actions">
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => setEditing(true)}
                  >
                    Editar artículo
                  </button>
                  {article.estado === 'ACTIVA' && (
                    <button
                      className="button-primary"
                      type="button"
                      onClick={() => setMoving(true)}
                    >
                      Registrar movimiento
                    </button>
                  )}
                </div>
              }
            />
            <Section title="Ficha de inventario">
              <dl className="data-grid">
                <div>
                  <dt>Existencias</dt>
                  <dd>
                    {article.stock} {article.unidad}
                  </dd>
                </div>
                <div>
                  <dt>Costo unitario</dt>
                  <dd>{money(article.costoUnitario)}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>
                    <Status state={article.estado} />
                  </dd>
                </div>
              </dl>
            </Section>
            {editing && (
              <Section title="Editar artículo">
                <ArticleForm
                  {...props}
                  article={article}
                  onCancel={() => setEditing(false)}
                  onSaved={(item) => {
                    resource.update(() => item);
                    setEditing(false);
                  }}
                />
              </Section>
            )}
            {moving && (
              <Section title="Registrar movimiento">
                <ActionForm
                  label="Confirmar movimiento"
                  onExpired={onExpired}
                  onCancel={() => setMoving(false)}
                  onSubmit={async (form) => {
                    await api.resources.addMovement(
                      juntaId,
                      id,
                      {
                        tipo: input(form, 'tipo') as TipoMovimiento,
                        cantidad: decimal(form, 'cantidad'),
                        motivo: input(form, 'motivo'),
                      },
                      csrfToken,
                    );
                    setMoving(false);
                    resource.reload();
                    movements.reload();
                  }}
                >
                  <Choice
                    label="Tipo de movimiento"
                    name="tipo"
                    options={[
                      { id: 'ENTRADA', label: 'Entrada' },
                      { id: 'SALIDA', label: 'Salida' },
                    ]}
                  />
                  <Field
                    label="Cantidad"
                    name="cantidad"
                    pattern="[0-9]{1,11}([.,][0-9]{1,3})?"
                    inputMode="decimal"
                  />
                  <Field label="Motivo" name="motivo" />
                </ActionForm>
              </Section>
            )}
          </>
        )}
      </Resource>
      <Section title="Movimientos">
        <Resource resource={movements}>
          {(rows) => (
            <Records
              rows={rows}
              columns={[
                { title: 'Fecha', value: (row) => timeLabel(row.ocurridoEn) },
                { title: 'Tipo', value: (row) => stateLabel(row.tipo) },
                { title: 'Cantidad', value: (row) => row.cantidad },
                {
                  title: 'Stock resultante',
                  value: (row) => row.stockResultante,
                },
                { title: 'Motivo', value: (row) => row.motivo },
                {
                  title: 'Responsable',
                  value: (row) => (
                    <span title={row.responsableId}>
                      {row.responsableId.slice(0, 8)}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </Resource>
      </Section>
    </>
  );
}

export function AssetsPage(props: ModuleProps) {
  const { juntaId, onExpired } = props;
  const [selected, select] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => api.resources.assets(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  if (selected)
    return (
      <AssetDetail
        {...props}
        id={selected}
        onBack={() => {
          select(null);
          resource.reload();
        }}
      />
    );

  return (
    <>
      <PageTitle
        title="Activos fijos"
        description="Bienes patrimoniales, valor e historial de baja."
        action={
          !creating && (
            <button
              className="button-primary"
              type="button"
              onClick={() => setCreating(true)}
            >
              Nuevo activo
            </button>
          )
        }
      />
      {creating && (
        <Section title="Nuevo activo">
          <AssetForm
            {...props}
            onCancel={() => setCreating(false)}
            onSaved={(item) => {
              setCreating(false);
              select(item.id);
            }}
          />
        </Section>
      )}
      <Resource resource={resource}>
        {(rows) => (
          <Records
            rows={rows}
            columns={[
              { title: 'Bien', value: (row) => row.nombre },
              { title: 'Código', value: (row) => row.codigo },
              { title: 'Ubicación', value: (row) => row.ubicacion },
              { title: 'Valor', value: (row) => money(row.valor) },
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
          />
        )}
      </Resource>
    </>
  );
}

function AssetForm({
  juntaId,
  csrfToken,
  onExpired,
  asset,
  onSaved,
  onCancel,
}: ModuleProps & {
  asset?: Activo;
  onSaved: (item: Activo) => void;
  onCancel: () => void;
}) {
  return (
    <ActionForm
      label={asset ? 'Guardar activo' : 'Registrar activo'}
      onExpired={onExpired}
      onCancel={onCancel}
      onSubmit={async (form) => {
        const code = input(form, 'codigo');
        const life = input(form, 'vidaUtil');
        const data: ActivoInput = {
          ...(code ? { codigo: code } : {}),
          nombre: input(form, 'nombre'),
          descripcion: input(form, 'descripcion'),
          ubicacion: input(form, 'ubicacion'),
          fechaAdquisicion: input(form, 'fechaAdquisicion'),
          valor: decimal(form, 'valor'),
          vidaUtil: life ? Number(life) : null,
          documento: input(form, 'documento'),
        };
        onSaved(
          asset
            ? await api.resources.updateAsset(
                juntaId,
                asset.id,
                data,
                csrfToken,
              )
            : await api.resources.createAsset(juntaId, data, csrfToken),
        );
      }}
    >
      {!asset && <Field label="Código" name="codigo" required={false} />}
      <Field label="Nombre del activo" name="nombre" value={asset?.nombre} />
      <Field
        label="Descripción"
        name="descripcion"
        value={asset?.descripcion}
      />
      <Field label="Ubicación" name="ubicacion" value={asset?.ubicacion} />
      <div className="action-fields">
        <Field
          label="Fecha de adquisición"
          name="fechaAdquisicion"
          type="date"
          value={asset?.fechaAdquisicion.slice(0, 10)}
        />
        <Field
          label="Valor"
          name="valor"
          value={asset?.valor}
          pattern={pricePattern}
          inputMode="decimal"
        />
      </div>
      <Field
        label="Vida útil"
        name="vidaUtil"
        value={asset?.vidaUtil}
        pattern="[0-9]+"
        inputMode="numeric"
        required={false}
      />
      <Field
        label="Documento de adquisición"
        name="documento"
        value={asset?.documento}
      />
    </ActionForm>
  );
}

function AssetDetail(props: ModuleProps & { id: string; onBack: () => void }) {
  const { juntaId, csrfToken, onExpired, id, onBack } = props;
  const [editing, setEditing] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => api.resources.asset(juntaId, id, signal),
      [juntaId, id],
    ),
    onExpired,
  );
  return (
    <>
      <button className="back-link" type="button" onClick={onBack}>
        ← Volver a activos
      </button>
      <Resource resource={resource}>
        {(asset) => (
          <>
            <PageTitle
              title={asset.nombre}
              description={`${asset.codigo} · ${asset.ubicacion}`}
              action={
                asset.estado === 'ACTIVA' && (
                  <div className="form-actions">
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() => setEditing(true)}
                    >
                      Editar activo
                    </button>
                    <button
                      className="button-danger"
                      type="button"
                      onClick={() => setRetiring(true)}
                    >
                      Dar de baja
                    </button>
                  </div>
                )
              }
            />
            <Section title="Ficha del activo">
              <dl className="data-grid">
                <div>
                  <dt>Descripción</dt>
                  <dd>{asset.descripcion}</dd>
                </div>
                <div>
                  <dt>Fecha de adquisición</dt>
                  <dd>{dateLabel(asset.fechaAdquisicion)}</dd>
                </div>
                <div>
                  <dt>Valor</dt>
                  <dd>{money(asset.valor)}</dd>
                </div>
                <div>
                  <dt>Vida útil</dt>
                  <dd>{asset.vidaUtil ?? '—'}</dd>
                </div>
                <div>
                  <dt>Documento</dt>
                  <dd>{asset.documento}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>
                    <Status state={asset.estado} />
                  </dd>
                </div>
                {asset.motivoBaja && (
                  <div>
                    <dt>Motivo de baja</dt>
                    <dd>{asset.motivoBaja}</dd>
                  </div>
                )}
              </dl>
            </Section>
            {editing && (
              <Section title="Editar activo">
                <AssetForm
                  {...props}
                  asset={asset}
                  onCancel={() => setEditing(false)}
                  onSaved={(item) => {
                    resource.update(() => item);
                    setEditing(false);
                  }}
                />
              </Section>
            )}
            {retiring && (
              <Section title="Dar de baja el activo">
                <ActionForm
                  label="Confirmar baja"
                  onExpired={onExpired}
                  onCancel={() => setRetiring(false)}
                  onSubmit={async (form) => {
                    const updated = await api.resources.retireAsset(
                      juntaId,
                      id,
                      input(form, 'motivo'),
                      csrfToken,
                    );
                    resource.update(() => updated);
                    setRetiring(false);
                    setEditing(false);
                  }}
                >
                  <Field label="Motivo de baja" name="motivo" />
                </ActionForm>
              </Section>
            )}
          </>
        )}
      </Resource>
    </>
  );
}

export function PropertiesPage(props: ModuleProps) {
  const { juntaId, onExpired } = props;
  const [selected, select] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => api.resources.properties(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  if (selected)
    return (
      <PropertyDetail
        {...props}
        id={selected}
        onBack={() => {
          select(null);
          resource.reload();
        }}
      />
    );

  return (
    <>
      <PageTitle
        title="Propiedades"
        description="Predios y recursos asignados a socios y sectores."
        action={
          !creating && (
            <button
              className="button-primary"
              type="button"
              onClick={() => setCreating(true)}
            >
              Nueva propiedad
            </button>
          )
        }
      />
      {creating && (
        <Section title="Nueva propiedad">
          <PropertyForm
            {...props}
            onCancel={() => setCreating(false)}
            onSaved={(item) => {
              setCreating(false);
              select(item.id);
            }}
          />
        </Section>
      )}
      <Resource resource={resource}>
        {(rows) => (
          <Records
            rows={rows}
            columns={[
              { title: 'Propiedad', value: (row) => row.nombre },
              { title: 'Dimensiones', value: (row) => row.dimensiones },
              {
                title: 'Foto',
                value: (row) => (row.tieneFoto ? 'Registrada' : '—'),
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
          />
        )}
      </Resource>
    </>
  );
}

function PropertyForm({
  juntaId,
  csrfToken,
  onExpired,
  property,
  onSaved,
  onCancel,
}: ModuleProps & {
  property?: Propiedad;
  onSaved: (item: Propiedad) => void;
  onCancel: () => void;
}) {
  const sectors = useResource(
    useCallback(
      (signal: AbortSignal) => api.administration.sectors(juntaId, signal),
      [juntaId],
    ),
    onExpired,
  );
  return (
    <Resource resource={sectors}>
      {(rows) => (
        <ActionForm
          label={property ? 'Guardar propiedad' : 'Registrar propiedad'}
          onExpired={onExpired}
          onCancel={onCancel}
          onSubmit={async (form) => {
            const data: PropiedadInput = {
              nombre: input(form, 'nombre'),
              socioId: input(form, 'socioId'),
              sectorId: input(form, 'sectorId'),
              dimensiones: input(form, 'dimensiones'),
              latitud: decimal(form, 'latitud') || null,
              longitud: decimal(form, 'longitud') || null,
              ...(property ? { estado: input(form, 'estado') as Estado } : {}),
            };
            onSaved(
              property
                ? await api.resources.updateProperty(
                    juntaId,
                    property.id,
                    data,
                    csrfToken,
                  )
                : await api.resources.createProperty(juntaId, data, csrfToken),
            );
          }}
        >
          <Field
            label="Nombre de la propiedad"
            name="nombre"
            value={property?.nombre}
          />
          <MemberChoice
            juntaId={juntaId}
            onExpired={onExpired}
            value={property?.socioId}
          />
          <Choice
            label="Sector"
            name="sectorId"
            value={property?.sectorId}
            options={rows
              .filter(
                (row) =>
                  row.estado === 'ACTIVA' || row.id === property?.sectorId,
              )
              .map((row) => ({ id: row.id, label: row.nombre }))}
          />
          <Field
            label="Dimensiones"
            name="dimensiones"
            value={property?.dimensiones}
          />
          <div className="action-fields">
            <Field
              label="Latitud"
              name="latitud"
              value={property?.latitud}
              required={false}
              inputMode="decimal"
            />
            <Field
              label="Longitud"
              name="longitud"
              value={property?.longitud}
              required={false}
              inputMode="decimal"
            />
          </div>
          {property && (
            <Choice
              label="Estado"
              name="estado"
              options={recordStates}
              value={property.estado}
            />
          )}
        </ActionForm>
      )}
    </Resource>
  );
}

function PropertyDetail(
  props: ModuleProps & { id: string; onBack: () => void },
) {
  const { juntaId, csrfToken, onExpired, id, onBack } = props;
  const [editing, setEditing] = useState(false);
  const [photoRevision, revisePhoto] = useState(0);
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => api.resources.property(juntaId, id, signal),
      [juntaId, id],
    ),
    onExpired,
  );
  return (
    <>
      <button className="back-link" type="button" onClick={onBack}>
        ← Volver a propiedades
      </button>
      <Resource resource={resource}>
        {(property) => (
          <>
            <PageTitle
              title={property.nombre}
              description={property.dimensiones}
              action={
                !editing && (
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => setEditing(true)}
                  >
                    Editar propiedad
                  </button>
                )
              }
            />
            {editing ? (
              <Section title="Editar propiedad">
                <PropertyForm
                  {...props}
                  property={property}
                  onCancel={() => setEditing(false)}
                  onSaved={(item) => {
                    resource.update(() => item);
                    setEditing(false);
                  }}
                />
              </Section>
            ) : (
              <PropertyRelations {...props} property={property} />
            )}
            <Section title="Ubicación geográfica">
              <CoordinateGrid property={property} />
            </Section>
            <Section title="Foto de la propiedad">
              {property.tieneFoto && (
                <PropertyPhoto
                  key={photoRevision}
                  id={id}
                  juntaId={juntaId}
                  onExpired={onExpired}
                />
              )}
              <ActionForm
                key={photoRevision}
                label="Guardar foto"
                onExpired={onExpired}
                onSubmit={async (form) => {
                  const photo = form.get('archivo');
                  if (
                    !(photo instanceof File) ||
                    photo.type !== 'image/jpeg' ||
                    photo.size > 2 * 1024 * 1024
                  )
                    throw new ApiError(
                      400,
                      'Selecciona una foto JPEG de hasta 2 MiB.',
                    );
                  await api.resources.uploadPropertyPhoto(
                    juntaId,
                    id,
                    form,
                    csrfToken,
                  );
                  resource.update((item) => ({ ...item, tieneFoto: true }));
                  revisePhoto((previous) => previous + 1);
                }}
              >
                <Field
                  label="Foto JPEG"
                  name="archivo"
                  type="file"
                  accept="image/jpeg"
                />
                <p className="muted text-sm">Máximo 2 MiB.</p>
              </ActionForm>
            </Section>
          </>
        )}
      </Resource>
    </>
  );
}

function PropertyRelations({
  juntaId,
  property,
  onExpired,
}: ModuleProps & { property: Propiedad }) {
  const references = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const [socio, sector] = await Promise.all([
          api.administration.socio(juntaId, property.socioId, signal),
          api.administration.sector(juntaId, property.sectorId, signal),
        ]);
        return { socio, sector };
      },
      [juntaId, property.socioId, property.sectorId],
    ),
    onExpired,
  );

  return (
    <Section title="Datos de la propiedad">
      <dl className="data-grid">
        <div>
          <dt>Dimensiones</dt>
          <dd>{property.dimensiones}</dd>
        </div>
        {references.state.kind === 'ready' && (
          <>
            <div>
              <dt>Socio</dt>
              <dd>
                {references.state.data.socio.nombres}{' '}
                {references.state.data.socio.apellidos}
              </dd>
            </div>
            <div>
              <dt>Sector</dt>
              <dd>{references.state.data.sector.nombre}</dd>
            </div>
          </>
        )}
        {references.state.kind === 'error' && (
          <div>
            <dt>Vínculos</dt>
            <dd>{references.state.message}</dd>
          </div>
        )}
        <div>
          <dt>Estado</dt>
          <dd>
            <Status state={property.estado} />
          </dd>
        </div>
      </dl>
    </Section>
  );
}

function CoordinateGrid({ property }: { property: Propiedad }) {
  const { latitud, longitud } = property;
  if (latitud == null || longitud == null)
    return (
      <Feedback>Esta propiedad no tiene coordenadas registradas.</Feedback>
    );
  const x = ((Number(longitud) + 180) * 100) / 360;
  const y = ((90 - Number(latitud)) * 100) / 180;
  return (
    <>
      <div
        className="geo-grid"
        role="img"
        aria-label={`Latitud ${latitud} grados, longitud ${longitud} grados`}
      >
        <span className="geo-north" aria-hidden="true">
          N
        </span>
        <span
          className="geo-marker"
          style={{ left: `${x}%`, top: `${y}%` }}
          aria-hidden="true"
        />
      </div>
      <p className="muted mt-2 text-sm">
        Latitud {latitud}° · Longitud {longitud}°
      </p>
    </>
  );
}

function PropertyPhoto({
  id,
  juntaId,
  onExpired,
}: {
  id: string;
  juntaId: string;
  onExpired: () => void;
}) {
  const photo = useResource(
    useCallback(
      (signal: AbortSignal) => api.resources.propertyPhoto(juntaId, id, signal),
      [juntaId, id],
    ),
    onExpired,
  );
  const [url, setUrl] = useState('');
  const blob = photo.state.kind === 'ready' ? photo.state.data : null;
  useEffect(() => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return (
    <Resource resource={photo}>
      {() =>
        url ? (
          <img
            className="property-photo"
            src={url}
            alt="Foto registrada para esta propiedad"
          />
        ) : null
      }
    </Resource>
  );
}
