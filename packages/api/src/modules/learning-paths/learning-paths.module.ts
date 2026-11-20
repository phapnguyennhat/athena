import { Module } from '@nestjs/common';
import { LearningPathsController } from './learning-paths.controller.js';
import { LearningPathsService } from './learning-paths.service.js';
import { PathAi } from './path-ai.js';
import { StubPathAi } from './stub-path-ai.js';

@Module({
  controllers: [LearningPathsController],
  // Swap useClass for the Gemini implementation when it exists.
  providers: [LearningPathsService, { provide: PathAi, useClass: StubPathAi }],
})
export class LearningPathsModule {}
