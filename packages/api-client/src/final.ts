import type { ApiRequest } from './index.js';

const root = (junta: string, modulo: string) =>
  `/juntas/${encodeURIComponent(junta)}/${modulo}`;
const item = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;

export interface Vinculo {
  id: string;
  socioId: string;
  membresiaId: string;
  estado: 'PENDIENTE' | 'ACTIVO' | 'REVOCADO' | 'VENCIDO';
  venceEn: string;
  creadoEn: string;
  confirmadoEn: string | null;
  revocadoEn: string | null;
  motivoRevocacion: string | null;
}
export interface Invitacion {
  id: string;
  membresiaId: string;
  venceEn: string;
  codigo: string;
  contrasenaTemporal?: string;
}
export interface PerfilSocio {
  id: string;
  nombres: string;
  apellidos: string;
  cedula: string;
  sectorId: string | null;
  sectorNombre: string | null;
}
export interface PropiedadPropia {
  id: string;
  nombre: string;
  dimensiones: string;
  sectorId: string;
  sectorNombre: string | null;
  latitud: string | null;
  longitud: string | null;
  tieneFoto: boolean;
}

export interface AsistenciaPropia {
  id: string;
  estado: 'PRESENTE' | 'AUSENTE' | 'JUSTIFICADO' | null;
  actividadId: string;
  tipo: 'MINGA' | 'ASAMBLEA';
  titulo: string;
  inicio: string;
  fin: string;
  lugar: string;
}
export interface ObligacionPropia {
  id: string;
  actividadId: string;
  concepto: string;
  monto: string;
  estado: string;
  motivoRevision: string | null;
  creadaEn: string;
}
export interface PagoPropio {
  id: string;
  obligacionId: string | null;
  concepto: string;
  monto: string;
  fecha: string;
  metodo: string;
  estado: string;
  numeroComprobante: string;
}

