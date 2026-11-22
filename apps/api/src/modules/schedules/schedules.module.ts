import { Module } from '@nestjs/common';
import { OperationalModule } from '../../core/operation/operational.module.js';
import { ScheduleController } from './schedule.controller.js';
import { ScheduleService } from './schedule.service.js';
@Module({
  imports: [OperationalModule],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class SchedulesModule {}
