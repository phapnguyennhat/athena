import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, hours } from '@nestjs/throttler';
import { UserThrottlerGuard } from '../../common/user-throttler.guard.js';
import type { JobView } from '../ai-jobs/ai-jobs.service.js';
import { User } from '../users/user.entity.js';
import { SubmitAttemptDto } from './dto.js';
import {
  LessonsService,
  type CompleteView,
  type LessonView,
} from './lessons.service.js';
import {
  QuizzesService,
  type AttemptResult,
  type QuizView,
} from './quizzes.service.js';
import { StreakService, type StreakView } from './streak.service.js';
import {
  LearningPathsService,
  type PathSummary,
} from '../learning-paths/learning-paths.service.js';

@ApiTags('lessons')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, expired or revoked access token.',
})
@ApiNotFoundResponse({
  description: "LESSON_NOT_FOUND / QUIZ_NOT_FOUND: not the user's.",
})
@Controller()
@UseGuards(UserThrottlerGuard)
export class LessonsController {
  constructor(
    private readonly lessons: LessonsService,
    private readonly quizzes: QuizzesService,
  ) {}

  /** The lesson with its stored content, videos, quiz summary and job states. Opening it marks it in progress. */
  @Get('lessons/:id')
  get(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LessonView> {
    return this.lessons.open(user.id, id);
  }

  /** Queue content generation (202). Idempotent while a job runs; stored content is never regenerated. */
  @Post('lessons/:id/generate-content')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 60, ttl: hours(1) } })
  @ApiTooManyRequestsResponse({
    description: 'More than 60 generations an hour.',
  })
  @ApiServiceUnavailableResponse({ description: 'QUEUE_UNAVAILABLE.' })
  generateContent(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobView> {
    return this.lessons.generateContent(user.id, id);
  }

  /** Mark as completed (idempotent). Returns path progress and the updated streak. */
  @Post('lessons/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiConflictResponse({
    description: 'PATH_NOT_STARTED: the path is still a draft.',
  })
  complete(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompleteView> {
    return this.lessons.complete(user.id, id);
  }

  /** Queue the lesson's quiz (202), generated from its stored content. */
  @Post('lessons/:id/quiz/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 60, ttl: hours(1) } })
  @ApiConflictResponse({ description: 'LESSON_NOT_READY: no content yet.' })
  @ApiTooManyRequestsResponse({
    description: 'More than 60 generations an hour.',
  })
  @ApiServiceUnavailableResponse({ description: 'QUEUE_UNAVAILABLE.' })
  generateQuiz(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobView> {
    return this.lessons.generateQuiz(user.id, id);
  }

  /** The quiz without its answer key. */
  @Get('lessons/:id/quiz')
  quiz(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuizView> {
    return this.quizzes.forLesson(user.id, id);
  }

  /** Submit answers: graded server-side, returns explanations. Every attempt is kept. */
  @Post('quizzes/:id/attempts')
  @ApiBadRequestResponse({
    description: 'INVALID_ANSWERS: not one in-range answer per question.',
  })
  submit(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAttemptDto,
  ): Promise<AttemptResult> {
    return this.quizzes.submit(user.id, id, dto.answers);
  }
}

export type DashboardView = {
  streak: StreakView;
  /** The lesson "Tiếp tục học" opens: the last opened unfinished lesson, else the next one of the latest path. */
  continue: {
    lessonId: string;
    lessonTitle: string;
    pathId: string;
    pathTitle: string;
    done: number;
    total: number;
  } | null;
  paths: PathSummary[];
  totals: { completedLessons: number; quizAttempts: number; paths: number };
};

@ApiTags('dashboard')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, expired or revoked access token.',
})
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly streak: StreakService,
    private readonly paths: LearningPathsService,
    private readonly lessons: LessonsService,
  ) {}

  @Get()
  async get(@CurrentUser() user: User): Promise<DashboardView> {
    const [streak, paths, last, totals] = await Promise.all([
      this.streak.view(user.id),
      this.paths.list(user.id),
      this.lessons.lastOpened(user.id),
      this.lessons.totals(user.id),
    ]);
    const lastPath = last && paths.find((p) => p.id === last.pathId);
    const target = lastPath ?? paths.find((p) => p.next);
    const lesson = lastPath
      ? { id: last.lessonId, title: last.lessonTitle }
      : target?.next;
    return {
      streak,
      continue:
        target && lesson
          ? {
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              pathId: target.id,
              pathTitle: target.title,
              done: target.done,
              total: target.total,
            }
          : null,
      paths,
      totals: { ...totals, paths: paths.length },
    };
  }
}
