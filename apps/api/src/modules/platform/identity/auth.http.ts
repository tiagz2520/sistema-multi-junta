import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  AmbitoSesion,
  CodigoRol,
} from '../../../generated/prisma/client.js';
import {
  type AuthSession,
  isSessionToken,
  matchesCsrfToken,
} from './auth-session.js';
import { authConfig } from './auth.config.js';
import { AuthService } from './auth.service.js';

const sessionCookieName = 'multi_junta_sesion';
const scopeKey = Symbol('identityScopes');
const roleKey = Symbol('identityRoles');

export type IdentityRequest = IncomingMessage & {
  identitySession?: AuthSession;
};

export const allowedScopes = (...scopes: AmbitoSesion[]) =>
  SetMetadata(scopeKey, scopes);
export const allowedRoles = (...roles: CodigoRol[]) =>
  SetMetadata(roleKey, roles);

export function currentSession(request: IdentityRequest): AuthSession {
  if (!request.identitySession) {
    throw new UnauthorizedException('Sesión inválida.');
  }

  return request.identitySession;
}

function sessionToken(request: IncomingMessage): string {
  const prefix = `${sessionCookieName}=`;
  const entries = (request.headers.cookie ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(prefix));
  const token = entries[0]?.slice(prefix.length);

  if (entries.length !== 1 || !token || !isSessionToken(token)) {
    throw new UnauthorizedException('Sesión inválida.');
  }

  return token;
}

function requireOrigin(request: IncomingMessage): void {
  if (request.headers.origin !== authConfig().origin) {
    throw new ForbiddenException('Origen de solicitud no autorizado.');
  }
}

export function requireJson(request: IncomingMessage): void {
  const contentType = request.headers['content-type']
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();

  if (contentType !== 'application/json') {
    throw new UnsupportedMediaTypeException('La solicitud debe contener JSON.');
  }
}

export function requireLoginRequest(request: IncomingMessage): void {
  requireOrigin(request);

  if (request.headers['x-csrf-token'] !== 'inicio') {
    throw new ForbiddenException('Protección CSRF inválida.');
  }

  requireJson(request);
}

export function writeSessionCookie(
  response: ServerResponse,
  token: string | null,
): void {
  const secure = authConfig().secureCookie ? '; Secure' : '';
  const expiration =
    token === null ? '; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT' : '';

  response.setHeader(
    'Set-Cookie',
    `${sessionCookieName}=${token ?? ''}; Path=/api/v1; HttpOnly; SameSite=Strict${secure}${expiration}`,
  );
}

@Injectable()
export class AuthCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IdentityRequest>();
    requireOrigin(request);

    if (
      !matchesCsrfToken(request.headers['x-csrf-token'], sessionToken(request))
    ) {
      throw new ForbiddenException('Protección CSRF inválida.');
    }

    return true;
  }
}

@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IdentityRequest>();
    const session = await this.auth.session(sessionToken(request));

    if (!session) {
      throw new UnauthorizedException('Sesión inválida.');
    }

    request.identitySession = session;
    return true;
  }
}

@Injectable()
export class AuthScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const scopes = this.reflector.getAllAndOverride<AmbitoSesion[]>(scopeKey, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<IdentityRequest>();

    if (!scopes?.includes(currentSession(request).view.ambito)) {
      throw new ForbiddenException('Ámbito de sesión no autorizado.');
    }

    return true;
  }
}

@Injectable()
export class AuthRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<CodigoRol[]>(roleKey, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<IdentityRequest>();
    const { rol } = currentSession(request).view;

    if (!rol || !roles?.includes(rol)) {
      throw new ForbiddenException('Rol de sesión no autorizado.');
    }

    return true;
  }
}
