import { GoogleGenAI } from '@google/genai';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningPathEntity } from './entities/learning-path.entity.js';
import { PathConversation } from './entities/path-conversation.entity.js';
import { PathLesson } from './entities/path-lesson.entity.js';
import { PathMessage } from './entities/path-message.entity.js';
import { PathModule } from './entities/path-module.entity.js';
import { LearningPathsController } from './learning-paths.controller.js';
import { LearningPathsService } from './learning-paths.service.js';
import { GeminiPathAi } from './gemini-path-ai.js';
import { PathAi } from './path-ai.js';
import { StubPathAi } from './stub-path-ai.js';

@Module({
  imports: [TypeOrmModule.forFeature([PathConversation, PathMessage, LearningPathEntity, PathModule, PathLesson])],
  controllers: [LearningPathsController],
  providers: [
    LearningPathsService,
    {
      provide: PathAi,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        c.get('AI_PROVIDER') === 'gemini'
          ? new GeminiPathAi(new GoogleGenAI({ apiKey: c.get('GEMINI_API_KEY') }), c.get('GEMINI_MODEL') ?? 'gemini-2.5-flash')
          : new StubPathAi(),
    },
  ],
})
export class LearningPathsModule {}
