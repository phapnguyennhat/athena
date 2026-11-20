import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { aiJobsConsumerOptions } from './modules/ai-jobs/ai-jobs.constants.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: aiJobsConsumerOptions(process.env.RABBITMQ_URL!),
    },
    { inheritAppConfig: true },
  );

  // Swagger UI at /docs, OpenAPI JSON at /docs-json; development only. NODE_ENV may come from .env (loaded by ConfigModule above).
  if (process.env.NODE_ENV === 'development') {
    const config = new DocumentBuilder()
      .setTitle('Athena API')
      .setDescription('Backend for Athena, a personal AI learning companion.')
      .setVersion('0.0.1')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));
  }

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
