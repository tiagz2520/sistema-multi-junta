import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { operationAccess } from '../../core/operation/operation-http.js';
import {
  type IdentityRequest,
  requireJson,
} from '../platform/identity/auth.http.js';
import { ActivityService } from './activity.service.js';
import { RosterService } from './roster.service.js';

@Controller('juntas/:juntaId/administracion')
export class RosterController {
  constructor(private readonly roster: RosterService) {}

  @Get('sectores')
  @operationAccess(['ADMIN_JUNTA', 'SECRETARIA'])
  listSectors(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
  ) {
    return this.roster.listSectors(request, juntaId);
  }

  @Post('sectores')
  @operationAccess(['ADMIN_JUNTA'], true)
  createSector(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.roster.createSector(request, juntaId, payload);
  }

  @Get('sectores/:id')
  @operationAccess(['ADMIN_JUNTA', 'SECRETARIA'])
  sector(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roster.sector(request, juntaId, id);
  }

  @Patch('sectores/:id')
  @operationAccess(['ADMIN_JUNTA'], true)
  updateSector(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.roster.updateSector(request, juntaId, id, payload);
  }

  @Get('sectores/:id/socios')
  @operationAccess(['ADMIN_JUNTA', 'SECRETARIA'])
  sectorMembers(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roster.sectorMembers(request, juntaId, id);
  }

  @Get('socios')
  @operationAccess(['ADMIN_JUNTA', 'SECRETARIA', 'TESORERIA'])
  listSocios(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Query('q') q: unknown,
    @Query('estado') estado: unknown,
    @Query('sectorId') sectorId: unknown,
    @Query('offset') offset: unknown,
  ) {
    return this.roster.listSocios(request, juntaId, {
      q,
      estado,
      sectorId,
      offset,
    });
  }

  @Post('socios')
  @operationAccess(['SECRETARIA'], true)
  createSocio(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.roster.createSocio(request, juntaId, payload);
  }

  @Get('socios/:id')
  @operationAccess(['ADMIN_JUNTA', 'SECRETARIA', 'TESORERIA'])
  socio(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roster.socio(request, juntaId, id);
  }

  @Patch('socios/:id')
  @operationAccess(['SECRETARIA'], true)
  updateSocio(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.roster.updateSocio(request, juntaId, id, payload);
  }
}

@Controller('juntas/:juntaId/administracion/actividades')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @operationAccess(['SECRETARIA', 'TESORERIA'])
  list(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
  ) {
    return this.activity.list(request, juntaId);
  }

  @Post()
  @operationAccess(['SECRETARIA'], true)
  create(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.activity.create(request, juntaId, payload);
  }

  @Get(':id')
  @operationAccess(['SECRETARIA'])
  detail(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.activity.detail(request, juntaId, id);
  }

  @Patch(':id')
  @operationAccess(['SECRETARIA'], true)
  update(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.activity.update(request, juntaId, id, payload);
  }

  @Post(':id/cerrar')
  @HttpCode(HttpStatus.OK)
  @operationAccess(['SECRETARIA'], true)
  close(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.activity.close(request, juntaId, id);
  }

  @Put(':id/asistencias/:socioId')
  @operationAccess(['SECRETARIA'], true)
  mark(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('socioId', ParseUUIDPipe) socioId: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.activity.mark(request, juntaId, id, socioId, payload);
  }

  @Post(':id/asistencias/:socioId/justificaciones')
  @operationAccess(['SECRETARIA'], true)
  justify(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('socioId', ParseUUIDPipe) socioId: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.activity.justify(request, juntaId, id, socioId, payload);
  }

  @Patch(':id/asistencias/:socioId/justificaciones/:justificacionId')
  @operationAccess(['SECRETARIA'], true)
  decide(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) juntaId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('socioId', ParseUUIDPipe) socioId: string,
    @Param('justificacionId', ParseUUIDPipe) justificationId: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.activity.decide(
      request,
      juntaId,
      id,
      socioId,
      justificationId,
      payload,
    );
  }
}
