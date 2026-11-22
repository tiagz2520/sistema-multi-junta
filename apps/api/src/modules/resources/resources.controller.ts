import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { operationAccess } from '../../core/operation/operation-http.js';
import {
  requireJson,
  type IdentityRequest,
} from '../platform/identity/auth.http.js';
import { ResourcesService } from './resources.service.js';

const treasury = ['TESORERIA'] as const;
const secretariat = ['SECRETARIA'] as const;
const maxPhotoBytes = 2 * 1024 * 1024;

@Controller('juntas/:juntaId/recursos')
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}

  @Get('inventario')
  @operationAccess(treasury)
  inventory(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.service.articles(req, junta);
  }

  @Post('inventario')
  @operationAccess(treasury, true)
  createArticle(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() body: unknown,
  ) {
    requireJson(req);
    return this.service.createArticle(req, junta, body);
  }

  @Get('inventario/:id')
  @operationAccess(treasury)
  article(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.articles(req, junta, id);
  }

  @Patch('inventario/:id')
  @operationAccess(treasury, true)
  updateArticle(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    requireJson(req);
    return this.service.updateArticle(req, junta, id, body);
  }

  @Get('inventario/:id/movimientos')
  @operationAccess(treasury)
  movements(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.movements(req, junta, id);
  }

  @Post('inventario/:id/movimientos')
  @operationAccess(treasury, true)
  move(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    requireJson(req);
    return this.service.move(req, junta, id, body);
  }

  @Get('activos')
  @operationAccess(treasury)
  assets(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.service.assets(req, junta);
  }

  @Get('activos/:id')
  @operationAccess(treasury)
  asset(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.assets(req, junta, id);
  }

  @Post('activos')
  @operationAccess(treasury, true)
  createAsset(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() body: unknown,
  ) {
    requireJson(req);
    return this.service.createAsset(req, junta, body);
  }

  @Patch('activos/:id')
  @operationAccess(treasury, true)
  updateAsset(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    requireJson(req);
    return this.service.updateAsset(req, junta, id, body);
  }

  @Post('activos/:id/baja')
  @HttpCode(200)
  @operationAccess(treasury, true)
  retireAsset(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    requireJson(req);
    return this.service.retireAsset(req, junta, id, body);
  }

  @Get('propiedades')
  @operationAccess(secretariat)
  properties(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
  ) {
    return this.service.properties(req, junta);
  }

  @Get('propiedades/:id')
  @operationAccess(secretariat)
  property(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.properties(req, junta, id);
  }

  @Post('propiedades')
  @operationAccess(secretariat, true)
  createProperty(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Body() body: unknown,
  ) {
    requireJson(req);
    return this.service.createProperty(req, junta, body);
  }

  @Patch('propiedades/:id')
  @operationAccess(secretariat, true)
  updateProperty(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    requireJson(req);
    return this.service.updateProperty(req, junta, id, body);
  }

  @Get('propiedades/:id/foto')
  @operationAccess(secretariat)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cross-Origin-Resource-Policy', 'same-origin')
  async photo(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const foto = await this.service.getPhoto(req, junta, id);
    return new StreamableFile(Buffer.from(foto.imagen), { type: 'image/jpeg' });
  }

  @Put('propiedades/:id/foto')
  @HttpCode(204)
  @operationAccess(secretariat, true)
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { files: 1, fields: 0, fileSize: maxPhotoBytes + 1 },
    }),
  )
  savePhoto(
    @Req() req: IdentityRequest,
    @Param('juntaId', ParseUUIDPipe) junta: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    const bytes = file?.buffer;
    if (
      !bytes ||
      file?.mimetype !== 'image/jpeg' ||
      bytes.length < 4 ||
      bytes.length > maxPhotoBytes ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff ||
      bytes.at(-2) !== 0xff ||
      bytes.at(-1) !== 0xd9
    ) {
      throw new BadRequestException('Se requiere una fotografía JPEG.');
    }
    return this.service.savePhoto(req, junta, id, bytes);
  }
}
