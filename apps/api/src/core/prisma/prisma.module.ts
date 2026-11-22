import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { TenantUnitOfWork } from './tenant-unit-of-work.js';

@Module({
  providers: [PrismaService, TenantUnitOfWork],
  exports: [TenantUnitOfWork],
})
export class PrismaModule {}
