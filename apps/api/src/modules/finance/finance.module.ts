import { Module } from '@nestjs/common';
import { OperationalModule } from '../../core/operation/operational.module.js';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';

@Module({
  imports: [OperationalModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
