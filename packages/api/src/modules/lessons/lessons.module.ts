import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyActivity } from './entities/daily-activity.entity.js';
import { LessonContentEntity } from './entities/lesson-content.entity.js';
import { LessonProgress } from './entities/lesson-progress.entity.js';
import { LessonResource } from './entities/lesson-resource.entity.js';
import { QuizAttempt } from './entities/quiz-attempt.entity.js';
import { Quiz } from './entities/quiz.entity.js';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module.js';
import { LearningPathsModule } from '../learning-paths/learning-paths.module.js';
import { GenerateLessonHandler } from './generate-lesson.handler.js';
import { GenerateQuizHandler } from './generate-quiz.handler.js';
import { DashboardController, LessonsController } from './lessons.controller.js';
import { LessonsService } from './lessons.service.js';
import { QuizzesService } from './quizzes.service.js';
import { StreakService } from './streak.service.js';
import { YouTubeService } from './youtube.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([LessonContentEntity, LessonResource, Quiz, QuizAttempt, LessonProgress, DailyActivity]),
    forwardRef(() => AiJobsModule),
    forwardRef(() => LearningPathsModule),
  ],
  controllers: [LessonsController, DashboardController],
  providers: [
    LessonsService,
    QuizzesService,
    StreakService,
    YouTubeService,
    GenerateLessonHandler,
    GenerateQuizHandler,
  ],
  exports: [GenerateLessonHandler, GenerateQuizHandler],
})
export class LessonsModule {}
