import { Controller, Logger } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { isUUID } from 'class-validator';
import type { Channel, Message } from 'amqplib';
import { SearchIndexService } from './search-index.service.js';

/** Consumes `search.index` (manual ack). A message that throws is dead-lettered to `search.index.dlq`. */
@Public() // inheritAppConfig applies the global auth guard to message handlers too.
@Controller()
export class SearchIndexConsumer {
  private readonly log = new Logger(SearchIndexConsumer.name);

  constructor(private readonly search: SearchIndexService) {}

  @EventPattern<string>('search.index')
  async handle(@Payload() data: unknown, @Ctx() ctx: RmqContext): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;
    const pathId = (data as { pathId?: unknown } | null)?.pathId;
    try {
      if (typeof pathId !== 'string' || !isUUID(pathId)) throw new Error(`malformed payload: ${JSON.stringify(data)}`);
      await this.search.sync(pathId);
      channel.ack(msg);
    } catch (e) {
      this.log.error(`search message failed: ${e instanceof Error ? e.stack : String(e)}`);
      channel.nack(msg, false, false);
    }
  }
}
