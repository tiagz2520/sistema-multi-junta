import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  allowedRoles,
  allowedScopes,
  AuthCsrfGuard,
  AuthRoleGuard,
  AuthScopeGuard,
  AuthSessionGuard,
  currentSession,
  type IdentityRequest,
  requireJson,
} from '../identity/auth.http.js';
import { ManagementService, offsetValue } from './management.service.js';

function managementAccess(scope: 'PLATAFORMA' | 'JUNTA', write = false) {
  const guards = [AuthSessionGuard, AuthScopeGuard, AuthRoleGuard];
  return applyDecorators(
    UseGuards(...(write ? [AuthCsrfGuard, ...guards] : guards)),
    allowedScopes(scope),
    allowedRoles(scope === 'PLATAFORMA' ? 'SUPER_ADMIN' : 'ADMIN_JUNTA'),
    Header('Cache-Control', 'no-store'),
  );
}

@Controller('plataforma/juntas')
export class PlatformManagementController {
  constructor(private readonly management: ManagementService) {}

  @Get()
  @managementAccess('PLATAFORMA')
  list(@Req() request: IdentityRequest, @Query('offset') offset: unknown) {
    return this.management.listJuntas(
      currentSession(request),
      offsetValue(offset),
    );
  }

  @Post()
  @managementAccess('PLATAFORMA', true)
  create(@Req() request: IdentityRequest, @Body() payload: unknown) {
    requireJson(request);
    return this.management.createJunta(currentSession(request), payload);
  }

  @Get(':juntaId')
  @managementAccess('PLATAFORMA')
  detail(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
  ) {
    return this.management.juntaDetail(currentSession(request), juntaId);
  }

  @Patch(':juntaId/estado')
  @managementAccess('PLATAFORMA', true)
  changeState(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.management.changeJuntaState(
      currentSession(request),
      juntaId,
      payload,
    );
  }

  @Post(':juntaId/administradores')
  @managementAccess('PLATAFORMA', true)
  createAdmin(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.management.assignAdmin(
      currentSession(request),
      juntaId,
      payload,
    );
  }
}

@Controller('juntas/:juntaId')
export class JuntaManagementController {
  constructor(private readonly management: ManagementService) {}

  @Get()
  @managementAccess('JUNTA')
  own(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
  ) {
    return this.management.ownJunta(currentSession(request), juntaId);
  }

  @Get('membresias')
  @managementAccess('JUNTA')
  list(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Query('offset') offset: unknown,
  ) {
    return this.management.listMemberships(
      currentSession(request),
      juntaId,
      offsetValue(offset),
    );
  }

  @Patch('membresias/:id')
  @managementAccess('JUNTA', true)
  update(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.management.updateMembership(
      currentSession(request),
      juntaId,
      id,
      payload,
    );
  }

  @Post('secretaria-inicial')
  @managementAccess('JUNTA', true)
  initializeSecretary(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.management.createFirstSecretary(
      currentSession(request),
      juntaId,
      payload,
    );
  }
}
