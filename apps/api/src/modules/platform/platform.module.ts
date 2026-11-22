import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module.js';
import {
  AuthController,
  OwnMembershipController,
} from './identity/auth.controller.js';
import {
  AuthCsrfGuard,
  AuthRoleGuard,
  AuthScopeGuard,
  AuthSessionGuard,
} from './identity/auth.http.js';
import { AuthRepository } from './identity/auth.repository.js';
import { AuthService } from './identity/auth.service.js';
import { MembershipRepository } from './identity/membership.repository.js';
import {
  JuntaManagementController,
  PlatformManagementController,
} from './management/management.controller.js';
import { ManagementService } from './management/management.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    AuthController,
    OwnMembershipController,
    PlatformManagementController,
    JuntaManagementController,
  ],
  providers: [
    MembershipRepository,
    ManagementService,
    AuthRepository,
    AuthService,
    AuthCsrfGuard,
    AuthSessionGuard,
    AuthScopeGuard,
    AuthRoleGuard,
  ],
  exports: [
    AuthService,
    AuthCsrfGuard,
    AuthSessionGuard,
    AuthScopeGuard,
    AuthRoleGuard,
  ],
})
export class PlatformModule {}
