import { Module } from '@nestjs/common';
import { OperationalModule } from '../../core/operation/operational.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
@Module({
  imports: [OperationalModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
