import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type {
  AmbitoSesion,
  CodigoRol,
} from '../../../generated/prisma/client.js';

export interface SessionView {
  cuentaId: string;
  juntaId: string | null;
  membresiaId: string | null;
  ambito: AmbitoSesion;
  rol: CodigoRol | null;
  requiereCambioContrasena: boolean;
  csrfToken: string;
}

export interface AuthSession {
  fingerprint: string;
  view: SessionView;
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function csrfToken(token: string): string {
  return createHmac('sha256', token)
    .update('multi-junta:csrf:v1')
    .digest('base64url');
}

export function isSessionToken(value: string): boolean {
  return value.length === 43 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function matchesCsrfToken(
  value: unknown,
  sessionToken: string,
): boolean {
  if (typeof value !== 'string' || !isSessionToken(value)) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(value),
    Buffer.from(csrfToken(sessionToken)),
  );
}
