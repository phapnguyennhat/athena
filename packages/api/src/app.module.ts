import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { MailModule } from './mail/mail.module.js';
import { AiJobsModule } from './modules/ai-jobs/ai-jobs.module.js';
import { LearningPathsModule } from './modules/learning-paths/learning-paths.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    RedisModule,
    MailModule,
    UsersModule,
    AuthModule,
    LearningPathsModule,
    AiJobsModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      // Unknown body fields are rejected, and bodies become DTO instances.
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
  ],
})
export class AppModule {}
