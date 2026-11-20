import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningPathEntity } from './entities/learning-path.entity.js';
import { PathConversation } from './entities/path-conversation.entity.js';
import { PathLesson } from './entities/path-lesson.entity.js';
import { PathMessage } from './entities/path-message.entity.js';
import { PathModule } from './entities/path-module.entity.js';
import { LearningPathsController } from './learning-paths.controller.js';
import { LearningPathsService } from './learning-paths.service.js';
import { PathAi } from './path-ai.js';
import { StubPathAi } from './stub-path-ai.js';

@Module({
  imports: [TypeOrmModule.forFeature([PathConversation, PathMessage, LearningPathEntity, PathModule, PathLesson])],
  controllers: [LearningPathsController],
  // Swap useClass for the Gemini implementation when it exists.
  providers: [LearningPathsService, { provide: PathAi, useClass: StubPathAi }],
})
export class LearningPathsModule {}
