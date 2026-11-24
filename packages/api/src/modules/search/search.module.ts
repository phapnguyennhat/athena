import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { connect } from 'amqplib';
import { SearchIndexConsumer } from './search-index.consumer.js';
import { SearchIndexService } from './search-index.service.js';
import { SEARCH_CLIENT, SEARCH_DLQ, searchQueue, TYPESENSE, typesenseClient } from './search.constants.js';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: SEARCH_CLIENT,
        inject: [ConfigService],
        useFactory: (c: ConfigService) => ({
          transport: Transport.RMQ,
          options: { ...searchQueue(c.getOrThrow<string>('RABBITMQ_URL')), persistent: true },
        }),
      },
    ]),
  ],
  controllers: [SearchIndexConsumer],
  providers: [
    SearchIndexService,
    {
      provide: TYPESENSE,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        typesenseClient(c.getOrThrow<string>('TYPESENSE_URL'), c.getOrThrow<string>('TYPESENSE_API_KEY')),
    },
  ],
  exports: [SearchIndexService, TYPESENSE],
})
export class SearchModule implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  /** The DLX on `search.index` routes to `search.index.dlq`, which RabbitMQ does not create by itself. */
  async onModuleInit() {
    const conn = await connect(this.config.getOrThrow<string>('RABBITMQ_URL'));
    try {
      const ch = await conn.createChannel();
      await ch.assertQueue(SEARCH_DLQ, { durable: true });
    } finally {
      await conn.close();
    }
  }
}
