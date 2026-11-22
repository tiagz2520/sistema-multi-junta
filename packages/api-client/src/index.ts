export type Estado = 'ACTIVA' | 'INACTIVA';
export type Ambito = 'PREVIA' | 'PLATAFORMA' | 'JUNTA';
export type RolLocalEditable = 'SECRETARIA' | 'TESORERIA' | 'SOCIO';
export type RolLocal = 'ADMIN_JUNTA' | RolLocalEditable;
export type Rol = 'SUPER_ADMIN' | RolLocal;

export interface Sesion {
  cuentaId: string;
  juntaId: string | null;
  membresiaId: string | null;
  ambito: Ambito;
  rol: Rol | null;
  requiereCambioContrasena: boolean;
  csrfToken: string;
}

export interface Contexto {
  juntaId: string;
  nombre: string;
  rol: RolLocal;
}

export interface Junta {
  id: string;
  nombre: string;
  tipo: string;
  ruc: string | null;
  estado: Estado;
}

export interface Membresia {
  id: string;
  cuentaId: string;
  usuario: string;
  rol: RolLocal;
  estado: Estado;
}

export interface MembresiaPropia {
  cuentaId: string;
  juntaId: string;
  membresiaId: string;
  rol: RolLocal;
}

export interface Alta {
  membresia: Membresia;
  contrasenaTemporal: string;
}

type Solicitud = {
  method?: 'POST' | 'PATCH';
  body?: object;
  csrfToken?: string;
  signal?: AbortSignal;
};

const statusMessages: Partial<Record<number, string>> = {
  400: 'Revisa los datos ingresados.',
  401: 'La sesión o las credenciales no son válidas.',
  403: 'No tienes permiso para realizar esta operación.',
  404: 'El registro no está disponible.',
  409: 'El cambio entra en conflicto con un registro existente.',
  429: 'Demasiados intentos. Vuelve a intentarlo más tarde.',
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const pageSize = 25;

export function createApiClient(
  fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
) {
  async function request<T>(path: string, options: Solicitud = {}): Promise<T> {
    const { method = 'GET', body, csrfToken, signal } = options;
    const headers = new Headers({ Accept: 'application/json' });

    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    if (csrfToken !== undefined) {
      headers.set('X-CSRF-Token', csrfToken);
    }

    let response: Response;
    try {
      response = await fetcher(`/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(0, 'No fue posible conectar con el sistema.');
    }

    if (!response.ok) {
      let message =
        statusMessages[response.status] ?? 'No pudimos completar la solicitud.';
      if (response.status >= 400 && response.status < 500) {
        const payload: unknown = await response.json().catch(() => null);
        if (
          payload &&
          typeof payload === 'object' &&
          'message' in payload &&
          typeof payload.message === 'string' &&
          payload.message.length <= 240
        ) {
          message = payload.message;
        }
      }
      throw new ApiError(response.status, message);
    }

    if (response.status === 204) return undefined as T;

    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError(502, 'El sistema devolvió una respuesta inválida.');
    }
  }

  const platformJunta = (id: string) =>
    `/plataforma/juntas/${encodeURIComponent(id)}`;
  const localJunta = (id: string) => `/juntas/${encodeURIComponent(id)}`;

  return {
    auth: {
      session: (signal?: AbortSignal) =>
        request<Sesion>('/auth/sesion', { signal }),
      login: (usuario: string, contrasena: string) =>
        request<Sesion>('/auth/iniciar-sesion', {
          method: 'POST',
          body: { usuario, contrasena },
          csrfToken: 'inicio',
        }),
      contexts: (signal?: AbortSignal) =>
        request<Contexto[]>('/auth/contextos', { signal }),
      switchContext: (juntaId: string | null, csrfToken: string) =>
        request<Sesion>('/auth/contexto', {
          method: 'POST',
          body: { juntaId },
          csrfToken,
        }),
      changePassword: (
        contrasenaActual: string,
        nuevaContrasena: string,
        csrfToken: string,
      ) =>
        request<void>('/auth/cambiar-contrasena', {
          method: 'POST',
          body: { contrasenaActual, nuevaContrasena },
          csrfToken,
        }),
      logout: (csrfToken: string) =>
        request<void>('/auth/cerrar-sesion', { method: 'POST', csrfToken }),
    },
    platform: {
      juntas: (offset = 0, signal?: AbortSignal) =>
        request<Junta[]>(`/plataforma/juntas?offset=${offset}`, { signal }),
      createJunta: (
        data: { nombre: string; tipo: string; ruc?: string },
        csrfToken: string,
      ) =>
        request<Junta>('/plataforma/juntas', {
          method: 'POST',
          body: data,
          csrfToken,
        }),
      junta: (id: string, signal?: AbortSignal) =>
        request<Junta & { administradores: Membresia[] }>(platformJunta(id), {
          signal,
        }),
      changeState: (id: string, estado: Estado, csrfToken: string) =>
        request<Junta>(`${platformJunta(id)}/estado`, {
          method: 'PATCH',
          body: { estado },
          csrfToken,
        }),
      addAdministrator: (id: string, usuario: string, csrfToken: string) =>
        request<Alta>(`${platformJunta(id)}/administradores`, {
          method: 'POST',
          body: { usuario },
          csrfToken,
        }),
    },
    tenant: {
      junta: (id: string, signal?: AbortSignal) =>
        request<Junta & { secretariaInicialDisponible: boolean }>(
          localJunta(id),
          { signal },
        ),
      memberships: (id: string, offset = 0, signal?: AbortSignal) =>
        request<Membresia[]>(`${localJunta(id)}/membresias?offset=${offset}`, {
          signal,
        }),
      ownMembership: (id: string, signal?: AbortSignal) =>
        request<MembresiaPropia>(`${localJunta(id)}/mi/membresia`, { signal }),
      updateMembership: (
        id: string,
        membershipId: string,
        data: { rol?: RolLocalEditable; estado?: Estado },
        csrfToken: string,
      ) =>
        request<Membresia>(
          `${localJunta(id)}/membresias/${encodeURIComponent(membershipId)}`,
          { method: 'PATCH', body: data, csrfToken },
        ),
      addFirstSecretary: (id: string, usuario: string, csrfToken: string) =>
        request<Alta>(`${localJunta(id)}/secretaria-inicial`, {
          method: 'POST',
          body: { usuario },
          csrfToken,
        }),
    },
  };
}

export const api = createApiClient();
