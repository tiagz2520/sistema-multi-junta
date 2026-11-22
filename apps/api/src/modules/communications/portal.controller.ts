import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { operationAccess } from '../../core/operation/operation-http.js';
import {
  type IdentityRequest,
  requireJson,
} from '../platform/identity/auth.http.js';
import { PortalService } from './portal.service.js';

@Controller('juntas/:juntaId/portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('vinculos')
  @operationAccess(['ADMIN_JUNTA'])
  links(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.portal.links(request, junta);
  }

  @Post('invitaciones')
  @operationAccess(['ADMIN_JUNTA'], true)
  invite(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.portal.invite(request, junta, payload);
  }

  @Post('confirmar')
  @operationAccess(['SOCIO'], true)
  confirm(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.portal.confirm(request, junta, payload);
  }

  @Post('vinculos/:id/revocar')
  @operationAccess(['ADMIN_JUNTA'], true)
  revoke(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.portal.revoke(request, junta, id, payload);
  }

  @Get('perfil')
  @operationAccess(['SOCIO'])
  profile(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.portal.profile(request, junta);
  }

  @Get('asistencias')
  @operationAccess(['SOCIO'])
  attendance(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.portal.attendance(request, junta);
  }

  @Get('obligaciones')
  @operationAccess(['SOCIO'])
  obligations(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.portal.obligations(request, junta);
  }

  @Get('pagos')
  @operationAccess(['SOCIO'])
  payments(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.portal.payments(request, junta);
  }

  @Get('pagos/:id/comprobante')
  @operationAccess(['SOCIO'])
  @Header('X-Content-Type-Options', 'nosniff')
  async receipt(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.portal.receipt(request, junta, id);
    return new StreamableFile(result.pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="comprobante-${result.numero}.pdf"`,
    });
  }
}
