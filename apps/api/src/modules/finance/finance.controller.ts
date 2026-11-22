import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { operationAccess } from '../../core/operation/operation-http.js';
import { OperationalDb } from '../../core/operation/operational-db.js';
import {
  requireJson,
  type IdentityRequest,
} from '../platform/identity/auth.http.js';
import { maxExpenseFileSize, type FinanceUpload } from './finance-input.js';
import { FinanceService } from './finance.service.js';
import { receiptPdf } from './receipt-pdf.js';

const treasury = ['TESORERIA'] as const;
const finesRoles = ['SECRETARIA', 'TESORERIA'] as const;
const tariffReaders = ['ADMIN_JUNTA', ...finesRoles] as const;

@Controller('juntas/:juntaId/finanzas')
export class FinanceController {
  constructor(
    private readonly operations: OperationalDb,
    private readonly finance: FinanceService,
  ) {}

  @Get('tarifas')
  @operationAccess(tariffReaders)
  tariffs(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.operations.run(request, junta, false, (tx) =>
      this.finance.tariffs(tx, junta),
    );
  }

  @Post('tarifas')
  @operationAccess(['ADMIN_JUNTA'], true)
  createTariff(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() body: unknown,
  ) {
    requireJson(request);
    return this.operations.run(request, junta, true, (tx) =>
      this.finance.createTariff(tx, junta, body),
    );
  }

  @Get('multas')
  @operationAccess(finesRoles)
  fines(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.operations.run(request, junta, false, (tx) =>
      this.finance.fines(tx, junta),
    );
  }

  @Get('multas/candidatas')
  @operationAccess(finesRoles)
  candidates(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Query('actividadId') activity: unknown,
  ) {
    return this.operations.run(request, junta, false, (tx) =>
      this.finance.candidates(tx, junta, activity),
    );
  }

  @Post('multas')
  @operationAccess(finesRoles, true)
  createFines(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() body: unknown,
  ) {
    requireJson(request);
    return this.operations.run(request, junta, true, (tx) =>
      this.finance.createFines(tx, junta, body),
    );
  }

  @Post('multas/:id/anular')
  @operationAccess(treasury, true)
  voidFine(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    requireJson(request);
    return this.operations.run(request, junta, true, (tx) =>
      this.finance.voidFine(tx, junta, id, body),
    );
  }

  @Get('pagos')
  @operationAccess(treasury)
  payments(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.operations.run(request, junta, false, (tx) =>
      this.finance.payments(tx, junta),
    );
  }

  @Post('pagos')
  @operationAccess(treasury, true)
  registerPayment(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() body: unknown,
  ) {
    requireJson(request);
    return this.operations.run(request, junta, true, (tx) =>
      this.finance.registerPayment(tx, junta, body),
    );
  }

  @Post('pagos/:id/anular')
  @operationAccess(treasury, true)
  voidPayment(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    requireJson(request);
    return this.operations.run(request, junta, true, (tx) =>
      this.finance.voidPayment(tx, junta, id, body),
    );
  }

  @Get('pagos/:id/comprobante')
  @operationAccess(treasury)
  @Header('X-Content-Type-Options', 'nosniff')
  async receipt(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const snapshot = await this.operations.run(request, junta, false, (tx) =>
      this.finance.receipt(tx, junta, id),
    );
    const pdf = await receiptPdf(snapshot);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="comprobante-${snapshot.numeroComprobante}.pdf"`,
    });
  }

  @Get('gastos')
  @operationAccess(treasury)
  expenses(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.operations.run(request, junta, false, (tx) =>
      this.finance.expenses(tx, junta),
    );
  }

  @Post('gastos')
  @operationAccess(treasury, true)
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: {
        fileSize: maxExpenseFileSize + 1,
        files: 1,
        fields: 5,
        fieldSize: 4_096,
      },
    }),
  )
  createExpense(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() body: unknown,
    @UploadedFile() file?: FinanceUpload,
  ) {
    return this.operations.run(request, junta, true, (tx) =>
      this.finance.createExpense(tx, junta, body, file),
    );
  }

  @Post('gastos/:id/anular')
  @operationAccess(treasury, true)
  voidExpense(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    requireJson(request);
    return this.operations.run(request, junta, true, (tx) =>
      this.finance.voidExpense(tx, junta, id, body),
    );
  }

  @Get('gastos/:id/archivo')
  @operationAccess(treasury)
  @Header('X-Content-Type-Options', 'nosniff')
  async attachment(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const file = await this.operations.run(request, junta, false, (tx) =>
      this.finance.expenseAttachment(tx, junta, id),
    );
    const filename = encodeURIComponent(file.nombre).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new StreamableFile(Buffer.from(file.archivo), {
      type: file.tipo,
      disposition: `attachment; filename*=UTF-8''${filename}`,
    });
  }
}
