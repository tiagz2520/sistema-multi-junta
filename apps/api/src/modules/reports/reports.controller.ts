import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { operationAccess } from '../../core/operation/operation-http.js';
import type { IdentityRequest } from '../platform/identity/auth.http.js';
import { reportCsv, reportPdf, ReportsService } from './reports.service.js';

const reportRoles = ['ADMIN_JUNTA', 'SECRETARIA', 'TESORERIA'] as const;

@Controller('juntas/:juntaId/reportes')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(':tipo')
  @operationAccess(reportRoles)
  getReport(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('tipo') tipo: string,
    @Query() query: unknown,
  ) {
    return this.reports.report(request, junta, tipo, query);
  }

  @Get(':tipo/exportar')
  @operationAccess(reportRoles)
  @Header('X-Content-Type-Options', 'nosniff')
  async export(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('tipo') tipo: string,
    @Query('formato') formato: unknown,
    @Query() query: Record<string, unknown>,
  ) {
    if (formato !== 'csv' && formato !== 'pdf')
      throw new BadRequestException('El formato debe ser csv o pdf.');
    const filters = { ...query };
    delete filters.formato;
    const report = await this.reports.report(request, junta, tipo, filters);
    const file =
      formato === 'csv' ? reportCsv(report) : await reportPdf(report);
    return new StreamableFile(file, {
      type: formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf',
      disposition: `attachment; filename="reporte-${tipo}.${formato}"`,
    });
  }
}
