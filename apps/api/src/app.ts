import 'reflect-metadata';
import {
  BadRequestException,
  Catch,
  type ArgumentsHost,
  type NestApplicationOptions,
} from '@nestjs/common';
import { BaseExceptionFilter, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

@Catch(BadRequestException)
class InvalidRequestFilter extends BaseExceptionFilter {
  catch(_exception: BadRequestException, host: ArgumentsHost): void {
    // El parser puede incluir fragmentos del cuerpo en un error de JSON.
    super.catch(new BadRequestException('Solicitud inválida.'), host);
  }
}

export async function createApplication(options?: NestApplicationOptions) {
  const app = await NestFactory.create(AppModule, options);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new InvalidRequestFilter(app.getHttpAdapter()));
  return app;
}
