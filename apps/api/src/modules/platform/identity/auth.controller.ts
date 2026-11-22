import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
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
  requireLoginRequest,
  writeSessionCookie,
} from './auth.http.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('iniciar-sesion')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async login(
    @Req() request: IdentityRequest,
    @Res({ passthrough: true }) response: ServerResponse,
    @Body('usuario') usuario: unknown,
    @Body('contrasena') contrasena: unknown,
  ) {
    requireLoginRequest(request);

    const issued = await this.auth.login(
      usuario,
      contrasena,
      request.socket.remoteAddress,
    );
    writeSessionCookie(response, issued.token);
    return issued.view;
  }

  @Get('sesion')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthSessionGuard, AuthScopeGuard)
  @allowedScopes('PREVIA', 'PLATAFORMA', 'JUNTA')
  session(@Req() request: IdentityRequest) {
    return currentSession(request).view;
  }

  @Get('contextos')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthSessionGuard, AuthScopeGuard)
  @allowedScopes('PREVIA', 'PLATAFORMA', 'JUNTA')
  contexts(@Req() request: IdentityRequest) {
    return this.auth.contexts(currentSession(request));
  }

  @Post('contexto')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthCsrfGuard, AuthSessionGuard, AuthScopeGuard)
  @allowedScopes('PREVIA', 'PLATAFORMA', 'JUNTA')
  async switchContext(
    @Req() request: IdentityRequest,
    @Res({ passthrough: true }) response: ServerResponse,
    @Body('juntaId') requestedJunta: unknown,
  ) {
    requireJson(request);

    const issued = await this.auth.switchContext(
      currentSession(request),
      requestedJunta,
    );
    writeSessionCookie(response, issued.token);
    return issued.view;
  }

  @Post('cambiar-contrasena')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthCsrfGuard, AuthSessionGuard, AuthScopeGuard)
  @allowedScopes('PREVIA')
  async changePassword(
    @Req() request: IdentityRequest,
    @Res({ passthrough: true }) response: ServerResponse,
    @Body('contrasenaActual') contrasenaActual: unknown,
    @Body('nuevaContrasena') nuevaContrasena: unknown,
  ): Promise<void> {
    requireJson(request);
    await this.auth.changePassword(
      currentSession(request),
      contrasenaActual,
      nuevaContrasena,
    );
    writeSessionCookie(response, null);
  }

  @Post('cerrar-sesion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthCsrfGuard, AuthSessionGuard, AuthScopeGuard)
  @allowedScopes('PREVIA', 'PLATAFORMA', 'JUNTA')
  async logout(
    @Req() request: IdentityRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<void> {
    await this.auth.logout(currentSession(request));
    writeSessionCookie(response, null);
  }
}

@Controller('juntas/:juntaId/mi/membresia')
export class OwnMembershipController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthSessionGuard, AuthScopeGuard, AuthRoleGuard)
  @allowedScopes('JUNTA')
  @allowedRoles('ADMIN_JUNTA', 'SECRETARIA', 'TESORERIA', 'SOCIO')
  ownMembership(
    @Req() request: IdentityRequest,
    @Param('juntaId') juntaId: string,
  ) {
    return this.auth.ownMembership(currentSession(request), juntaId);
  }
}
