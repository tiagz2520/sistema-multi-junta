import type { ApiRequest, Estado } from './index.js';

export type TipoActividad = 'ASAMBLEA' | 'MINGA';
export type DecisionJustificacion = 'ACEPTADA' | 'RECHAZADA';
export type EstadoAsistencia = 'PRESENTE' | 'AUSENTE' | 'JUSTIFICADO';
export type TipoMovimiento = 'ENTRADA' | 'SALIDA';

export interface SectorInput {
  nombre: string;
  clasificacion: string;
  descripcion?: string | null;
  estado?: Estado;
}

export interface Sector extends SectorInput {
  id: string;
  descripcion: string | null;
  estado: Estado;
}

export interface SocioInput {
  cedula: string;
  nombres: string;
  apellidos: string;
  sectorId?: string | null;
  estado?: Estado;
}

export interface Socio extends Omit<SocioInput, 'cedula'> {
  id: string;
  cedula?: string;
  sectorId: string | null;
  estado: Estado;
}

export interface ActividadInput {
  tipo: TipoActividad;
  titulo: string;
  inicio: string;
  fin: string;
  lugar: string;
}

export interface Actividad extends ActividadInput {
  id: string;
  estado: 'ABIERTA' | 'CERRADA';
}

export interface Justificacion {
  id: string;
  motivo: string;
  estado: 'PENDIENTE' | DecisionJustificacion;
  motivoDecision: string | null;
  creadaEn: string;
  decididaEn: string | null;
}

export interface Participante {
  id: string;
  socioId: string;
  nombres: string;
  apellidos: string;
  estado: EstadoAsistencia | null;
  historial: {
    id: string;
    estadoAnterior: EstadoAsistencia | null;
    estadoResultante: EstadoAsistencia;
    motivo: string | null;
    ocurridoEn: string;
  }[];
  justificaciones: Justificacion[];
}

export interface ActividadDetalle extends Actividad {
  participantes: Participante[];
}

export interface TarifaInput {
  tipo: TipoActividad;
  vigenteDesde: string;
  monto: string;
}

export interface Tarifa extends TarifaInput {
  id: string;
}

export interface Candidata {
  id: string;
  asistenciaId: string;
  socioId: string;
  socioNombre: string;
  tarifaId: string | null;
  monto: string | null;
}

export interface Multa {
  id: string;
  actividadId: string;
  asistenciaId: string;
  socioId: string;
  socioNombre: string;
  concepto: string;
  monto: string;
  estado: 'PENDIENTE' | 'PAGADA' | 'ANULADA' | 'REVISION_PENDIENTE';
  motivoAnulacion: string | null;
}

export interface PagoInput {
  socioId?: string;
  obligacionId?: string;
  concepto?: string;
  monto: string;
  fecha: string;
  metodo: string;
  solicitudId: string;
}

export interface Pago extends Omit<
  PagoInput,
  'obligacionId' | 'socioId' | 'concepto'
> {
  id: string;
  obligacionId: string | null;
  socioId: string;
  socioNombre: string;
  concepto: string;
  estado: 'REGISTRADO' | 'ANULADO';
  numeroComprobante: string;
  motivoAnulacion: string | null;
}

export interface Gasto {
  id: string;
  concepto: string;
  descripcion: string;
  monto: string;
  fecha: string;
  beneficiario: string;
  estado: 'REGISTRADO' | 'ANULADO';
  nombreArchivo: string;
  motivoAnulacion: string | null;
}

export interface ArticuloInput {
  nombre: string;
  categoria: string;
  unidad: string;
  costoUnitario?: string | null;
  estado?: Estado;
}

export interface Articulo extends ArticuloInput {
  id: string;
  stock: string;
  estado: Estado;
}

export interface MovimientoInput {
  tipo: TipoMovimiento;
  cantidad: string;
  motivo: string;
}

export interface Movimiento extends MovimientoInput {
  id: string;
  ocurridoEn: string;
  responsableId: string;
  stockResultante: string;
}

