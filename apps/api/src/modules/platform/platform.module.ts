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

@Module({
  imports: [PrismaModule],
  controllers: [AuthController, OwnMembershipController],
  providers: [
    MembershipRepository,
    AuthRepository,
    AuthService,
    AuthCsrfGuard,
    AuthSessionGuard,
    AuthScopeGuard,
    AuthRoleGuard,
  ],
})
export class PlatformModule {}
