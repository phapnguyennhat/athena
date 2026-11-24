import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { QuizAttempt } from './entities/quiz-attempt.entity.js';
import { Quiz } from './entities/quiz.entity.js';
import { LessonsService } from './lessons.service.js';
import { StreakService, type StreakView } from './streak.service.js';

/** What the client sees before submitting: no answers, no explanations. */
export type QuizView = {
  id: string;
  lessonId: string;
  questions: { prompt: string; options: string[] }[];
  attempts: number;
  best: { correct: number; total: number } | null;
};
export type AttemptResult = {
  id: string;
  correct: number;
  total: number;
  results: {
    selected: number;
    answer: number;
    correct: boolean;
    explanation: string;
  }[];
  streak: StreakView;
};

const quizNotFound = () =>
  new NotFoundException({
    statusCode: 404,
    code: 'QUIZ_NOT_FOUND',
    message: 'Quiz not found.',
  });

@Injectable()
export class QuizzesService {
  constructor(
    private readonly ds: DataSource,
    private readonly lessons: LessonsService,
    private readonly streak: StreakService,
  ) {}

  async forLesson(userId: string, lessonId: string): Promise<QuizView> {
    const { content } = await this.lessons.own(userId, lessonId);
    const quiz = await this.ds.getRepository(Quiz).findOneBy({ contentId: content.id });
    if (!quiz) throw quizNotFound();
    const [stats] = await this.ds.query(
      `SELECT count(*)::int AS attempts, max(correct) AS correct FROM quiz_attempts WHERE quiz_id = $1 AND user_id = $2`,
      [quiz.id, userId],
    );
    return {
      id: quiz.id,
      lessonId,
      questions: quiz.questions.map(({ prompt, options }) => ({
        prompt,
        options,
      })),
      attempts: stats.attempts,
      best: stats.attempts ? { correct: stats.correct, total: quiz.questions.length } : null,
    };
  }

  /** Graded against the stored key, never by a new AI call. Every submission is kept; it counts as a learning day. */
  async submit(userId: string, quizId: string, answers: number[]): Promise<AttemptResult> {
    const quiz = await this.ds.getRepository(Quiz).findOneBy({ id: quizId });
    if (!quiz) throw quizNotFound();
    // The caller must own a lesson on this quiz's content; a foreign quiz is indistinguishable from a missing one.
    const [owned] = await this.ds.query(
      `SELECT 1 FROM path_lessons l JOIN path_modules m ON m.id = l.module_id JOIN learning_paths p ON p.id = m.path_id
       WHERE l.content_id = $1 AND p.user_id = $2 AND p.hidden_at IS NULL LIMIT 1`,
      [quiz.contentId, userId],
    );
    if (!owned) throw quizNotFound();
    const qs = quiz.questions;
    if (answers.length !== qs.length || answers.some((a, i) => a >= qs[i].options.length))
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_ANSWERS',
        message: 'One answer per question, within its options.',
      });
    const results = qs.map((q, i) => ({
      selected: answers[i],
      answer: q.answer,
      correct: answers[i] === q.answer,
      explanation: q.explanation,
    }));
    const correct = results.filter((r) => r.correct).length;
    const attempt = await this.ds.transaction(async (m) => {
      const saved = await m.save(
        m.create(QuizAttempt, {
          quizId,
          userId,
          answers,
          correct,
          total: qs.length,
        }),
      );
      await this.streak.record(m, userId);
      return saved;
    });
    return {
      id: attempt.id,
      correct,
      total: qs.length,
      results,
      streak: await this.streak.view(userId),
    };
  }
}
