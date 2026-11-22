import { Module } from '@nestjs/common';
import { PlatformModule } from '../../modules/platform/platform.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OperationalDb } from './operational-db.js';

@Module({
  imports: [PrismaModule, PlatformModule],
  providers: [OperationalDb],
  exports: [OperationalDb, PlatformModule],
})
export class OperationalModule {}
