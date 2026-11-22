import { GoogleGenAI } from '@google/genai';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiJob } from '../ai-jobs/ai-job.entity.js';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { Category } from './entities/category.entity.js';
import { LearningPathEntity } from './entities/learning-path.entity.js';
import { PathConversation } from './entities/path-conversation.entity.js';
import { PathLesson } from './entities/path-lesson.entity.js';
import { PathMessage } from './entities/path-message.entity.js';
import { PathModule } from './entities/path-module.entity.js';
import { GeneratePathHandler } from './generate-path.handler.js';
import { LearningPathsController } from './learning-paths.controller.js';
import { LearningPathsService } from './learning-paths.service.js';
import { GeminiPathAi } from './gemini-path-ai.js';
import { PathAi } from './path-ai.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PathConversation,
      PathMessage,
      LearningPathEntity,
      PathModule,
      PathLesson,
      AiJob,
      Category,
    ]),
    forwardRef(() => AiJobsModule),
  ],
  controllers: [LearningPathsController, ConversationsController],
  providers: [
    LearningPathsService,
    ConversationsService,
    GeneratePathHandler,
    {
      provide: PathAi,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        new GeminiPathAi(
          new GoogleGenAI({ apiKey: c.get('GEMINI_API_KEY') }),
          c.get('GEMINI_MODEL') ?? 'gemini-3.8-flash',
        ),
    },
  ],
  exports: [GeneratePathHandler, LearningPathsService, PathAi],
})
export class LearningPathsModule {}
