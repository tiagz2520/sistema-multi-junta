import { Module } from '@nestjs/common';
import { HealthModule } from './core/health/health.module.js';
import { PrismaModule } from './core/prisma/prisma.module.js';
import { AdministrationModule } from './modules/administration/administration.module.js';
import { CommunicationsModule } from './modules/communications/communications.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';

@Module({
  imports: [
    PrismaModule,
    PlatformModule,
    AdministrationModule,
    FinanceModule,
    CommunicationsModule,
    HealthModule,
  ],
})
export class AppModule {}