export interface ActivoInput {
  codigo?: string;
  nombre: string;
  descripcion: string;
  ubicacion: string;
  fechaAdquisicion: string;
  valor: string;
  vidaUtil?: number | null;
  documento: string;
}

export interface Activo extends ActivoInput {
  id: string;
  codigo: string;
  estado: Estado;
  motivoBaja: string | null;
  bajaEn: string | null;
}

export interface PropiedadInput {
  nombre: string;
  socioId: string;
  sectorId: string;
  dimensiones: string;
  latitud?: string | null;
  longitud?: string | null;
  estado?: Estado;
}

export interface Propiedad extends PropiedadInput {
  id: string;
  socioNombre?: string;
  sectorNombre?: string;
  tieneFoto: boolean;
  estado: Estado;
}

function route(junta: string, module: string, path: string) {
  return `/juntas/${encodeURIComponent(junta)}/${module}/${path}`;
}

function withId(path: string, id: string) {
  return `${path}/${encodeURIComponent(id)}`;
}

type SocioFilters = {
  q?: string;
  estado?: Estado;
  sectorId?: string;
  offset?: number;
};

export function administrationApi(request: ApiRequest) {
  const base = (junta: string, path: string) =>
    route(junta, 'administracion', path);
  const detail = (junta: string, path: string, id: string) =>
    withId(base(junta, path), id);
  const attendance = (junta: string, activity: string, socio: string) =>
    withId(`${detail(junta, 'actividades', activity)}/asistencias`, socio);

  return {
    sectors: (junta: string, signal?: AbortSignal) =>
      request<Sector[]>(base(junta, 'sectores'), { signal }),
    sector: (junta: string, id: string, signal?: AbortSignal) =>
      request<Sector>(detail(junta, 'sectores', id), { signal }),
    sectorMembers: (junta: string, id: string, signal?: AbortSignal) =>
      request<Socio[]>(`${detail(junta, 'sectores', id)}/socios`, { signal }),
    createSector: (junta: string, data: SectorInput, csrfToken: string) =>
      request<Sector>(base(junta, 'sectores'), {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    updateSector: (
      junta: string,
      id: string,
      data: Partial<SectorInput>,
      csrfToken: string,
    ) =>
      request<Sector>(detail(junta, 'sectores', id), {
        method: 'PATCH',
        body: data,
        csrfToken,
      }),
    socios: (
      junta: string,
      filters: SocioFilters = {},
      signal?: AbortSignal,
    ) => {
      const query = new URLSearchParams();
      if (filters.q) query.set('q', filters.q);
      if (filters.estado) query.set('estado', filters.estado);
      if (filters.sectorId) query.set('sectorId', filters.sectorId);
      if (filters.offset) query.set('offset', String(filters.offset));
      const search = query.toString();
      return request<Socio[]>(
        `${base(junta, 'socios')}${search ? `?${search}` : ''}`,
        { signal },
      );
    },
    socio: (junta: string, id: string, signal?: AbortSignal) =>
      request<Socio>(detail(junta, 'socios', id), { signal }),
    createSocio: (junta: string, data: SocioInput, csrfToken: string) =>
      request<Socio>(base(junta, 'socios'), {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    updateSocio: (
      junta: string,
      id: string,
      data: Partial<SocioInput>,
      csrfToken: string,
    ) =>
      request<Socio>(detail(junta, 'socios', id), {
        method: 'PATCH',
        body: data,
        csrfToken,
      }),
    activities: (junta: string, signal?: AbortSignal) =>
      request<Actividad[]>(base(junta, 'actividades'), { signal }),
    activity: (junta: string, id: string, signal?: AbortSignal) =>
      request<ActividadDetalle>(detail(junta, 'actividades', id), { signal }),
    createActivity: (junta: string, data: ActividadInput, csrfToken: string) =>
      request<Actividad>(base(junta, 'actividades'), {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    updateActivity: (
      junta: string,
      id: string,
      data: Partial<ActividadInput>,
      csrfToken: string,
    ) =>
      request<Actividad>(detail(junta, 'actividades', id), {
        method: 'PATCH',
        body: data,
        csrfToken,
      }),
    closeActivity: (junta: string, id: string, csrfToken: string) =>
      request<Actividad>(`${detail(junta, 'actividades', id)}/cerrar`, {
        method: 'POST',
        csrfToken,
      }),
    markAttendance: (
      junta: string,
      activity: string,
      socio: string,
      data: { estado: 'PRESENTE' | 'AUSENTE'; motivo?: string },
      csrfToken: string,
    ) =>
      request<Participante>(attendance(junta, activity, socio), {
        method: 'PUT',
        body: data,
        csrfToken,
      }),
    addJustification: (
      junta: string,
      activity: string,
      socio: string,
      motivo: string,
      csrfToken: string,
    ) =>
      request<Justificacion>(
        `${attendance(junta, activity, socio)}/justificaciones`,
        { method: 'POST', body: { motivo }, csrfToken },
      ),
    decideJustification: (
      junta: string,
      activity: string,
      socio: string,
      justification: string,
      data: { decision: DecisionJustificacion; motivo: string },
      csrfToken: string,
    ) =>
      request<Justificacion>(
        withId(
          `${attendance(junta, activity, socio)}/justificaciones`,
          justification,
        ),
        { method: 'PATCH', body: data, csrfToken },
      ),
  };
}

export function financeApi(request: ApiRequest) {
  const base = (junta: string, path: string) => route(junta, 'finanzas', path);
  const detail = (junta: string, path: string, id: string) =>
    withId(base(junta, path), id);

  return {
    tariffs: (junta: string, signal?: AbortSignal) =>
      request<Tarifa[]>(base(junta, 'tarifas'), { signal }),
    addTariff: (junta: string, data: TarifaInput, csrfToken: string) =>
      request<Tarifa>(base(junta, 'tarifas'), {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    fines: (junta: string, signal?: AbortSignal) =>
      request<Multa[]>(base(junta, 'multas'), { signal }),
    fineCandidates: (junta: string, activityId: string, signal?: AbortSignal) =>
      request<Candidata[]>(
        `${base(junta, 'multas/candidatas')}?actividadId=${encodeURIComponent(activityId)}`,
        { signal },
      ),
    createFines: (
      junta: string,
      data: { actividadId: string; asistenciaIds: string[] },
      csrfToken: string,
    ) =>
      request<Multa[]>(base(junta, 'multas'), {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    voidFine: (junta: string, id: string, motivo: string, csrfToken: string) =>
      request<Multa>(`${detail(junta, 'multas', id)}/anular`, {
        method: 'POST',
        body: { motivo },
        csrfToken,
      }),
    payments: (junta: string, signal?: AbortSignal) =>
      request<Pago[]>(base(junta, 'pagos'), { signal }),
    makePayment: (junta: string, data: PagoInput, csrfToken: string) =>
      request<Pago>(base(junta, 'pagos'), {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    voidPayment: (
      junta: string,
      id: string,
      motivo: string,
      csrfToken: string,
    ) =>
      request<Pago>(`${detail(junta, 'pagos', id)}/anular`, {
        method: 'POST',
        body: { motivo },
        csrfToken,
      }),
    receipt: (junta: string, id: string, signal?: AbortSignal) =>
      request<Blob>(`${detail(junta, 'pagos', id)}/comprobante`, {
        responseType: 'blob',
        signal,
      }),
    expenses: (junta: string, signal?: AbortSignal) =>
      request<Gasto[]>(base(junta, 'gastos'), { signal }),
    makeExpense: (junta: string, data: FormData, csrfToken: string) =>
      request<Gasto>(base(junta, 'gastos'), {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    voidExpense: (
      junta: string,
      id: string,
      motivo: string,
      csrfToken: string,
    ) =>
      request<Gasto>(`${detail(junta, 'gastos', id)}/anular`, {
        method: 'POST',
        body: { motivo },
        csrfToken,
      }),
    expenseFile: (junta: string, id: string, signal?: AbortSignal) =>
      request<Blob>(`${detail(junta, 'gastos', id)}/archivo`, {
        responseType: 'blob',
        signal,
      }),
  };
}

export function resourcesApi(request: ApiRequest) {
  const base = (junta: string, path: string) => route(junta, 'recursos', path);
  const detail = (junta: string, path: string, id: string) =>
    withId(base(junta, path), id);

  return {
    inventory: (junta: string, signal?: AbortSignal) =>
      request<Articulo[]>(base(junta, 'inventario'), { signal }),
    article: (junta: string, id: string, signal?: AbortSignal) =>
      request<Articulo>(detail(junta, 'inventario', id), { signal }),
    createArticle: (junta: string, data: ArticuloInput, csrfToken: string) =>
      request<Articulo>(base(junta, 'inventario'), {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    updateArticle: (
      junta: string,
      id: string,
      data: Partial<ArticuloInput>,
      csrfToken: string,
    ) =>
      request<Articulo>(detail(junta, 'inventario', id), {
        method: 'PATCH',
        body: data,
        csrfToken,
      }),
    movements: (junta: string, id: string, signal?: AbortSignal) =>
      request<Movimiento[]>(`${detail(junta, 'inventario', id)}/movimientos`, {
        signal,
      }),
    addMovement: (
      junta: string,
      id: string,
      data: MovimientoInput,
      csrfToken: string,
    ) =>
      request<Movimiento>(`${detail(junta, 'inventario', id)}/movimientos`, {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    assets: (junta: string, signal?: AbortSignal) =>
      request<Activo[]>(base(junta, 'activos'), { signal }),
    asset: (junta: string, id: string, signal?: AbortSignal) =>
      request<Activo>(detail(junta, 'activos', id), { signal }),
    createAsset: (junta: string, data: ActivoInput, csrfToken: string) =>
      request<Activo>(base(junta, 'activos'), {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    updateAsset: (
      junta: string,
      id: string,
      data: Partial<ActivoInput>,
      csrfToken: string,
    ) =>
      request<Activo>(detail(junta, 'activos', id), {
        method: 'PATCH',
        body: data,
        csrfToken,
      }),
    retireAsset: (
      junta: string,
      id: string,
      motivo: string,
      csrfToken: string,
    ) =>
      request<Activo>(`${detail(junta, 'activos', id)}/baja`, {
        method: 'POST',
        body: { motivo },
        csrfToken,
      }),
    properties: (junta: string, signal?: AbortSignal) =>
      request<Propiedad[]>(base(junta, 'propiedades'), { signal }),
    property: (junta: string, id: string, signal?: AbortSignal) =>
      request<Propiedad>(detail(junta, 'propiedades', id), { signal }),
    createProperty: (junta: string, data: PropiedadInput, csrfToken: string) =>
      request<Propiedad>(base(junta, 'propiedades'), {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    updateProperty: (
      junta: string,
      id: string,
      data: Partial<PropiedadInput>,
      csrfToken: string,
    ) =>
      request<Propiedad>(detail(junta, 'propiedades', id), {
        method: 'PATCH',
        body: data,
        csrfToken,
      }),
    uploadPropertyPhoto: (
      junta: string,
      id: string,
      data: FormData,
      csrfToken: string,
    ) =>
      request<void>(`${detail(junta, 'propiedades', id)}/foto`, {
        method: 'PUT',
        body: data,
        csrfToken,
      }),
    propertyPhoto: (junta: string, id: string, signal?: AbortSignal) =>
      request<Blob>(`${detail(junta, 'propiedades', id)}/foto`, {
        responseType: 'blob',
        signal,
      }),
  };
}
