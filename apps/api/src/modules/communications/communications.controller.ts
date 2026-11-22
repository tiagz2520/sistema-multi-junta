import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { operationAccess } from '../../core/operation/operation-http.js';
import {
  type IdentityRequest,
  requireJson,
} from '../platform/identity/auth.http.js';
import { CommunicationsService } from './communications.service.js';

type Upload = { buffer: Buffer; mimetype: string; originalname: string };
const readers = ['ADMIN_JUNTA', 'SECRETARIA', 'TESORERIA', 'SOCIO'] as const;
const correspondence = ['ADMIN_JUNTA', 'SOCIO'] as const;

@Controller('juntas/:juntaId/comunicaciones')
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get('destinatarios')
  @operationAccess(['SECRETARIA', ...correspondence])
  recipients(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.communications.recipients(request, junta);
  }

  @Get('convocatorias')
  @operationAccess(readers)
  convocations(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.communications.convocations(request, junta);
  }

  @Post('convocatorias')
  @operationAccess(['SECRETARIA'], true)
  createConvocation(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() payload: unknown,
  ) {
    requireJson(request);
    return this.communications.createConvocation(request, junta, payload);
  }

  @Patch('convocatorias/:id/archivar')
  @operationAccess(['SECRETARIA'], true)
  archiveConvocation(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.communications.archiveConvocation(request, junta, id);
  }

  @Get('convocatorias/:id/pdf')
  @operationAccess(readers)
  @Header('X-Content-Type-Options', 'nosniff')
  async convocationPdf(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const pdf = await this.communications.convocationPdf(request, junta, id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="convocatoria-${id}.pdf"`,
    });
  }

  @Get('documentos')
  @operationAccess(readers)
  documents(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.communications.documents(request, junta);
  }

  @Post('documentos')
  @operationAccess(['SECRETARIA'], true)
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: 2097153, files: 1, fields: 5, fieldSize: 4096 },
    }),
  )
  createDocument(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() payload: unknown,
    @UploadedFile() upload?: Upload,
  ) {
    return this.communications.createDocument(request, junta, payload, upload);
  }

  @Patch('documentos/:id/archivar')
  @operationAccess(['SECRETARIA'], true)
  archiveDocument(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.communications.archiveDocument(request, junta, id);
  }

  @Get('documentos/:id/archivo')
  @operationAccess(readers)
  @Header('X-Content-Type-Options', 'nosniff')
  async documentFile(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const pdf = await this.communications.documentFile(request, junta, id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="documento-${id}.pdf"`,
    });
  }

  @Get('mensajes')
  @operationAccess(correspondence)
  messages(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.communications.messages(request, junta);
  }

  @Post('mensajes')
  @operationAccess(correspondence, true)
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: 2097153, files: 1, fields: 2, fieldSize: 4096 },
    }),
  )
  sendMessage(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() payload: unknown,
    @UploadedFile() upload?: Upload,
  ) {
    return this.communications.sendMessage(request, junta, payload, upload);
  }

  @Get('mensajes/:id/archivo')
  @operationAccess(correspondence)
  @Header('X-Content-Type-Options', 'nosniff')
  async messageFile(
    @Req() request: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const pdf = await this.communications.messageFile(request, junta, id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="mensaje-${id}.pdf"`,
    });
  }
}
