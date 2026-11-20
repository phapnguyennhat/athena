import { Module } from '@nestjs/common';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EventsGateway } from './events.gateway.js';

@Module({
  imports: [AuthModule, AiJobsModule],
  providers: [EventsGateway],
})
export class EventsModule {}