export function portalApi(request: ApiRequest) {
  const base = (junta: string) => root(junta, 'portal');
  return {
    links: (junta: string, signal?: AbortSignal) =>
      request<Vinculo[]>(base(junta) + '/vinculos', { signal }),
    invite: (
      junta: string,
      data:
        | { socioId: string; membresiaId: string }
        | { socioId: string; usuario: string },
      csrfToken: string,
    ) =>
      request<Invitacion>(base(junta) + '/invitaciones', {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    confirm: (junta: string, codigo: string, csrfToken: string) =>
      request<{
        id: string;
        socioId: string;
        membresiaId: string;
        estado: 'ACTIVO';
      }>(base(junta) + '/confirmar', {
        method: 'POST',
        body: { codigo },
        csrfToken,
      }),
    revoke: (junta: string, id: string, motivo: string, csrfToken: string) =>
      request<{ id: string; estado: 'REVOCADO' }>(
        item(base(junta) + '/vinculos', id) + '/revocar',
        {
          method: 'POST',
          body: { motivo },
          csrfToken,
        },
      ),
    profile: (junta: string, signal?: AbortSignal) =>
      request<{ perfil: PerfilSocio | null }>(base(junta) + '/perfil', {
        signal,
      }),
    properties: (junta: string, signal?: AbortSignal) =>
      request<PropiedadPropia[]>(base(junta) + '/propiedades', { signal }),
    propertyPhoto: (junta: string, id: string, signal?: AbortSignal) =>
      request<Blob>(item(base(junta) + '/propiedades', id) + '/foto', {
        responseType: 'blob',
        signal,
      }),
    attendance: (junta: string, signal?: AbortSignal) =>
      request<AsistenciaPropia[]>(base(junta) + '/asistencias', { signal }),
    obligations: (junta: string, signal?: AbortSignal) =>
      request<ObligacionPropia[]>(base(junta) + '/obligaciones', { signal }),
    payments: (junta: string, signal?: AbortSignal) =>
      request<PagoPropio[]>(base(junta) + '/pagos', { signal }),
    receipt: (junta: string, id: string, signal?: AbortSignal) =>
      request<Blob>(item(base(junta) + '/pagos', id) + '/comprobante', {
        responseType: 'blob',
        signal,
      }),
  };
}

export interface Destinatario {
  id: string;
  usuario: string;
  rol: string;
}
export interface Convocatoria {
  id: string;
  actividadId?: string;
  asunto: string;
  contenido?: string;
  tituloActividad?: string;
  fechaActividad?: string;
  lugarActividad?: string;
  emitidaEn?: string;
  estado: 'PUBLICADA' | 'ARCHIVADA';
  destinatarios?: number;
}
export interface Documento {
  id: string;
  tipo: 'ACTA' | 'RESOLUCION' | 'ACUERDO' | 'OFICIO';
  titulo: string;
  fecha?: string;
  descripcion?: string;
  institucion?: string | null;
  estado: 'PUBLICADO' | 'ARCHIVADO';
  creadoEn?: string;
}
export interface Mensaje {
  id: string;
  remitenteId: string;
  destinatarioId: string;
  texto: string;
  tieneArchivo?: boolean;
  creadoEn: string;
}

export function communicationsApi(request: ApiRequest) {
  const base = (junta: string) => root(junta, 'comunicaciones');
  return {
    recipients: (junta: string, signal?: AbortSignal) =>
      request<Destinatario[]>(base(junta) + '/destinatarios', { signal }),
    convocations: (junta: string, signal?: AbortSignal) =>
      request<Convocatoria[]>(base(junta) + '/convocatorias', { signal }),
    createConvocation: (
      junta: string,
      data: {
        actividadId: string;
        asunto: string;
        contenido: string;
        destinatarios: string[];
      },
      csrfToken: string,
    ) =>
      request<Convocatoria>(base(junta) + '/convocatorias', {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    archiveConvocation: (junta: string, id: string, csrfToken: string) =>
      request<Convocatoria>(
        item(base(junta) + '/convocatorias', id) + '/archivar',
        { method: 'PATCH', csrfToken },
      ),
    convocationPdf: (junta: string, id: string, signal?: AbortSignal) =>
      request<Blob>(item(base(junta) + '/convocatorias', id) + '/pdf', {
        responseType: 'blob',
        signal,
      }),
    documents: (junta: string, signal?: AbortSignal) =>
      request<Documento[]>(base(junta) + '/documentos', { signal }),
    createDocument: (junta: string, data: FormData, csrfToken: string) =>
      request<Documento>(base(junta) + '/documentos', {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    archiveDocument: (junta: string, id: string, csrfToken: string) =>
      request<Documento>(item(base(junta) + '/documentos', id) + '/archivar', {
        method: 'PATCH',
        csrfToken,
      }),
    documentFile: (junta: string, id: string, signal?: AbortSignal) =>
      request<Blob>(item(base(junta) + '/documentos', id) + '/archivo', {
        responseType: 'blob',
        signal,
      }),
    messages: (junta: string, signal?: AbortSignal) =>
      request<Mensaje[]>(base(junta) + '/mensajes', { signal }),
    sendMessage: (
      junta: string,
      data: { destinatarioId: string; texto: string } | FormData,
      csrfToken: string,
    ) =>
      request<Mensaje>(base(junta) + '/mensajes', {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    messageFile: (junta: string, id: string, signal?: AbortSignal) =>
      request<Blob>(item(base(junta) + '/mensajes', id) + '/archivo', {
        responseType: 'blob',
        signal,
      }),
  };
}

export interface ServicioHorario {
  id: string;
  nombre: string;
  estado: 'ACTIVA' | 'INACTIVA';
}
export interface HorarioSemanal {
  id: string;
  servicioId: string;
  servicio?: string;
  sectorId: string;
  sector?: string;
  dia: number;
  inicio: string;
  fin: string;
  desde: string;
  hasta: string;
  estado: 'PUBLICADO' | 'ARCHIVADO';
  creadoEn?: string;
}
export type HorarioEntrada = Omit<
  HorarioSemanal,
  'id' | 'servicio' | 'sector' | 'creadoEn' | 'estado'
>;
export function schedulesApi(request: ApiRequest) {
  const base = (junta: string) => root(junta, 'horarios');
  return {
    services: (junta: string, signal?: AbortSignal) =>
      request<ServicioHorario[]>(base(junta) + '/servicios', { signal }),
    createService: (junta: string, nombre: string, csrfToken: string) =>
      request<ServicioHorario>(base(junta) + '/servicios', {
        method: 'POST',
        body: { nombre },
        csrfToken,
      }),
    schedules: (junta: string, signal?: AbortSignal) =>
      request<HorarioSemanal[]>(base(junta), { signal }),
    create: (junta: string, data: HorarioEntrada, csrfToken: string) =>
      request<HorarioSemanal>(base(junta), {
        method: 'POST',
        body: data,
        csrfToken,
      }),
    update: (
      junta: string,
      id: string,
      data: Partial<HorarioEntrada> & { estado?: HorarioSemanal['estado'] },
      csrfToken: string,
    ) =>
      request<HorarioSemanal>(item(base(junta), id), {
        method: 'PATCH',
        body: data,
        csrfToken,
      }),
  };
}

export type ReportType =
  | 'padron'
  | 'sectores'
  | 'asistencia'
  | 'ausencias'
  | 'multas'
  | 'pagos'
  | 'gastos'
  | 'resumen-financiero'
  | 'inventario'
  | 'movimientos'
  | 'activos';
export interface ReportData {
  titulo: string;
  columnas: { clave: string; etiqueta: string }[];
  filas: Record<string, unknown>[];
  resumen?: Record<string, string>;
  maxFilas: number;
}
export type ReportFilters = {
  desde?: string;
  hasta?: string;
  sectorId?: string;
  estado?: string;
};
const reportPath = (
  junta: string,
  type: ReportType,
  filters: ReportFilters = {},
) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value) params.set(key, value);
  return `${root(junta, 'reportes')}/${type}${params.size ? `?${params.toString()}` : ''}`;
};
export function reportsApi(request: ApiRequest) {
  return {
    report: (
      junta: string,
      type: ReportType,
      filters: ReportFilters = {},
      signal?: AbortSignal,
    ) => request<ReportData>(reportPath(junta, type, filters), { signal }),
    export: (
      junta: string,
      type: ReportType,
      format: 'csv' | 'pdf',
      filters: ReportFilters = {},
      signal?: AbortSignal,
    ) => {
      const path = reportPath(junta, type, filters);
      return request<Blob>(
        `${path.split('?')[0]}/exportar?formato=${format}${path.includes('?') ? `&${path.split('?')[1]}` : ''}`,
        {
          responseType: 'blob',
          signal,
        },
      );
    },
  };
}
