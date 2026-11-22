import { Module } from '@nestjs/common';
import { OperationalModule } from '../../core/operation/operational.module.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';
import { CommunicationsController } from './communications.controller.js';
import { CommunicationsService } from './communications.service.js';

@Module({
  imports: [OperationalModule],
  controllers: [PortalController, CommunicationsController],
  providers: [PortalService, CommunicationsService],
})
export class CommunicationsModule {}
