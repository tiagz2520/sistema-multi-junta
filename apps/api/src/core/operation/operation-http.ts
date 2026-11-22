import { applyDecorators, Header, UseGuards } from '@nestjs/common';
import type { CodigoRol } from '../../generated/prisma/client.js';
import {
  allowedRoles,
  allowedScopes,
  AuthCsrfGuard,
  AuthRoleGuard,
  AuthScopeGuard,
  AuthSessionGuard,
} from '../../modules/platform/identity/auth.http.js';

export function operationAccess(roles: readonly CodigoRol[], write = false) {
  const guards = [AuthSessionGuard, AuthScopeGuard, AuthRoleGuard];
  return applyDecorators(
    UseGuards(...(write ? [AuthCsrfGuard, ...guards] : guards)),
    allowedScopes('JUNTA'),
    allowedRoles(...roles),
    Header('Cache-Control', 'no-store'),
  );
}
