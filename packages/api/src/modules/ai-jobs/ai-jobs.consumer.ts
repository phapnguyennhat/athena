import { Controller, Logger } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { isUUID } from 'class-validator';
import type { Channel, Message } from 'amqplib';
import { AiJobsService } from './ai-jobs.service.js';

/** Consumes `ai.jobs` (manual ack). A message that throws is dead-lettered to `ai.jobs.dlq`. */
@Public() // inheritAppConfig applies the global auth guard to message handlers too.
@Controller()
export class AiJobsConsumer {
  private readonly log = new Logger(AiJobsConsumer.name);

  constructor(private readonly jobs: AiJobsService) {}

  @EventPattern<string>('ai.job')
  async handle(@Payload() data: unknown, @Ctx() ctx: RmqContext): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;
    const jobId = (data as { jobId?: unknown } | null)?.jobId;
    try {
      if (typeof jobId !== 'string' || !isUUID(jobId)) throw new Error(`malformed payload: ${JSON.stringify(data)}`);
      await this.jobs.process(jobId);
      channel.ack(msg);
    } catch (e) {
      this.log.error(`job message failed: ${e instanceof Error ? e.stack : String(e)}`);
      if (typeof jobId === 'string' && isUUID(jobId))
        await this.jobs.markFailed(jobId, 'INTERNAL').catch((err: unknown) => this.log.error(`markFailed: ${String(err)}`));
      channel.nack(msg, false, false);
    }
  }
}
