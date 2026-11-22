import { Module } from '@nestjs/common';
import { MembershipRepository } from './identity/membership.repository.js';

@Module({ providers: [MembershipRepository] })
export class PlatformModule {}
