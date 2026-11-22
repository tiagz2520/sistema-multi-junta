import { Module } from '@nestjs/common';
import { OperationalModule } from '../../core/operation/operational.module.js';
import { ActivityService } from './activity.service.js';
import {
  ActivityController,
  RosterController,
} from './administration.controller.js';
import { RosterService } from './roster.service.js';

@Module({
  imports: [OperationalModule],
  controllers: [RosterController, ActivityController],
  providers: [RosterService, ActivityService],
})
export class AdministrationModule {}
