import {
  api,
  type ReportType,
  type ReportFilters,
} from '@multi-junta/api-client';
import { useCallback, useState } from 'react';
import { useCommand, useResource } from '../../shared/api/use-api';
import {
  Choice,
  download,
  Field,
  input,
  type ModuleProps,
  PageTitle,
  Resource,
  Section,
} from '../../shared/ui/records';
import { Feedback } from '../../shared/ui/ui';

const reportList: { id: ReportType; label: string; roles: string[] }[] = [
  {
    id: 'padron',
    label: 'Padrón de socios',
    roles: ['ADMIN_JUNTA', 'SECRETARIA'],
  },
  {
    id: 'sectores',
    label: 'Sectores y socios',
    roles: ['ADMIN_JUNTA', 'SECRETARIA'],
  },
  { id: 'asistencia', label: 'Asistencias', roles: ['SECRETARIA'] },
  { id: 'ausencias', label: 'Inasistencias', roles: ['SECRETARIA'] },
  {
    id: 'multas',
    label: 'Multas y obligaciones',
    roles: ['SECRETARIA', 'TESORERIA'],
  },
  { id: 'pagos', label: 'Pagos', roles: ['TESORERIA'] },
  { id: 'gastos', label: 'Gastos', roles: ['TESORERIA'] },
  {
    id: 'resumen-financiero',
    label: 'Resumen financiero',
    roles: ['TESORERIA'],
  },
  { id: 'inventario', label: 'Inventario', roles: ['TESORERIA'] },
  { id: 'movimientos', label: 'Movimientos', roles: ['TESORERIA'] },
  { id: 'activos', label: 'Activos fijos', roles: ['TESORERIA'] },
];

function cell(value: unknown) {
  return value == null ? '—' : String(value);
}

export function ReportsPage({
  juntaId,
  onExpired,
  role,
}: ModuleProps & { role: 'ADMIN_JUNTA' | 'SECRETARIA' | 'TESORERIA' }) {
  const options = reportList.filter((x) => x.roles.includes(role));
  const [type, setType] = useState<ReportType>(options[0].id);
  const [filters, setFilters] = useState<ReportFilters>({});
  const exportCommand = useCommand(onExpired);
  const data = useResource(
    useCallback(
      (signal: AbortSignal) =>
        api.reports.report(juntaId, type, filters, signal),
      [juntaId, type, filters],
    ),
    onExpired,
  );
  const canDates = [
    'asistencia',
    'ausencias',
    'multas',
    'pagos',
    'gastos',
    'resumen-financiero',
    'movimientos',
  ].includes(type);
  const canSector =
    role !== 'TESORERIA' &&
    ['padron', 'asistencia', 'ausencias', 'multas', 'pagos'].includes(type);
  const canState = [
    'padron',
    'sectores',
    'asistencia',
    'multas',
    'pagos',
    'gastos',
    'inventario',
    'activos',
  ].includes(type);
  const sectors = useResource(
    useCallback(
      (signal: AbortSignal) =>
        canSector
          ? api.administration.sectors(juntaId, signal)
          : Promise.resolve([]),
      [juntaId, canSector],
    ),
    onExpired,
  );
  return (
    <>
      <PageTitle
        title="Reportes"
        description="Consulta resultados reales y descarga informes CSV o PDF con los permisos de tu rol."
      />
      <Section title="Consulta y filtros">
        <label>
          Reporte
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as ReportType);
              setFilters({});
            }}
          >
            {options.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <form
          className="form-stack mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setFilters({
              desde: canDates ? input(form, 'desde') || undefined : undefined,
              hasta: canDates ? input(form, 'hasta') || undefined : undefined,
              sectorId: canSector
                ? input(form, 'sectorId') || undefined
                : undefined,
              estado: canState ? input(form, 'estado') || undefined : undefined,
            });
          }}
        >
          {canDates && (
            <>
              <Field label="Desde" name="desde" type="date" required={false} />
              <Field label="Hasta" name="hasta" type="date" required={false} />
            </>
          )}
          {canSector && (
            <Resource resource={sectors}>
              {(rows) => (
                <Choice
                  label="Sector"
                  name="sectorId"
                  optional
                  options={rows.map((row) => ({
                    id: row.id,
                    label: row.nombre,
                  }))}
                />
              )}
            </Resource>
          )}
          {canState && (
            <label>
              Estado
              <select name="estado">
                <option value="">Todos</option>
                {[
                  'ACTIVA',
                  'INACTIVA',
                  'PRESENTE',
                  'AUSENTE',
                  'JUSTIFICADO',
                  'PENDIENTE',
                  'PAGADA',
                  'ANULADA',
                  'REVISION_PENDIENTE',
                  'REGISTRADO',
                  'ANULADO',
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="form-actions">
            <button type="submit" className="button-primary">
              Aplicar filtros
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setFilters({});
              }}
            >
              Limpiar
            </button>
          </div>
        </form>
      </Section>
      {exportCommand.error && <Feedback error>{exportCommand.error}</Feedback>}
      <Resource resource={data}>
        {(report) => (
          <>
            <Section title={report.titulo}>
              {report.resumen && (
                <div className="panel form-panel mb-4">
                  {Object.entries(report.resumen).map(([key, value]) => (
                    <p key={key}>
                      {key}: <strong>{value}</strong>
                    </p>
                  ))}
                  <p className="muted">
                    Los importes vigentes no constituyen un saldo contable
                    definitivo. Las revisiones se presentan por separado.
                  </p>
                </div>
              )}
              <div className="form-actions mb-4">
                <button
                  className="button-secondary"
                  type="button"
                  disabled={exportCommand.busy}
                  onClick={() =>
                    void exportCommand.run(async () => {
                      download(
                        await api.reports.export(juntaId, type, 'csv', filters),
                        `reporte-${type}.csv`,
                      );
                    })
                  }
                >
                  Exportar CSV
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  disabled={exportCommand.busy}
                  onClick={() =>
                    void exportCommand.run(async () => {
                      download(
                        await api.reports.export(juntaId, type, 'pdf', filters),
                        `reporte-${type}.pdf`,
                      );
                    })
                  }
                >
                  Exportar PDF
                </button>
              </div>
              {report.filas.length === 0 ? (
                <Feedback>
                  No hay registros para los filtros aplicados.
                </Feedback>
              ) : (
                <div className="panel table-frame">
                  <table>
                    <thead>
                      <tr>
                        {report.columnas.map((c) => (
                          <th key={c.clave}>{c.etiqueta}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.filas.map((row, i) => (
                        <tr key={i}>
                          {report.columnas.map((c, j) =>
                            j === 0 ? (
                              <th scope="row" key={c.clave}>
                                {cell(row[c.clave])}
                              </th>
                            ) : (
                              <td key={c.clave}>{cell(row[c.clave])}</td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted mt-3">
                Se muestran hasta {report.maxFilas} registros por consulta.
              </p>
            </Section>
          </>
        )}
      </Resource>
    </>
  );
}
