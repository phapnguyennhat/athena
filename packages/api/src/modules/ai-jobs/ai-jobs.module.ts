import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { connect } from 'amqplib';
import { GeneratePathHandler } from '../learning-paths/generate-path.handler.js';
import { LearningPathsModule } from '../learning-paths/learning-paths.module.js';
import { AiJob } from './ai-job.entity.js';
import { AI_JOBS_CLIENT, AI_JOBS_DLQ, aiJobsQueue } from './ai-jobs.constants.js';
import { AiJobsConsumer } from './ai-jobs.consumer.js';
import { AiJobsController } from './ai-jobs.controller.js';
import { AiJobsService } from './ai-jobs.service.js';
import { JOB_HANDLERS, type JobHandler } from './job-handlers.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiJob]),
    // Handlers live in feature modules that also need AiJobsService to enqueue.
    forwardRef(() => LearningPathsModule),
    ClientsModule.registerAsync([
      {
        name: AI_JOBS_CLIENT,
        inject: [ConfigService],
        useFactory: (c: ConfigService) => ({
          transport: Transport.RMQ,
          options: { ...aiJobsQueue(c.getOrThrow<string>('RABBITMQ_URL')), persistent: true },
        }),
      },
    ]),
  ],
  controllers: [AiJobsController, AiJobsConsumer],
  providers: [
    AiJobsService,
    { provide: JOB_HANDLERS, inject: [GeneratePathHandler], useFactory: (...handlers: JobHandler[]) => handlers },
  ],
  exports: [AiJobsService],
})
export class AiJobsModule implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  /** The DLX on `ai.jobs` routes to `ai.jobs.dlq`, which RabbitMQ does not create by itself. */
  async onModuleInit() {
    const conn = await connect(this.config.getOrThrow<string>('RABBITMQ_URL'));
    try {
      const ch = await conn.createChannel();
      await ch.assertQueue(AI_JOBS_DLQ, { durable: true });
    } finally {
      await conn.close();
    }
  }
}
