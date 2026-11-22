import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { operationAccess } from '../../core/operation/operation-http.js';
import {
  type IdentityRequest,
  requireJson,
} from '../platform/identity/auth.http.js';
import { ScheduleService } from './schedule.service.js';

@Controller('juntas/:juntaId/horarios')
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get('servicios')
  @operationAccess(['ADMIN_JUNTA', 'SECRETARIA'])
  services(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.schedule.services(request, junta);
  }

  @Post('servicios')
  @operationAccess(['ADMIN_JUNTA'], true)
  createService(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.schedule.createService(request, junta, payload);
  }

  @Get()
  @operationAccess(['ADMIN_JUNTA', 'SECRETARIA', 'SOCIO'])
  schedules(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.schedule.schedules(request, junta);
  }

  @Post()
  @operationAccess(['SECRETARIA'], true)
  create(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.schedule.create(request, junta, payload);
  }

  @Patch(':id')
  @operationAccess(['SECRETARIA'], true)
  update(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.schedule.update(request, junta, id, payload);
  }
}
