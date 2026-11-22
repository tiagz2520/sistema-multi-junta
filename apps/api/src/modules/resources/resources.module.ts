import { Module } from '@nestjs/common';
import { OperationalModule } from '../../core/operation/operational.module.js';
import { ResourcesController } from './resources.controller.js';
import { ResourcesService } from './resources.service.js';

@Module({
  imports: [OperationalModule],
  controllers: [ResourcesController],
  providers: [ResourcesService],
})
export class ResourcesModule {}
